import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';

/** Output formats we can re-encode to. Both are widely supported and lossy. */
type OutputFormat = 'image/jpeg' | 'image/webp';

/** The source image, decoded once and kept for repeated re-encoding. */
interface Source {
  name: string;
  type: string;
  size: number;
  width: number;
  height: number;
  previewUrl: string;
  bitmap: ImageBitmap;
}

/** The most recent compression output. */
interface Output {
  blob: Blob;
  url: string;
  size: number;
  width: number;
  height: number;
}

/** Reject anything larger than this up front — big images can exhaust device memory. */
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

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
  imports: [
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSliderModule,
  ],
  templateUrl: './image-compressor.html',
  styleUrl: './image-compressor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageCompressorTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);

  protected readonly sizePresets = SIZE_PRESETS;

  // --- State ------------------------------------------------------------
  protected readonly source = signal<Source | null>(null);
  protected readonly output = signal<Output | null>(null);
  protected readonly processing = signal(false);

  protected readonly format = signal<OutputFormat>('image/jpeg');
  /** Encoding quality as a 0–1 fraction, as `canvas.toBlob` expects. */
  protected readonly quality = signal(0.8);
  /** Longest-edge cap in pixels; 0 keeps the original dimensions. */
  protected readonly maxDimension = signal(0);

  protected readonly qualityPercent = computed(() => Math.round(this.quality() * 100));

  /** Change in size, as a signed percentage (negative = smaller output). */
  protected readonly savedPercent = computed(() => {
    const src = this.source();
    const out = this.output();
    if (!src || !out || src.size === 0) {
      return 0;
    }
    return Math.round(((out.size - src.size) / src.size) * 100);
  });

  /** Guards against an older async encode overwriting a newer one. */
  private encodeToken = 0;

  constructor() {
    // Re-encode whenever the source or any option changes. A short debounce keeps
    // dragging the quality slider smooth instead of encoding on every tick.
    effect((onCleanup) => {
      const src = this.source();
      if (!src) {
        return;
      }
      const format = this.format();
      const quality = this.quality();
      const maxDimension = this.maxDimension();

      const handle = setTimeout(() => {
        void this.encode(src, format, quality, maxDimension);
      }, 150);
      onCleanup(() => clearTimeout(handle));
    });
  }

  ngOnDestroy(): void {
    this.releaseSource();
    this.releaseOutput();
  }

  // --- File selection ---------------------------------------------------
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so picking the same file again still fires (change).
    input.value = '';
    if (file) {
      void this.loadFile(file);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void this.loadFile(file);
    }
  }

  protected readonly dragOver = signal(false);

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  protected onDragLeave(): void {
    this.dragOver.set(false);
  }

  private async loadFile(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) {
      this.showError('That file is not an image.');
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.showError(`That image is too large. The maximum size is ${formatBytes(MAX_INPUT_BYTES)}.`);
      return;
    }

    let bitmap: ImageBitmap;
    try {
      // `from-image` honours EXIF orientation so phone photos are not sideways.
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      this.showError('Could not read that image. It may be corrupt or an unsupported format.');
      return;
    }

    this.releaseSource();
    this.releaseOutput();
    this.output.set(null);

    // Default the output format to WebP for PNGs (which are often screenshots or
    // graphics), and JPEG for everything else.
    this.format.set(file.type === 'image/png' ? 'image/webp' : 'image/jpeg');

    this.source.set({
      name: file.name,
      type: file.type,
      size: file.size,
      width: bitmap.width,
      height: bitmap.height,
      previewUrl: URL.createObjectURL(file),
      bitmap,
    });
  }

  // --- Encoding ---------------------------------------------------------
  private async encode(
    src: Source,
    format: OutputFormat,
    quality: number,
    maxDimension: number,
  ): Promise<void> {
    const token = ++this.encodeToken;
    this.processing.set(true);
    try {
      const { blob, width, height } = await encodeImage(src.bitmap, format, quality, maxDimension);
      if (token !== this.encodeToken) {
        return; // superseded by a newer request
      }
      if (!blob) {
        this.showError('Could not compress that image.');
        return;
      }
      this.setOutput(blob, width, height);
    } catch {
      if (token === this.encodeToken) {
        this.showError('Could not compress that image.');
      }
    } finally {
      if (token === this.encodeToken) {
        this.processing.set(false);
      }
    }
  }

  private setOutput(blob: Blob, width: number, height: number): void {
    this.releaseOutput();
    this.output.set({ blob, url: URL.createObjectURL(blob), size: blob.size, width, height });
  }

  // --- Option handlers --------------------------------------------------
  protected setFormat(format: OutputFormat): void {
    this.format.set(format);
  }

  protected onQualityChange(value: number): void {
    this.quality.set(value);
  }

  protected onMaxDimensionChange(value: number): void {
    this.maxDimension.set(value);
  }

  // --- Output actions ---------------------------------------------------
  protected download(): void {
    const src = this.source();
    const out = this.output();
    if (!src || !out) {
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = out.url;
    anchor.download = outputFileName(src.name, this.format());
    anchor.click();
  }

  protected reset(): void {
    this.releaseSource();
    this.releaseOutput();
    this.source.set(null);
    this.output.set(null);
  }

  // --- Helpers ----------------------------------------------------------
  protected formatBytes(bytes: number): string {
    return formatBytes(bytes);
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  }

  private releaseSource(): void {
    const src = this.source();
    if (src) {
      URL.revokeObjectURL(src.previewUrl);
      src.bitmap.close();
    }
  }

  private releaseOutput(): void {
    const out = this.output();
    if (out) {
      URL.revokeObjectURL(out.url);
    }
  }
}

// --- Pure helpers -------------------------------------------------------
async function encodeImage(
  bitmap: ImageBitmap,
  format: OutputFormat,
  quality: number,
  maxDimension: number,
): Promise<{ blob: Blob | null; width: number; height: number }> {
  let { width, height } = bitmap;
  if (maxDimension > 0 && (width > maxDimension || height > maxDimension)) {
    const scale = Math.min(maxDimension / width, maxDimension / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { blob: null, width, height };
  }

  // JPEG has no alpha channel, so flatten transparency onto white to avoid a
  // black background. WebP keeps alpha, so it can be drawn as-is.
  if (format === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, format, quality);
  });
  return { blob, width, height };
}

function outputFileName(originalName: string, format: OutputFormat): string {
  const ext = format === 'image/webp' ? 'webp' : 'jpg';
  const base = originalName.replace(/\.[^.]+$/, '') || 'image';
  return `${base}-compressed.${ext}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded =
    value >= 10 || Number.isInteger(value) ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}
