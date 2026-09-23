import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { downloadBlob } from '../../core/download';
import { formatBytes } from '../../core/format';
import { ImageCodecClient } from '../../core/image/image-codec.client';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { OpenIn } from '../../shared/open-in/open-in';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { TryExample } from '../../shared/try-example/try-example';
import { labelForMime } from '../base64/base64-codec';
import { decodePasted, isHeic, isImage, zoomIn, zoomOut } from './image-view';

/** Decoding is the expensive part, and it happens on the main thread for <img>. */
const MAX_INPUT_BYTES = 50 * 1024 * 1024;

/** A 24×24 PNG with a soft transparent edge, so the checkerboard has something to show. */
const EXAMPLE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAUklEQVR42mNgGBHg/0n/' +
  'BmyYZgZTbBEWQ/7jwKRbRKTBOC0ixYL/JGLCFlBgOHGW0NQCKhiO35JRC0aABUM/H9ClqKBLYUfz4pouFQ7dqswhAQDn' +
  'Q5nCELxP6wAAAABJRU5ErkJggg==';

interface Source {
  bytes: Uint8Array<ArrayBuffer>;
  mime: string;
  name: string;
}

@Component({
  selector: 'app-image-viewer',
  imports: [ToolPage, ToolContent, Dropzone, OpenIn, TryExample, MatButtonModule, NgIcon],
  templateUrl: './image-viewer.html',
  styleUrls: ['../tool-shell.css', './image-viewer.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageViewerTool implements OnDestroy {
  private readonly codec = new ImageCodecClient();
  private nextId = 0;

  protected readonly formatBytes = formatBytes;

  protected readonly source = signal<Source | null>(null);
  protected readonly url = signal<string | null>(null);
  protected readonly width = signal(0);
  protected readonly height = signal(0);
  protected readonly error = signal<string | null>(null);
  /** Something that decoded fine but is not an image — offered to the right tool instead. */
  protected readonly other = signal<Source | null>(null);

  /** Fit shrinks a large image into the pane; off, it is drawn at `zoom` × actual size. */
  protected readonly fit = signal(true);
  protected readonly zoom = signal(1);
  protected readonly checker = signal(false);

  protected readonly format = computed(() => {
    const source = this.source();
    return source ? labelForMime(source.mime || 'image/') : '';
  });
  /** Width in CSS pixels when not fitting; null leaves it to the fit rules. */
  protected readonly drawnWidth = computed(() =>
    this.fit() || !this.width() ? null : Math.round(this.width() * this.zoom()),
  );
  protected readonly zoomLabel = computed(() =>
    this.fit() ? 'Fit' : `${Math.round(this.zoom() * 100)}%`,
  );

  ngOnDestroy(): void {
    this.revoke();
    this.codec.terminate();
  }

  // --- Input ------------------------------------------------------------
  protected async openFiles(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) {
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.fail(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await this.show({ bytes, mime: file.type, name: file.name });
  }

  protected async onPaste(event: Event): Promise<void> {
    const text = (event.target as HTMLTextAreaElement).value;
    if (!text.trim()) {
      return;
    }
    const decoded = decodePasted(text);
    if (!decoded) {
      this.fail('That is not valid Base64 or a data URI.');
      return;
    }
    const ext = decoded.mime.split('/')[1]?.replace('svg+xml', 'svg').replace('jpeg', 'jpg');
    await this.show({ ...decoded, name: `pasted.${ext || 'bin'}` });
  }

  protected loadExample(): void {
    const decoded = decodePasted(EXAMPLE)!;
    void this.show({ ...decoded, name: 'example.png' });
  }

  private async show(source: Source): Promise<void> {
    this.clear();
    if (!isImage(source.mime, source.name)) {
      this.other.set(source);
      this.error.set(
        `That is ${labelForMime(source.mime || 'application/octet-stream')}, not an image.`,
      );
      return;
    }
    this.source.set(source);
    const blob = new Blob([source.bytes], { type: source.mime });
    if (!isHeic(source.mime, source.name)) {
      this.url.set(URL.createObjectURL(blob));
      return;
    }
    // A browser cannot draw HEIC, so show a JPEG rendering of it instead.
    const id = `view-${this.nextId++}`;
    const file = new File([blob], source.name, { type: source.mime });
    try {
      const opened = await this.codec.open(id, file);
      this.width.set(opened.width);
      this.height.set(opened.height);
      this.url.set(URL.createObjectURL(await this.codec.preview(id, file)));
    } catch {
      this.fail(`"${source.name}" could not be decoded.`);
    }
  }

  /** The drawn image reports its own size, except for HEIC where the codec did. */
  protected onLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (!this.width()) {
      this.width.set(img.naturalWidth);
      this.height.set(img.naturalHeight);
    }
  }

  protected onImageError(): void {
    const name = this.source()?.name ?? 'That file';
    this.fail(`${name} could not be drawn — it may be damaged, or a format this browser lacks.`);
  }

  // --- View -------------------------------------------------------------
  protected toggleFit(): void {
    this.fit.update((on) => !on);
  }

  protected actualSize(): void {
    this.fit.set(false);
    this.zoom.set(1);
  }

  protected zoomBy(direction: 1 | -1): void {
    this.fit.set(false);
    this.zoom.update((current) => (direction > 0 ? zoomIn(current) : zoomOut(current)));
  }

  protected toggleChecker(): void {
    this.checker.update((on) => !on);
  }

  // --- Output -----------------------------------------------------------
  protected download(): void {
    const source = this.source();
    if (source) {
      downloadBlob(new Blob([source.bytes], { type: source.mime }), source.name);
    }
  }

  protected clear(): void {
    this.revoke();
    this.source.set(null);
    this.other.set(null);
    this.error.set(null);
    this.width.set(0);
    this.height.set(0);
    this.fit.set(true);
    this.zoom.set(1);
  }

  private fail(message: string): void {
    this.clear();
    this.error.set(message);
  }

  private revoke(): void {
    const url = this.url();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.url.set(null);
  }
}
