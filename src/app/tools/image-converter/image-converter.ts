import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSliderModule } from '@angular/material/slider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgIcon } from '@ng-icons/core';

import { downloadBlob, fileStem } from '../../core/download';
import { formatBytes } from '../../core/format';
import { downloadZip, type ZipEntry } from '../../core/zip';
import { ImageCodecClient, type CodecFormat } from '../../core/image/image-codec.client';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Skeleton } from '../../shared/skeleton/skeleton';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';

/** One output format, as offered in the picker. */
interface FormatOption {
  value: CodecFormat;
  label: string;
  extension: string;
  /** False for PNG, whose encoder ignores quality entirely. */
  lossy: boolean;
  hint: string;
}

const FORMATS: readonly FormatOption[] = [
  {
    value: 'image/jpeg',
    label: 'JPEG',
    extension: 'jpg',
    lossy: true,
    hint: 'Universally supported. The safe choice for photos and for anything you have to send on.',
  },
  {
    value: 'image/png',
    label: 'PNG',
    extension: 'png',
    lossy: false,
    hint: 'Lossless, and the only format here that keeps transparency perfectly. Files are larger.',
  },
  {
    value: 'image/webp',
    label: 'WebP',
    extension: 'webp',
    lossy: true,
    hint: 'Roughly 30% smaller than JPEG at the same quality, and supported by every current browser.',
  },
  {
    value: 'image/avif',
    label: 'AVIF',
    extension: 'avif',
    lossy: true,
    hint: 'The smallest files of the four, but slower to encode and not readable everywhere yet.',
  },
];

/** Decoding happens in memory, so reject anything unreasonable up front. */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/** A ceiling on the queue, for the same reason. */
const MAX_FILES = 30;

/** How long to wait after the last option change before re-encoding. */
const SETTLE_MS = 120;

interface Output {
  bytes: Uint8Array;
  blob: Blob;
  url: string;
  size: number;
  name: string;
}

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
}

