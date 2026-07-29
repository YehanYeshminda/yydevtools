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
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { formatBytes } from '../../core/format';
import { Spinner } from '../../shared/spinner/spinner';
import { ImageCodecClient } from './image-codec.client';
import type { CodecFormat } from './image-codec.worker';
import { ToolContent } from '../../shared/tool-content/tool-content';

/** The source image: what we need to show it and describe it. */
interface Source {
  name: string;
  size: number;
  width: number;
  height: number;
  previewUrl: string;
}

/** The most recent compression output. */
interface Output {
  blob: Blob;
  url: string;
  size: number;
  width: number;
  height: number;
}

/** Decoding happens in memory, so reject anything unreasonable up front. */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/**
 * How long to wait after the last option change before re-encoding.
 *
 * Encoding is now local, so this only has to outlast the gap between two slider
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
  imports: [ToolContent, 
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatSliderModule,
    Spinner,
  ],
  templateUrl: './image-compressor.html',
  styleUrl: './image-compressor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageCompressorTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly codec = new ImageCodecClient();

  protected readonly sizePresets = SIZE_PRESETS;

  // --- State ------------------------------------------------------------
  protected readonly source = signal<Source | null>(null);
  protected readonly output = signal<Output | null>(null);
  protected readonly processing = signal(false);

  protected readonly format = signal<CodecFormat>('image/jpeg');
  /** Encoding quality as a 0–1 fraction; the codecs take it as 1–100. */
  protected readonly quality = signal(0.8);
  /** Longest-edge cap in pixels; 0 keeps the original dimensions. */
  protected readonly maxDimension = signal(0);

  /** True once an encode has come back from the browser's encoder instead. */
  protected readonly usingFallbackCodec = signal(false);

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

  /** Guards against an older encode overwriting a newer one. */
  private encodeToken = 0;

  constructor() {
    // Re-encode whenever the source or any option changes.
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
      }, SETTLE_MS);
      onCleanup(() => clearTimeout(handle));
    });
  }

  ngOnDestroy(): void {
    this.releaseSource();
    this.releaseOutput();
    this.codec.terminate();
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
      this.showError(
        `That image is too large. The maximum size is ${formatBytes(MAX_INPUT_BYTES)}.`,
      );
      return;
    }

    let opened: { width: number; height: number };
    try {
      // The worker keeps the decoded bitmap, so this is the only decode of the
      // whole session no matter how many times the options change.
      opened = await this.codec.open(file);
    } catch {
      this.showError('Could not read that image. It may be corrupt or an unsupported format.');
      return;
    }

    this.releaseSource();
    this.releaseOutput();
    this.output.set(null);

    // Default the output format to WebP for PNGs (often screenshots or graphics),
    // and JPEG for everything else.
    this.format.set(file.type === 'image/png' ? 'image/webp' : 'image/jpeg');

    this.source.set({
      name: file.name,
      size: file.size,
      width: opened.width,
      height: opened.height,
      previewUrl: URL.createObjectURL(file),
    });
  }

  // --- Encoding ---------------------------------------------------------
  private async encode(
    src: Source,
    format: CodecFormat,
    quality: number,
    maxDimension: number,
  ): Promise<void> {
    const token = ++this.encodeToken;
    this.processing.set(true);
    try {
      const result = await this.codec.encode(format, Math.round(quality * 100), maxDimension);
      if (token !== this.encodeToken) {
        return; // superseded by a newer request
      }
      this.usingFallbackCodec.set(result.codec === 'canvas');
      this.setOutput(result.blob, result.width, result.height);
    } catch (error) {
      if (token === this.encodeToken) {
        this.showError(
          error instanceof Error ? error.message : 'That image could not be compressed.',
        );
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
  protected setFormat(format: CodecFormat): void {
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
    void this.codec.close();
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
function outputFileName(originalName: string, format: CodecFormat): string {
  const ext = format === 'image/webp' ? 'webp' : 'jpg';
  const base = originalName.replace(/\.[^.]+$/, '') || 'image';
  return `${base}-compressed.${ext}`;
}
