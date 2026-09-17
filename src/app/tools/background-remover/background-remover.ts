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
import { NgIcon } from '@ng-icons/core';

import { downloadBlob, fileStem } from '../../core/download';
import { formatBytes } from '../../core/format';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { applyAlpha, coverage, parseHex, resampleAlpha, type Rgb } from './matte';
import { SegmentClient } from './segment.client';

/** Decoding happens in memory, so reject anything unreasonable up front. */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/**
 * A ceiling on the working canvas.
 *
 * The mask is 320x320 whatever happens, so a 50-megapixel source buys no extra
 * accuracy — only 200 MB of RGBA and a tab that may not survive it.
 */
const MAX_DIMENSION = 4096;

/** The mask's own resolution, needed to stretch it back over the photo. */
const MASK_SIDE = 320;

/** How long to wait after the last colour change before re-compositing. */
const SETTLE_MS = 120;

type Stage = 'empty' | 'loading' | 'working' | 'ready';

/** What sits behind the subject once the original background is gone. */
type Backdrop = 'transparent' | 'colour';

@Component({
  selector: 'app-background-remover',
  imports: [ToolPage, ToolContent, Dropzone, Spinner, MatButtonModule, NgIcon],
  templateUrl: './background-remover.html',
  styleUrls: ['../tool-shell.css', './background-remover.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackgroundRemoverTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly segmenter = new SegmentClient();

  protected readonly formatBytes = formatBytes;
  protected readonly maxBytes = MAX_INPUT_BYTES;

  // --- State ------------------------------------------------------------
  protected readonly stage = signal<Stage>('empty');
  protected readonly name = signal('');
  protected readonly size = signal(0);
  protected readonly width = signal(0);
  protected readonly height = signal(0);
  protected readonly sourceUrl = signal('');
  protected readonly resultUrl = signal('');
  protected readonly kept = signal(0);
  protected readonly error = signal<string | null>(null);

  // --- Options ----------------------------------------------------------
  protected readonly backdrop = signal<Backdrop>('transparent');
  protected readonly colour = signal('#ffffff');

  protected readonly keptPercent = computed(() => Math.round(this.kept()));
  protected readonly busy = computed(
    () => this.stage() === 'loading' || this.stage() === 'working',
  );
  protected readonly hasImage = computed(() => this.stage() !== 'empty');
  /**
   * Finished *and* holding a result. A run that stopped on an error also leaves
   * the stage at rest, and without the second half of this the controls would
   * come back enabled over nothing to download.
   */
  protected readonly ready = computed(() => this.stage() === 'ready' && this.resultUrl() !== '');

  /**
   * A cut-out that kept nearly all or nearly none of the frame is the model
   * failing rather than succeeding, and saying so beats handing back a blank.
   */
  protected readonly suspect = computed(
    () => this.ready() && (this.kept() > 97 || this.kept() < 1),
  );

  /** Held outside signals: neither is renderable, and both need explicit cleanup. */
  private bitmap: ImageBitmap | null = null;
  private alpha: Uint8ClampedArray | null = null;
  private blob: Blob | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    this.release();
    this.segmenter.terminate();
  }

  // --- Files ------------------------------------------------------------
  protected async addFiles(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|bmp|avif)$/i.test(file.name)) {
      this.showError(`"${file.name}" is not an image.`);
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
      return;
    }

    this.release();
    this.error.set(null);
    this.name.set(file.name);
    this.size.set(file.size);
    this.sourceUrl.set(URL.createObjectURL(file));
    this.stage.set('loading');

    try {
      this.bitmap = await this.decode(file);
      this.width.set(this.bitmap.width);
      this.height.set(this.bitmap.height);

      // The download is the long part of a first run — around 19 MB of runtime
      // and weights — so it gets its own stage and its own sentence on screen.
      await this.segmenter.load();
      this.stage.set('working');

      const mask = await this.segmenter.segment(file);
      this.alpha = resampleAlpha(mask, MASK_SIDE, this.bitmap.width, this.bitmap.height);
      this.kept.set(coverage(this.alpha));
      await this.compose();
    } catch (error) {
      this.fail(error);
    }
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    void this.addFiles(files);
  }

  protected reset(): void {
    this.release();
    this.stage.set('empty');
    this.error.set(null);
    this.name.set('');
    this.size.set(0);
    this.kept.set(0);
  }

  // --- Options ----------------------------------------------------------
  protected setBackdrop(value: Backdrop): void {
    if (this.backdrop() === value) {
      return;
    }
    this.backdrop.set(value);
    this.recompose();
  }

  protected onColourInput(event: Event): void {
    this.colour.set((event.target as HTMLInputElement).value);
    if (this.backdrop() !== 'colour') {
      this.backdrop.set('colour');
    }
    this.recompose();
  }

  // --- Output -----------------------------------------------------------
  protected download(): void {
    if (this.blob) {
      const suffix = this.backdrop() === 'transparent' ? 'cutout' : 'background';
      downloadBlob(this.blob, `${fileStem(this.name(), 'image')}-${suffix}.png`);
    }
  }

  // --- Internals --------------------------------------------------------

  /** Decodes the file, scaled down first if it is larger than we will work at. */
  private async decode(file: File): Promise<ImageBitmap> {
    const probe = await createImageBitmap(file);
    const longest = Math.max(probe.width, probe.height);
    if (longest <= MAX_DIMENSION) {
      return probe;
    }
    const scale = MAX_DIMENSION / longest;
    const resized = await createImageBitmap(probe, {
      resizeWidth: Math.round(probe.width * scale),
      resizeHeight: Math.round(probe.height * scale),
      resizeQuality: 'high',
    });
    probe.close();
    return resized;
  }

  /** Re-composites after an option change, once the changes stop arriving. */
  private recompose(): void {
    if (!this.ready()) {
      return;
    }
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
    }
    this.settleTimer = setTimeout(() => {
      void this.compose().catch((error: unknown) => this.fail(error));
    }, SETTLE_MS);
  }

  /**
   * Paints the subject onto the chosen backdrop and hands back a PNG.
   *
   * Always PNG: it is the only format here that keeps an alpha channel, and a
   * cut-out saved as a JPEG is just the same photo with a black box behind it.
   */
  private async compose(): Promise<void> {
    const bitmap = this.bitmap;
    const alpha = this.alpha;
    if (!bitmap || !alpha) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('This browser could not prepare the image.');
    }

    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    applyAlpha(image.data, alpha, this.backdropColour());
    context.putImageData(image, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      throw new Error('The cut-out could not be saved.');
    }

    const previous = this.resultUrl();
    this.blob = blob;
    this.resultUrl.set(URL.createObjectURL(blob));
    if (previous) {
      URL.revokeObjectURL(previous);
    }
    this.stage.set('ready');
  }

  private backdropColour(): Rgb | null {
    return this.backdrop() === 'transparent'
      ? null
      : (parseHex(this.colour()) ?? { r: 255, g: 255, b: 255 });
  }

  private fail(error: unknown): void {
    this.stage.set(this.bitmap ? 'ready' : 'empty');
    const message = error instanceof Error ? error.message : 'The background could not be removed.';
    this.error.set(message);
    this.showError(message);
  }

  private release(): void {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
    for (const url of [this.sourceUrl(), this.resultUrl()]) {
      if (url) {
        URL.revokeObjectURL(url);
      }
    }
    this.sourceUrl.set('');
    this.resultUrl.set('');
    this.bitmap?.close();
    this.bitmap = null;
    this.alpha = null;
    this.blob = null;
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 6000 });
  }
}
