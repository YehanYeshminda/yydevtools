import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { NgIcon } from '@ng-icons/core';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatSnackBar } from '@angular/material/snack-bar';

import { downloadBlob, fileStem } from '../../core/download';
import { formatBytes } from '../../core/format';
import { downloadZip, type ZipEntry } from '../../core/zip';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { Skeleton } from '../../shared/skeleton/skeleton';
import { Spinner } from '../../shared/spinner/spinner';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { ToolContent } from '../../shared/tool-content/tool-content';
import type { Metadata } from '../../core/image/exif';
import { ImageCodecClient, type CodecFormat } from '../../core/image/image-codec.client';

/** How the output size is chosen. */
export type SizeMode = 'quality' | 'target';

interface Output {
  bytes: Uint8Array;
  url: string;
  size: number;
  width: number;
  height: number;
  quality: number;
  targetMissed: boolean;
  keptMetadata: boolean;
}

/** One queued image and whatever is known about it so far. */
interface Item {
  id: string;
  file: File;
  name: string;
  size: number;
  width: number;
  height: number;
  previewUrl: string;
  heic: boolean;
  working: boolean;
  error: string | null;
  output: Output | null;
  metadata: Metadata | null;
}

/** Decoding happens in memory, so reject anything unreasonable up front. */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/** A ceiling on the queue, for the same reason. */
const MAX_FILES = 30;

/**
 * How long to wait after the last option change before re-encoding.
 *
 * Encoding is local, so this only has to outlast the gap between two slider
 * frames — short enough that the result feels immediate, long enough that
 * dragging across the track does not queue up an encode per step.
 */
const SETTLE_MS = 120;

/** Preset dimension caps offered in the "Resize" select. 0 means keep the original size. */
const SIZE_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: 'Original size' },
  { value: 3840, label: '3840 px (4K)' },
  { value: 1920, label: '1920 px (1080p)' },
  { value: 1280, label: '1280 px' },
  { value: 800, label: '800 px' },
  { value: 640, label: '640 px' },
];

