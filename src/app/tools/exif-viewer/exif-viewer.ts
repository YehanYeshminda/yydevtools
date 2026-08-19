import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { downloadBytes, fileStem } from '../../core/download';
import { formatBytes } from '../../core/format';
import { ImageCodecClient } from '../../core/image/image-codec.client';
import type { MetadataReport } from '../../core/image/metadata';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Skeleton } from '../../shared/skeleton/skeleton';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';

/** Reading a header is cheap, but the preview decodes, so cap the input. */
const MAX_INPUT_BYTES = 50 * 1024 * 1024;

/** The cleaned copy of the file, once the metadata has been removed. */
interface Stripped {
  bytes: Uint8Array;
  name: string;
  size: number;
  /** Bytes removed, which is what people want to see confirmed. */
  saved: number;
}

@Component({
  selector: 'app-exif-viewer',
  imports: [ToolPage, ToolContent, Dropzone, Skeleton, MatButtonModule, RouterLink, NgIcon],
  templateUrl: './exif-viewer.html',
  styleUrls: ['../tool-shell.css', './exif-viewer.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExifViewerTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly clipboard = inject(ClipboardService);
  private readonly codec = new ImageCodecClient();

  protected readonly formatBytes = formatBytes;

  // --- State ------------------------------------------------------------
  protected readonly name = signal('');
  protected readonly size = signal(0);
  protected readonly width = signal(0);
  protected readonly height = signal(0);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly report = signal<MetadataReport | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly stripped = signal<Stripped | null>(null);
  /**
   * True when the file has metadata but is in a container this cannot edit
   * losslessly (WebP, AVIF, HEIC). Saying so is better than silently offering
   * nothing, or than re-encoding and quietly degrading the image.
   */
  protected readonly stripUnsupported = signal(false);

  protected readonly hasFile = computed(() => this.name() !== '');
  protected readonly hasMetadata = computed(() => (this.report()?.count ?? 0) > 0);
  protected readonly location = computed(() => this.report()?.location ?? null);

  private currentBytes: Uint8Array | null = null;
  private nextId = 0;

  ngOnDestroy(): void {
    this.revokePreview();
    this.codec.terminate();
  }

  // --- Input ------------------------------------------------------------
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length > 0) {
      void this.inspect(files);
    }
  }

  protected async inspect(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) {
      return;
    }
    if (
      !file.type.startsWith('image/') &&
      !/\.(hei[cf]|jpe?g|png|webp|gif|bmp|avif|tiff?)$/i.test(file.name)
    ) {
      this.showError(`"${file.name}" is not an image.`);
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
      return;
    }

    this.reset();
    this.loading.set(true);
    this.name.set(file.name);
    this.size.set(file.size);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      this.currentBytes = bytes;

      // Metadata and pixels are read independently: a file whose image data is
      // unreadable here (an exotic HEIC, say) can still have perfectly legible
      // Exif, and that is what this tool is for.
      await Promise.all([this.readMetadata(file), this.readPixels(file)]);
      this.prepareStripped(file, bytes);
    } catch {
      this.error.set('This file could not be read.');
    } finally {
      this.loading.set(false);
    }
  }

  protected reset(): void {
    this.revokePreview();
    this.name.set('');
    this.size.set(0);
    this.width.set(0);
    this.height.set(0);
    this.report.set(null);
    this.error.set(null);
    this.stripped.set(null);
    this.stripUnsupported.set(false);
    this.currentBytes = null;
    void this.codec.close();
  }

  // --- Actions ----------------------------------------------------------
  protected downloadClean(): void {
    const clean = this.stripped();
    if (clean) {
      downloadBytes(clean.bytes, clean.name, 'application/octet-stream');
    }
  }

  protected copyLocation(): void {
    const place = this.location();
    if (place) {
      void this.clipboard.copy(`${place.latitude}, ${place.longitude}`, {
        message: 'Coordinates copied to clipboard',
      });
    }
  }

  protected copyAll(): void {
    const current = this.report();
    if (!current) {
      return;
    }
    const lines: string[] = [];
    for (const group of current.groups) {
      lines.push(`# ${group.name}`);
      for (const field of group.fields) {
        lines.push(`${field.label}: ${field.value}`);
      }
      lines.push('');
    }
    void this.clipboard.copy(lines.join('\n').trim(), { message: 'Metadata copied to clipboard' });
  }

  // --- Internals --------------------------------------------------------
  private async readMetadata(file: File): Promise<void> {
    try {
      const [{ load }, { report }] = await Promise.all([
        import('exifreader'),
        import('../../core/image/metadata'),
      ]);
      const tags = await load(file, { async: true, expanded: false });
      this.report.set(report(tags as never));
    } catch {
      // A file with no readable metadata is the good outcome, not an error.
      this.report.set(null);
    }
  }

  /** Dimensions and a renderable preview, including for HEIC. */
  private async readPixels(file: File): Promise<void> {
    const id = `exif-${this.nextId++}`;
    try {
      const opened = await this.codec.open(id, file);
      this.width.set(opened.width);
      this.height.set(opened.height);
      if (opened.heic) {
        const blob = await this.codec.preview(id, file);
        this.setPreview(URL.createObjectURL(blob));
      } else {
        this.setPreview(URL.createObjectURL(file));
      }
    } catch {
      // Unreadable pixels are survivable — the metadata is the point here.
      this.setPreview(URL.createObjectURL(file));
    }
  }

  /**
   * Builds the cleaned copy up front, so the button can state exactly how many
   * bytes it will remove instead of promising something unverified.
   */
  private prepareStripped(file: File, bytes: Uint8Array): void {
    void import('../../core/image/metadata').then(({ stripMetadata }) => {
      const clean = stripMetadata(bytes);
      if (!clean) {
        // Nothing removable: either the file is already clean, or it is a
        // container this does not edit. Only the latter is worth reporting.
        this.stripUnsupported.set(this.hasMetadata());
        return;
      }
      const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1) : 'jpg';
      this.stripped.set({
        bytes: clean,
        name: `${fileStem(file.name, 'image')}-clean.${extension}`,
        size: clean.byteLength,
        saved: bytes.byteLength - clean.byteLength,
      });
    });
  }

  private setPreview(url: string): void {
    this.revokePreview();
    this.previewUrl.set(url);
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.previewUrl.set(null);
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 6000 });
  }
}
