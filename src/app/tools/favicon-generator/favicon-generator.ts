import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { fileStem } from '../../core/download';
import { formatBytes } from '../../core/format';
import { ImageCodecClient } from '../../core/image/image-codec.client';
import { downloadZip, type ZipEntry } from '../../core/zip';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import {
  ICON_SPECS,
  ICO_SIZES,
  encodeIco,
  headSnippet,
  manifestJson,
  shortNameFor,
  type IconSpec,
} from './icon-set';

interface RenderedIcon {
  spec: IconSpec;
  url: string;
  bytes: Uint8Array;
}

const MAX_INPUT_BYTES = 40 * 1024 * 1024;

@Component({
  selector: 'app-favicon-generator',
  imports: [ToolPage, ToolContent, Dropzone, Spinner, MatButtonModule, MatCheckboxModule, NgIcon],
  templateUrl: './favicon-generator.html',
  styleUrls: ['../tool-shell.css', './favicon-generator.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaviconGeneratorTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly clipboard = inject(ClipboardService);
  /** Only for HEIC, which no <img> can draw; everything else decodes natively. */
  private readonly codec = new ImageCodecClient();

  protected readonly sourceName = signal('');
  protected readonly sourceUrl = signal('');
  protected readonly sourceSize = signal('');
  protected readonly svg = signal<Uint8Array | null>(null);
  protected readonly name = signal('My App');
  protected readonly shortNameEdited = signal(false);
  protected readonly shortNameValue = signal('');
  protected readonly theme = signal('#111111');
  protected readonly background = signal('#ffffff');
  protected readonly fillAll = signal(false);
  protected readonly icons = signal<RenderedIcon[]>([]);
  protected readonly opening = signal(false);
  protected readonly building = signal(false);

  protected readonly shortName = computed(() =>
    this.shortNameEdited() ? this.shortNameValue() : shortNameFor(this.name()),
  );
  protected readonly hasSource = computed(() => this.sourceUrl() !== '');
  protected readonly ready = computed(() => this.icons().length > 0 && !this.building());
  protected readonly siteOptions = computed(() => ({
    name: this.name(),
    shortName: this.shortName(),
    theme: this.theme(),
    background: this.background(),
    svg: this.svg() !== null,
  }));
  protected readonly snippet = computed(() => headSnippet(this.siteOptions()));

  private image: HTMLImageElement | null = null;
  private run = 0;

  ngOnDestroy(): void {
    this.revoke();
    void this.codec.close();
  }

  // --- Source ----------------------------------------------------------------
  protected async open(files: File[]): Promise<void> {
    const file = files[0];
    if (file.size > MAX_INPUT_BYTES) {
      this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
      return;
    }
    this.opening.set(true);
    try {
      const image = await this.decode(file);
      this.revoke();
      this.image = image;
      this.sourceName.set(file.name);
      this.sourceUrl.set(image.src);
      this.sourceSize.set(`${image.naturalWidth} × ${image.naturalHeight} px`);
      const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
      this.svg.set(isSvg ? new Uint8Array(await file.arrayBuffer()) : null);
      await this.render();
    } catch {
      this.showError(`"${file.name}" could not be read. It may be corrupt or unsupported.`);
    } finally {
      this.opening.set(false);
    }
  }

  private async decode(file: File): Promise<HTMLImageElement> {
    const load = async (blob: Blob) => {
      const image = new Image();
      image.src = URL.createObjectURL(blob);
      try {
        await image.decode();
      } catch (error) {
        URL.revokeObjectURL(image.src);
        throw error;
      }
      return image;
    };
    try {
      return await load(file);
    } catch (error) {
      if (!/\.hei[cf]$/i.test(file.name) && !/hei[cf]/.test(file.type)) {
        throw error;
      }
      const id = `icon-${this.run}`;
      await this.codec.open(id, file);
      return load(await this.codec.preview(id, file));
    }
  }

  // --- Options ---------------------------------------------------------------
  protected onName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  protected onShortName(event: Event): void {
    this.shortNameEdited.set(true);
    this.shortNameValue.set((event.target as HTMLInputElement).value);
  }

  protected onTheme(event: Event): void {
    this.theme.set((event.target as HTMLInputElement).value);
  }

  protected onBackground(event: Event): void {
    this.background.set((event.target as HTMLInputElement).value);
    void this.render();
  }

  protected setFillAll(fill: boolean): void {
    this.fillAll.set(fill);
    void this.render();
  }

  // --- Rendering -------------------------------------------------------------
  /** Every size from the one source: contain-fit, centred, optionally on a colour. */
  private async render(): Promise<void> {
    const image = this.image;
    if (!image) {
      return;
    }
    const run = ++this.run;
    this.building.set(true);
    const rendered: RenderedIcon[] = [];
    for (const spec of ICON_SPECS) {
      const blob = await this.draw(image, spec);
      if (run !== this.run) {
        return;
      }
      rendered.push({
        spec,
        url: URL.createObjectURL(blob),
        bytes: new Uint8Array(await blob.arrayBuffer()),
      });
    }
    for (const icon of this.icons()) {
      URL.revokeObjectURL(icon.url);
    }
    this.icons.set(rendered);
    this.building.set(false);
  }

  private draw(image: HTMLImageElement, spec: IconSpec): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = spec.size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('no canvas');
    }
    if (spec.fill || this.fillAll()) {
      ctx.fillStyle = this.background();
      ctx.fillRect(0, 0, spec.size, spec.size);
    }
    const box = spec.size * spec.scale;
    const width = image.naturalWidth || spec.size;
    const height = image.naturalHeight || spec.size;
    const scale = Math.min(box / width, box / height);
    const w = width * scale;
    const h = height * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, (spec.size - w) / 2, (spec.size - h) / 2, w, h);
    return new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode'))), 'image/png'),
    );
  }

  // --- Output ----------------------------------------------------------------
  protected async download(): Promise<void> {
    const icons = this.icons();
    const png = (size: number) => icons.find((icon) => icon.spec.size === size && !icon.spec.fill);
    const ico = ICO_SIZES.map((size) => ({ size, png: png(size)?.bytes ?? new Uint8Array() }));
    const encoder = new TextEncoder();
    const entries: ZipEntry[] = [
      ...icons.map((icon) => ({ name: icon.spec.name, bytes: icon.bytes })),
      { name: 'favicon.ico', bytes: encodeIco(ico) },
      { name: 'site.webmanifest', bytes: encoder.encode(manifestJson(this.siteOptions())) },
      { name: 'head-snippet.html', bytes: encoder.encode(this.snippet()) },
    ];
    const svg = this.svg();
    if (svg) {
      entries.push({ name: 'icon.svg', bytes: svg });
    }
    try {
      await downloadZip(entries, `${fileStem(this.sourceName(), 'icons')}-favicons.zip`);
    } catch (error) {
      this.showError((error as Error).message);
    }
  }

  protected copySnippet(): void {
    void this.clipboard.copy(this.snippet(), { label: 'Head snippet' });
  }

  protected clear(): void {
    this.run++;
    this.revoke();
    this.image = null;
    this.sourceName.set('');
    this.sourceUrl.set('');
    this.svg.set(null);
    this.icons.set([]);
    this.building.set(false);
  }

  private revoke(): void {
    if (this.image) {
      URL.revokeObjectURL(this.image.src);
    }
    for (const icon of this.icons()) {
      URL.revokeObjectURL(icon.url);
    }
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 6000, panelClass: 'snack-error' });
  }
}