@Component({
  selector: 'app-image-compressor',
  imports: [ToolPage, 
    Dropzone,
    ToolContent,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    NgIcon,
    MatSelectModule,
    MatSliderModule,
    Spinner,
    Skeleton,
  ],
  templateUrl: './image-compressor.html',
  styleUrls: ['../tool-shell.css', './image-compressor.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageCompressorTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly codec = new ImageCodecClient();

  protected readonly sizePresets = SIZE_PRESETS;
  protected readonly maxFiles = MAX_FILES;

  // --- State ------------------------------------------------------------
  protected readonly items = signal<Item[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly usingFallbackCodec = signal(false);

  // --- Options ----------------------------------------------------------
  protected readonly format = signal<CodecFormat>('image/jpeg');
  /** Encoding quality as a 0–1 fraction; the codecs take it as 1–100. */
  protected readonly quality = signal(0.8);
  protected readonly maxDimension = signal(0);
  protected readonly sizeMode = signal<SizeMode>('quality');
  /** Target size in kilobytes, for `sizeMode === 'target'`. */
  protected readonly targetKb = signal(200);
  protected readonly keepMetadata = signal(false);

  /** Split position of the before/after comparison, as a percentage. */
  protected readonly comparePosition = signal(50);

  /**
   * How many dropped files are being opened right now. Opening a HEIC pulls in
   * the ~3 MB decoder before the file can join the queue, so without this the UI
   * would sit unchanged for seconds after a drop. The template shows a skeleton
   * placeholder while it is above zero.
   */
  protected readonly preparing = signal(0);

  protected readonly qualityPercent = computed(() => Math.round(this.quality() * 100));
  protected readonly hasItems = computed(() => this.items().length > 0);
  /** Bars to draw in the "preparing" placeholder, capped so a big drop stays tidy. */
  protected readonly preparingRange = computed(() =>
    Array.from({ length: Math.min(this.preparing(), 3) }, (_, index) => index),
  );
  protected readonly busy = computed(() => this.items().some((item) => item.working));

  protected readonly selected = computed(
    () => this.items().find((item) => item.id === this.selectedId()) ?? null,
  );

  /** Metadata is only carried into JPEG; WebP would need a different container. */
  protected readonly metadataAvailable = computed(() => this.format() === 'image/jpeg');

  protected readonly done = computed(() => this.items().filter((item) => item.output !== null));

  protected readonly totals = computed(() => {
    const finished = this.done();
    const original = finished.reduce((sum, item) => sum + item.size, 0);
    const compressed = finished.reduce((sum, item) => sum + (item.output?.size ?? 0), 0);
    return {
      count: finished.length,
      original,
      compressed,
      percent: original === 0 ? 0 : Math.round(((compressed - original) / original) * 100),
    };
  });

  /** Guards against an older run overwriting a newer one. */
  private runToken = 0;
  private nextId = 0;

  /**
   * Bumped only when the *set* of files changes — never when a result lands.
   *
   * This is what the re-encode effect watches instead of `items`. Watching
   * `items` directly is a trap: the run writes each result back into that same
   * signal, which re-triggers the effect, which supersedes the run that is
   * still going. Nothing ever finishes.
   */
  private readonly queueRevision = signal(0);

  constructor() {
    // Re-encode the whole queue whenever an option changes.
    effect((onCleanup) => {
      const options = {
        format: this.format(),
        quality: this.quality(),
        maxDimension: this.maxDimension(),
        sizeMode: this.sizeMode(),
        targetKb: this.targetKb(),
        keepMetadata: this.keepMetadata(),
      };
      this.queueRevision();

      if (untracked(() => this.items()).length === 0) {
        return;
      }

      const handle = setTimeout(() => void this.runQueue(options), SETTLE_MS);
      onCleanup(() => clearTimeout(handle));
    });
  }

  ngOnDestroy(): void {
    for (const item of this.items()) {
      this.release(item);
    }
    this.codec.terminate();
  }

  // --- File selection ---------------------------------------------------
  /**
   * Still needed by the "Add more images" input inside the queue, which is a
   * plain labelled input rather than a drop target.
   */
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    // Copy out of the live FileList before resetting — clearing `input.value`
    // also empties `input.files`.
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (files.length) {
      void this.addFiles(files);
    }
  }

  protected async addFiles(files: File[]): Promise<void> {
    const room = MAX_FILES - this.items().length;
    if (room <= 0) {
      this.showError(`You can compress up to ${MAX_FILES} images at a time.`);
      return;
    }
    if (files.length > room) {
      this.showError(`Only the first ${room} of those files were added (limit ${MAX_FILES}).`);
    }

    for (const file of files.slice(0, room)) {
      // A HEIC file often arrives with an empty `type`, so the name has to be
      // consulted too — otherwise the very format this tool just learned to
      // read would be rejected at the door.
      if (!file.type.startsWith('image/') && !/\.(hei[cf]|jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name)) {
        this.showError(`"${file.name}" is not an image and was skipped.`);
        continue;
      }
      if (file.size > MAX_INPUT_BYTES) {
        this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
        continue;
      }

      const id = `img-${this.nextId++}`;
      let opened;
      // Count this file as "preparing" across the open() await — for HEIC that
      // await is where the 3 MB decoder downloads, and the skeleton keyed off
      // this is the only sign of life until the item lands in the queue.
      this.preparing.update((count) => count + 1);
      try {
        opened = await this.codec.open(id, file);
      } catch {
        this.showError(`"${file.name}" could not be read. It may be corrupt or unsupported.`);
        continue;
      } finally {
        this.preparing.update((count) => count - 1);
      }

      const item: Item = {
        id,
        file,
        name: file.name,
        size: file.size,
        width: opened.width,
        height: opened.height,
        previewUrl: URL.createObjectURL(file),
        heic: opened.heic,
        working: false,
        error: null,
        output: null,
        metadata: null,
      };

      // The first file added picks the default output format: WebP for PNGs,
      // which are usually screenshots or graphics, JPEG for photographs.
      if (this.items().length === 0) {
        this.format.set(file.type === 'image/png' ? 'image/webp' : 'image/jpeg');
      }

      this.items.update((current) => [...current, item]);
      this.queueRevision.update((value) => value + 1);
      this.selectedId.update((current) => current ?? id);
      void this.loadMetadata(item);
      if (opened.heic) {
        void this.loadHeicPreview(item);
      }
    }
  }

  /**
   * Reads the source's Exif. Failure is silent by design: a PNG or a stripped
   * JPEG legitimately has none, and that is not something to interrupt anyone
   * over.
   */
  private async loadMetadata(item: Item): Promise<void> {
    try {
      const [{ load }, { summarise }] = await Promise.all([
        import('exifreader'),
        import('../../core/image/exif'),
      ]);
      const tags = await load(item.file, { async: true, expanded: false });
      const metadata = summarise(tags as never);
      if (metadata.rows.length > 0) {
        this.patch(item.id, { metadata });
      }
    } catch {
      // No readable metadata.
    }
  }

  /**
   * Swaps a HEIC item's preview for one the browser can actually display.
   *
   * The blob URL made from the original file is useless to an `<img>`, so it is
   * replaced — and revoked — as soon as the worker has rendered a JPEG copy.
   */
  private async loadHeicPreview(item: Item): Promise<void> {
    try {
      const blob = await this.codec.preview(item.id, item.file);
      const url = URL.createObjectURL(blob);
      const current = this.items().find((entry) => entry.id === item.id);
      if (!current) {
        URL.revokeObjectURL(url); // removed while we were rendering
        return;
      }
      URL.revokeObjectURL(current.previewUrl);
      this.patch(item.id, { previewUrl: url });
    } catch {
      // Leave the unrenderable URL in place; the alt text still names the file.
    }
  }

  // --- Option handlers --------------------------------------------------
  protected setFormat(format: CodecFormat): void {
    this.format.set(format);
  }

  protected onQualityChange(value: number): void {
    this.quality.set(value);
  }

  protected onMaxDimensionChange(value: number): void {
    this.maxDimension.set(value);
  }

  protected setSizeMode(mode: SizeMode): void {
    this.sizeMode.set(mode);
  }

  protected onTargetKbInput(event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(parsed)) {
      this.targetKb.set(Math.min(20_000, Math.max(5, Math.round(parsed))));
    }
  }

  protected toggleKeepMetadata(): void {
    this.keepMetadata.update((value) => !value);
  }

  protected onCompareInput(event: Event): void {
    this.comparePosition.set(Number((event.target as HTMLInputElement).value));
  }

  protected select(id: string): void {
    this.selectedId.set(id);
  }

  // --- Encoding ---------------------------------------------------------
  private async runQueue(options: {
    format: CodecFormat;
    quality: number;
    maxDimension: number;
    sizeMode: SizeMode;
    targetKb: number;
    keepMetadata: boolean;
  }): Promise<void> {
    const token = ++this.runToken;

    for (const item of this.items()) {
      if (token !== this.runToken) {
        return; // superseded
      }
      this.patch(item.id, { working: true, error: null });

      try {
        const result = await this.codec.encode(item.id, item.file, {
          format: options.format,
          quality: Math.round(options.quality * 100),
          maxDimension: options.maxDimension,
          targetBytes: options.sizeMode === 'target' ? options.targetKb * 1024 : 0,
          keepMetadata: options.keepMetadata,
        });
        if (token !== this.runToken) {
          return;
        }
        this.usingFallbackCodec.set(result.codec === 'canvas');
        this.setOutput(item.id, {
          bytes: result.bytes,
          url: URL.createObjectURL(result.blob),
          size: result.blob.size,
          width: result.width,
          height: result.height,
          quality: result.quality,
          targetMissed: result.targetMissed,
          keptMetadata: result.keptMetadata,
        });
      } catch (error) {
        if (token !== this.runToken) {
          return;
        }
        this.patch(item.id, {
          working: false,
          error: error instanceof Error ? error.message : 'That image could not be compressed.',
        });
      }
    }
  }

  /** Replace an item's output, releasing the URL the previous one held. */
  private setOutput(id: string, output: Output): void {
    this.items.update((current) =>
      current.map((item) => {
        if (item.id !== id) {
          return item;
        }
        if (item.output) {
          URL.revokeObjectURL(item.output.url);
        }
        return { ...item, output, working: false, error: null };
      }),
    );
  }

  private patch(id: string, changes: Partial<Item>): void {
    this.items.update((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }

  // --- Output actions ---------------------------------------------------
  protected download(item: Item): void {
    if (!item.output) {
      return;
    }
    downloadBlob(
      new Blob([item.output.bytes.slice()], { type: this.format() }),
      this.outputName(item),
    );
  }

  protected async downloadAll(): Promise<void> {
    const entries: ZipEntry[] = this.done().map((item) => ({
      name: this.outputName(item),
      bytes: item.output!.bytes,
    }));
    if (entries.length === 0) {
      return;
    }
    if (entries.length === 1) {
      this.download(this.done()[0]);
      return;
    }
    try {
      await downloadZip(entries, 'compressed-images.zip');
    } catch (error) {
      this.showError(
        error instanceof Error ? error.message : 'Could not build the archive.',
      );
    }
  }

  protected remove(id: string): void {
    const item = this.items().find((entry) => entry.id === id);
    if (item) {
      this.release(item);
    }
    this.items.update((current) => current.filter((entry) => entry.id !== id));
    this.queueRevision.update((value) => value + 1);
    if (this.selectedId() === id) {
      this.selectedId.set(this.items()[0]?.id ?? null);
    }
  }

  protected reset(): void {
    for (const item of this.items()) {
      this.release(item);
    }
    this.items.set([]);
    this.queueRevision.update((value) => value + 1);
    this.selectedId.set(null);
    void this.codec.close();
  }

  // --- Helpers ----------------------------------------------------------
  protected formatBytes(bytes: number): string {
    return formatBytes(bytes);
  }

  protected savedPercent(item: Item): number {
    if (!item.output || item.size === 0) {
      return 0;
    }
    return Math.round(((item.output.size - item.size) / item.size) * 100);
  }

  private outputName(item: Item): string {
    const ext = this.format() === 'image/webp' ? 'webp' : 'jpg';
    return `${fileStem(item.name, 'image')}-compressed.${ext}`;
  }

  private release(item: Item): void {
    URL.revokeObjectURL(item.previewUrl);
    if (item.output) {
      URL.revokeObjectURL(item.output.url);
    }
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  }
}
