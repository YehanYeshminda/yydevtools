import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';

import { downloadBlob } from '../../core/download';
import { formatBytes } from '../../core/format';
import type { PixelRect } from '../../core/image/image-codec.client';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { anchorOf, centeredRect, clampRect, fromCorner, type Corner } from '../image-resize/crop';
import {
  DPIS,
  SHEETS,
  SPECS,
  guides,
  photoFilename,
  photoPixels,
  sheetLayout,
  type Dpi,
  type PhotoSpec,
  type SheetSpec,
} from './spec';

/** Decoding happens in memory, so reject anything unreasonable up front. */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/** How long to wait after the last crop change before re-rendering the photo. */
const SETTLE_MS = 120;

/** Print quality: a photo lab will not thank you for a soft JPEG. */
const JPEG_QUALITY = 0.94;

@Component({
  selector: 'app-passport-photo',
  imports: [ToolPage, ToolContent, Dropzone, MatButtonModule, NgIcon, RouterLink],
  templateUrl: './passport-photo.html',
  // The crop stage is the Image Resizer's, so it borrows that sheet.
  styleUrls: ['../tool-shell.css', '../image-resize/image-resize.css', './passport-photo.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PassportPhotoTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');

  protected readonly specs = SPECS;
  protected readonly sheets = SHEETS;
  protected readonly dpis = DPIS;
  protected readonly formatBytes = formatBytes;

  // --- State ------------------------------------------------------------
  protected readonly name = signal('');
  protected readonly previewUrl = signal('');
  protected readonly resultUrl = signal('');
  protected readonly imageWidth = signal(0);
  protected readonly imageHeight = signal(0);
  protected readonly crop = signal<PixelRect>({ x: 0, y: 0, width: 0, height: 0 });
  protected readonly working = signal(false);

  // --- Options ----------------------------------------------------------
  protected readonly specKey = signal(SPECS[0].key);
  protected readonly dpi = signal<Dpi>(300);
  /** Empty means a single photo rather than a sheet of them. */
  protected readonly sheetKey = signal('6x4');
  protected readonly showGuides = signal(true);

  protected readonly spec = computed(
    () => SPECS.find((entry) => entry.key === this.specKey()) ?? SPECS[0],
  );
  protected readonly sheet = computed<SheetSpec | null>(
    () => SHEETS.find((entry) => entry.key === this.sheetKey()) ?? null,
  );
  protected readonly hasImage = computed(() => this.imageWidth() > 0);
  protected readonly aspect = computed(() => this.spec().widthMm / this.spec().heightMm);
  protected readonly pixels = computed(() => photoPixels(this.spec(), this.dpi()));
  protected readonly layout = computed(() => {
    const sheet = this.sheet();
    return sheet ? sheetLayout(this.spec(), sheet, this.dpi()) : null;
  });

  /** Guide lines, as percentages down the crop box. */
  protected readonly guideLines = computed(() => {
    const { crown, chin, eyes } = guides(this.spec());
    return {
      crown: `${crown * 100}%`,
      chin: `${chin * 100}%`,
      eyes: `${eyes * 100}%`,
    };
  });

  /**
   * Whether the crop is big enough to print at the chosen resolution.
   *
   * Upscaling a 300-pixel crop to a 531-pixel photo is the one way to fail this
   * silently: it looks fine on screen and prints soft, and the passport office
   * rejects it. Saying so is cheaper than a rejected application.
   */
  protected readonly tooSmall = computed(() => {
    const crop = this.crop();
    return crop.width > 0 && crop.width < this.pixels().width;
  });

  protected readonly cropStyle = computed(() => {
    const crop = this.crop();
    const w = this.imageWidth() || 1;
    const h = this.imageHeight() || 1;
    return {
      left: `${(crop.x / w) * 100}%`,
      top: `${(crop.y / h) * 100}%`,
      width: `${(crop.width / w) * 100}%`,
      height: `${(crop.height / h) * 100}%`,
    };
  });

  private bitmap: ImageBitmap | null = null;
  private blob: Blob | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private drag:
    | { kind: 'move'; pointerId: number; dx: number; dy: number }
    | { kind: 'corner'; pointerId: number; anchor: { x: number; y: number } }
    | null = null;

  ngOnDestroy(): void {
    this.release();
  }

  // --- Files ------------------------------------------------------------
  protected async addFiles(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|avif)$/i.test(file.name)) {
      this.snackBar.open(`"${file.name}" is not an image.`, 'Dismiss', { duration: 6000 });
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.snackBar.open(
        `"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`,
        'Dismiss',
        {
          duration: 6000,
        },
      );
      return;
    }

    this.release();
    try {
      this.bitmap = await createImageBitmap(file);
    } catch {
      this.snackBar.open('That image could not be read.', 'Dismiss', { duration: 6000 });
      return;
    }
    this.name.set(file.name);
    this.previewUrl.set(URL.createObjectURL(file));
    this.imageWidth.set(this.bitmap.width);
    this.imageHeight.set(this.bitmap.height);
    this.crop.set(centeredRect(this.aspect(), this.bitmap.width, this.bitmap.height));
    void this.render();
  }

  protected reset(): void {
    this.release();
    this.imageWidth.set(0);
    this.imageHeight.set(0);
    this.name.set('');
  }

  // --- Options ----------------------------------------------------------
  protected setSpec(key: string): void {
    this.specKey.set(key);
    if (this.hasImage()) {
      // The frame's shape changed, so the old box no longer fits the format.
      this.crop.set(centeredRect(this.aspect(), this.imageWidth(), this.imageHeight()));
      this.schedule();
    }
  }

  protected setDpi(value: Dpi): void {
    this.dpi.set(value);
    this.schedule();
  }

  protected setSheet(key: string): void {
    this.sheetKey.set(key);
  }

  protected toggleGuides(): void {
    this.showGuides.update((value) => !value);
  }

  // --- Crop: pointer ----------------------------------------------------
  protected boxDown(event: PointerEvent): void {
    const point = this.imagePoint(event);
    if (!point) {
      return;
    }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const crop = this.crop();
    this.drag = {
      kind: 'move',
      pointerId: event.pointerId,
      dx: point.x - crop.x,
      dy: point.y - crop.y,
    };
    event.preventDefault();
  }

  protected cornerDown(event: PointerEvent, corner: Corner): void {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.drag = {
      kind: 'corner',
      pointerId: event.pointerId,
      anchor: anchorOf(this.crop(), corner),
    };
    event.stopPropagation();
    event.preventDefault();
  }

  protected pointerMove(event: PointerEvent): void {
    const drag = this.drag;
    const point = this.imagePoint(event);
    if (!drag || drag.pointerId !== event.pointerId || !point) {
      return;
    }
    const width = this.imageWidth();
    const height = this.imageHeight();
    if (drag.kind === 'move') {
      const crop = this.crop();
      this.crop.set(
        clampRect({ ...crop, x: point.x - drag.dx, y: point.y - drag.dy }, width, height),
      );
    } else {
      this.crop.set(fromCorner(drag.anchor, point, this.aspect(), width, height));
    }
  }

  protected pointerUp(event: PointerEvent): void {
    if (this.drag?.pointerId === event.pointerId) {
      this.drag = null;
      this.schedule();
    }
  }

  // --- Output -----------------------------------------------------------
  protected download(): void {
    if (this.blob) {
      downloadBlob(this.blob, photoFilename(this.spec(), this.dpi(), null));
    }
  }

  protected async downloadSheet(): Promise<void> {
    const sheet = this.sheet();
    const layout = this.layout();
    if (!sheet || !layout || !this.bitmap) {
      return;
    }
    this.working.set(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = layout.width;
      canvas.height = layout.height;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('This browser could not prepare the sheet.');
      }
      // White, not transparent: this is going onto paper, and a JPEG has no
      // alpha channel to fall back on anyway.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      const crop = this.crop();
      for (let row = 0; row < layout.rows; row++) {
        for (let column = 0; column < layout.columns; column++) {
          context.drawImage(
            this.bitmap,
            crop.x,
            crop.y,
            crop.width,
            crop.height,
            layout.offsetX + column * (layout.cellWidth + layout.gap),
            layout.offsetY + row * (layout.cellHeight + layout.gap),
            layout.cellWidth,
            layout.cellHeight,
          );
        }
      }

      const blob = await toJpeg(canvas);
      downloadBlob(blob, photoFilename(this.spec(), this.dpi(), sheet));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The sheet could not be made.';
      this.snackBar.open(message, 'Dismiss', { duration: 6000 });
    } finally {
      this.working.set(false);
    }
  }

  // --- Internals --------------------------------------------------------
  private imagePoint(event: PointerEvent): { x: number; y: number } | null {
    const frame = this.frame()?.nativeElement;
    if (!frame) {
      return null;
    }
    const rect = frame.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * this.imageWidth(),
      y: ((event.clientY - rect.top) / rect.height) * this.imageHeight(),
    };
  }

  private schedule(): void {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
    }
    this.settleTimer = setTimeout(() => void this.render(), SETTLE_MS);
  }

  /** The cropped photo at exactly the printed pixel size. */
  private async render(): Promise<void> {
    const bitmap = this.bitmap;
    const crop = this.crop();
    if (!bitmap || crop.width === 0) {
      return;
    }
    const { width, height } = this.pixels();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);

    try {
      const blob = await toJpeg(canvas);
      const previous = this.resultUrl();
      this.blob = blob;
      this.resultUrl.set(URL.createObjectURL(blob));
      if (previous) {
        URL.revokeObjectURL(previous);
      }
    } catch {
      this.snackBar.open('The photo could not be prepared.', 'Dismiss', { duration: 6000 });
    }
  }

  private release(): void {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
    for (const url of [this.previewUrl(), this.resultUrl()]) {
      if (url) {
        URL.revokeObjectURL(url);
      }
    }
    this.previewUrl.set('');
    this.resultUrl.set('');
    this.bitmap?.close();
    this.bitmap = null;
    this.blob = null;
  }
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The photo could not be saved.'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}