@Component({
  selector: 'app-image-converter',
  imports: [
    ToolPage,
    ToolContent,
    Dropzone,
    Spinner,
    Skeleton,
    MatButtonModule,
    MatSliderModule,
    NgIcon,
  ],
  templateUrl: './image-converter.html',
  styleUrls: ['../tool-shell.css', './image-converter.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageConverterTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly codec = new ImageCodecClient();

  protected readonly maxFiles = MAX_FILES;
  protected readonly formatBytes = formatBytes;

  // --- State ------------------------------------------------------------
  protected readonly items = signal<Item[]>([]);
  /** Files opened but not yet in the queue — a HEIC decoder download lands here. */
  protected readonly preparing = signal(0);

  // --- Options ----------------------------------------------------------
  protected readonly format = signal<CodecFormat>('image/jpeg');
  /** Encoding quality as a 0–1 fraction; the codecs take it as 1–100. */
  protected readonly quality = signal(0.82);

  /**
   * Formats this browser can actually write.
   *
   * AVIF is the only one in doubt, and it starts absent rather than present:
   * this page is prerendered, the check needs a worker, and offering a format
   * that then fails on click is worse than revealing it a moment later.
   */
  protected readonly available = signal<readonly FormatOption[]>(
    FORMATS.filter((option) => option.value !== 'image/avif'),
  );

  protected readonly qualityPercent = computed(() => Math.round(this.quality() * 100));
  protected readonly hasItems = computed(() => this.items().length > 0);
  protected readonly busy = computed(() => this.items().some((item) => item.working));

  protected readonly current = computed(
    () => FORMATS.find((option) => option.value === this.format()) ?? FORMATS[0],
  );
  /** PNG has no quality dial; showing a disabled slider would just puzzle people. */
  protected readonly showQuality = computed(() => this.current().lossy);

  protected readonly preparingRange = computed(() =>
    Array.from({ length: this.preparing() }, (_, index) => index),
  );

  /** Totals across the queue, for the summary line above the download button. */
  protected readonly totals = computed(() => {
    let original = 0;
    let converted = 0;
    let count = 0;
    for (const item of this.items()) {
      if (item.output) {
        original += item.size;
        converted += item.output.size;
        count++;
      }
    }
    const percent = original === 0 ? 0 : Math.round(((converted - original) / original) * 100);
    return { original, converted, count, percent };
  });

  private nextId = 0;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped whenever the queue gains a file, so the encode effect re-runs. */
  private readonly queueRevision = signal(0);

  constructor() {
    // Ask the worker what it can encode once the browser is running. Doing this
    // in afterNextRender rather than the field initialiser keeps the prerender —
    // which has no Worker at all — out of it.
    afterNextRender(() => void this.detectFormats());

    // Re-encode whenever the format, the quality or the queue changes. The
    // options are read first so the effect tracks them even on the run where
    // there is nothing queued yet.
    effect((onCleanup) => {
      const format = this.format();
      const quality = this.quality();
      this.queueRevision();

      const pending = untracked(() =>
        this.items().filter((item) => !item.working && item.error === null),
      );
      if (pending.length === 0) {
        return;
      }

      const timer = setTimeout(() => {
        for (const item of pending) {
          void this.convert(item, format, Math.round(quality * 100));
        }
      }, SETTLE_MS);
      this.settleTimer = timer;
      onCleanup(() => clearTimeout(timer));
    });
  }

  ngOnDestroy(): void {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
    }
    for (const item of this.items()) {
      URL.revokeObjectURL(item.previewUrl);
      if (item.output) {
        URL.revokeObjectURL(item.output.url);
      }
    }
    this.codec.terminate();
  }

  // --- Options ----------------------------------------------------------
  protected setFormat(format: CodecFormat): void {
    this.format.set(format);
  }

  protected onQualityChange(value: number): void {
    this.quality.set(value);
  }

  // --- Files ------------------------------------------------------------
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length > 0) {
      void this.addFiles(files);
    }
  }

  protected async addFiles(files: File[]): Promise<void> {
    const room = MAX_FILES - this.items().length;
    if (room <= 0) {
      this.showError(`The queue is full (limit ${MAX_FILES}).`);
      return;
    }
    if (files.length > room) {
      this.showError(`Only the first ${room} of those files were added (limit ${MAX_FILES}).`);
    }

    for (const file of files.slice(0, room)) {
      // A HEIC file often arrives with an empty `type`, so the name has to be
      // consulted too — converting HEIC is the main reason this tool exists.
      if (
        !file.type.startsWith('image/') &&
        !/\.(hei[cf]|jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name)
      ) {
        this.showError(`"${file.name}" is not an image and was skipped.`);
        continue;
      }
      if (file.size > MAX_INPUT_BYTES) {
        this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
        continue;
      }

      const id = `img-${this.nextId++}`;
      let opened;
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
      };

      // The first file picks a sensible target: a HEIC almost always wants to
      // become a JPEG, and a PNG is usually a graphic that gains most from WebP.
      if (this.items().length === 0) {
        this.format.set(opened.heic ? 'image/jpeg' : file.type === 'image/png' ? 'image/webp' : 'image/jpeg');
      }

      this.items.update((current) => [...current, item]);
      this.queueRevision.update((value) => value + 1);
      if (opened.heic) {
        void this.loadHeicPreview(item);
      }
    }
  }

  protected remove(id: string): void {
    const item = this.items().find((entry) => entry.id === id);
    if (item) {
      URL.revokeObjectURL(item.previewUrl);
      if (item.output) {
        URL.revokeObjectURL(item.output.url);
      }
    }
    this.items.update((current) => current.filter((entry) => entry.id !== id));
  }

  protected reset(): void {
    for (const item of this.items()) {
      URL.revokeObjectURL(item.previewUrl);
      if (item.output) {
        URL.revokeObjectURL(item.output.url);
      }
    }
    this.items.set([]);
    void this.codec.close();
  }

  // --- Downloads --------------------------------------------------------
  protected download(item: Item): void {
    if (item.output) {
      downloadBlob(item.output.blob, item.output.name);
    }
  }

  protected async downloadAll(): Promise<void> {
    const ready = this.items().filter((item) => item.output !== null);
    if (ready.length === 0) {
      return;
    }
    if (ready.length === 1) {
      this.download(ready[0]);
      return;
    }
    const entries: ZipEntry[] = ready.map((item) => ({
      name: (item.output as Output).name,
      bytes: (item.output as Output).bytes,
    }));
    try {
      await downloadZip(entries, 'converted-images.zip');
    } catch {
      this.showError('The images could not be packaged into a zip file.');
    }
  }

  // --- Internals --------------------------------------------------------

  /** Reveals AVIF only once the worker confirms this browser can write it. */
  private async detectFormats(): Promise<void> {
    try {
      const avif = await this.codec.supports('image/avif');
      if (avif) {
        this.available.set(FORMATS);
      }
    } catch {
      // No worker, so no encoding at all; the drop zone will report that.
    }
  }

  private async convert(item: Item, format: CodecFormat, quality: number): Promise<void> {
    this.patch(item.id, { working: true, error: null });
    try {
      const result = await this.codec.encode(item.id, item.file, {
        format,
        quality,
        maxDimension: 0,
        targetBytes: 0,
        // Converting is a format change, not a scrub: carry the Exif across
        // where the target format can hold it. The EXIF tool is where metadata
        // gets removed, and it says so explicitly.
        keepMetadata: true,
      });

      const option = FORMATS.find((entry) => entry.value === format) ?? FORMATS[0];
      const name = `${fileStem(item.name, 'image')}.${option.extension}`;
      const url = URL.createObjectURL(result.blob);

      const previous = this.items().find((entry) => entry.id === item.id);
      if (!previous) {
        URL.revokeObjectURL(url); // removed while we were encoding
        return;
      }
      if (previous.output) {
        URL.revokeObjectURL(previous.output.url);
      }

      this.patch(item.id, {
        working: false,
        error: null,
        output: {
          bytes: result.bytes,
          blob: result.blob,
          url,
          size: result.bytes.byteLength,
          name,
        },
      });
    } catch (error) {
      this.patch(item.id, {
        working: false,
        error: error instanceof Error ? error.message : 'This image could not be converted.',
        output: null,
      });
    }
  }

  /**
   * Swaps a HEIC item's preview for one the browser can actually display. The
   * blob URL made from the original file is useless to an `<img>`.
   */
  private async loadHeicPreview(item: Item): Promise<void> {
    try {
      const blob = await this.codec.preview(item.id, item.file);
      const url = URL.createObjectURL(blob);
      const current = this.items().find((entry) => entry.id === item.id);
      if (!current) {
        URL.revokeObjectURL(url);
        return;
      }
      URL.revokeObjectURL(current.previewUrl);
      this.patch(item.id, { previewUrl: url });
    } catch {
      // Leave the unrenderable URL in place; the alt text still names the file.
    }
  }

  private patch(id: string, changes: Partial<Item>): void {
    this.items.update((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 6000 });
  }

  /** Signed percentage change in size, for the per-item badge. */
  protected changePercent(item: Item): number {
    if (!item.output || item.size === 0) {
      return 0;
    }
    return Math.round(((item.output.size - item.size) / item.size) * 100);
  }
}
