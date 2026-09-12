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

import { downloadBlob, fileStem } from '../../core/download';
import { formatBytes } from '../../core/format';
import {
  ImageCodecClient,
  type CodecFormat,
  type PixelRect,
} from '../../core/image/image-codec.client';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { Corner, anchorOf, centeredRect, clampRect, fromCorner, outputSize } from './crop';

const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const SETTLE_MS = 250;

export const ASPECTS: { key: string; label: string; ratio: number | null }[] = [
  { key: 'free', label: 'Free', ratio: null },
  { key: 'original', label: 'Original', ratio: 0 },
  { key: '1:1', label: 'Square', ratio: 1 },
  { key: '4:5', label: '4:5', ratio: 4 / 5 },
  { key: '4:3', label: '4:3', ratio: 4 / 3 },
  { key: '3:2', label: '3:2', ratio: 3 / 2 },
  { key: '16:9', label: '16:9', ratio: 16 / 9 },
  { key: '9:16', label: '9:16', ratio: 9 / 16 },
];

const FORMATS: { value: CodecFormat; label: string; extension: string; lossy: boolean }[] = [
  { value: 'image/jpeg', label: 'JPEG', extension: 'jpg', lossy: true },
  { value: 'image/png', label: 'PNG', extension: 'png', lossy: false },
  { value: 'image/webp', label: 'WebP', extension: 'webp', lossy: true },
];

interface Result {
  blob: Blob;
  url: string;
  size: number;
  width: number;
  height: number;
  quality: number;
  targetMissed: boolean;
}

/**
 * Image Resizer & Cropper: crop with a draggable box or exact numbers, resize
 * to a width, height or file size, and save as JPEG, PNG or WebP.
 *
 * Runs on the shared codec worker; the crop and exact size are the only
 * additions to it. One image at a time — the converter and compressor handle
 * batches, and a crop is a per-image decision anyway.
 */
@Component({
  selector: 'app-image-resize',
  imports: [ToolPage, ToolContent, Dropzone, Spinner, MatButtonModule, NgIcon],
  templateUrl: './image-resize.html',
  styleUrls: ['../tool-shell.css', './image-resize.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageResizeTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly codec = new ImageCodecClient();
  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');

  protected readonly aspects = ASPECTS;
  protected readonly formats = FORMATS;
  protected readonly formatBytes = formatBytes;

  // --- Source -------------------------------------------------------------
  protected readonly name = signal('');
  protected readonly fileSize = signal(0);
  protected readonly imageWidth = signal(0);
  protected readonly imageHeight = signal(0);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly opening = signal(false);

  // --- Crop ---------------------------------------------------------------
  protected readonly crop = signal<PixelRect>({ x: 0, y: 0, width: 0, height: 0 });
  protected readonly aspectKey = signal('free');

  // --- Resize & output ----------------------------------------------------
  protected readonly wantWidth = signal<number | null>(null);
  protected readonly wantHeight = signal<number | null>(null);
  protected readonly lock = signal(true);
  protected readonly targetKb = signal(0);
  protected readonly format = signal<CodecFormat>('image/jpeg');
  protected readonly quality = signal(85);
  protected readonly result = signal<Result | null>(null);
  protected readonly busy = signal(false);

  protected readonly hasImage = computed(() => this.name() !== '');
  protected readonly output = computed(() =>
    outputSize(this.crop(), { width: this.wantWidth(), height: this.wantHeight() }, this.lock()),
  );
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
  protected readonly lossy = computed(
    () => FORMATS.find((option) => option.value === this.format())?.lossy ?? true,
  );
  protected readonly ratio = computed(() => {
    const option = ASPECTS.find((entry) => entry.key === this.aspectKey());
    if (!option || option.ratio === null) {
      return null;
    }
    return option.ratio === 0 ? this.imageWidth() / this.imageHeight() : option.ratio;
  });

  private file: File | null = null;
  private id = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private run = 0;
  private drag:
    | { kind: 'move'; pointerId: number; dx: number; dy: number }
    | { kind: 'corner'; pointerId: number; corner: Corner; anchor: { x: number; y: number } }
    | null = null;

  ngOnDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.release();
    this.codec.terminate();
  }

  // --- Loading ------------------------------------------------------------
  protected acceptFiles(files: File[]): void {
    const file = files[0];
    if (file) {
      void this.load(file);
    }
  }

  private async load(file: File): Promise<void> {
    if (
      !file.type.startsWith('image/') &&
      !/\.(hei[cf]|jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name)
    ) {
      this.showError(`"${file.name}" is not an image.`);
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
      return;
    }
    const id = `resize-${++this.id}`;
    this.opening.set(true);
    try {
      const opened = await this.codec.open(id, file);
      this.release();
      this.file = file;
      this.name.set(file.name);
      this.fileSize.set(file.size);
      this.imageWidth.set(opened.width);
      this.imageHeight.set(opened.height);
      this.crop.set({ x: 0, y: 0, width: opened.width, height: opened.height });
      this.aspectKey.set('free');
      this.wantWidth.set(null);
      this.wantHeight.set(null);
      if (this.format() === 'image/jpeg' && file.type === 'image/png') {
        this.format.set('image/png');
      }
      this.previewUrl.set(
        URL.createObjectURL(opened.heic ? await this.codec.preview(id, file) : file),
      );
      this.schedule();
    } catch {
      this.showError(`"${file.name}" could not be read. It may be corrupt or unsupported.`);
    } finally {
      this.opening.set(false);
    }
  }

  protected clear(): void {
    this.run++;
    this.release();
    this.file = null;
    this.name.set('');
    this.fileSize.set(0);
    this.imageWidth.set(0);
    this.imageHeight.set(0);
    void this.codec.close();
  }

  private release(): void {
    const preview = this.previewUrl();
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    this.previewUrl.set(null);
    const result = this.result();
    if (result) {
      URL.revokeObjectURL(result.url);
    }
    this.result.set(null);
  }

  // --- Crop: presets and numbers -----------------------------------------
  protected setAspect(key: string): void {
    this.aspectKey.set(key);
    const ratio = this.ratio();
    this.crop.set(centeredRect(ratio, this.imageWidth(), this.imageHeight()));
    this.schedule();
  }

  protected setCropField(field: keyof PixelRect, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) {
      return;
    }
    const current = this.crop();
    let next: PixelRect = { ...current, [field]: value };
    const ratio = this.ratio();
    if (ratio && field === 'width') {
      next = { ...next, height: value / ratio };
    } else if (ratio && field === 'height') {
      next = { ...next, width: value * ratio };
    }
    this.crop.set(clampRect(next, this.imageWidth(), this.imageHeight()));
    this.schedule();
  }

  protected resetCrop(): void {
    this.setAspect('free');
  }

  // --- Crop: pointer ------------------------------------------------------
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
      corner,
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
      this.crop.set(fromCorner(drag.anchor, point, this.ratio(), width, height));
    }
  }

  protected pointerUp(event: PointerEvent): void {
    if (this.drag?.pointerId === event.pointerId) {
      this.drag = null;
      this.schedule();
    }
  }

  /** Pointer position in source pixels, or null before the image is shown. */
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

  // --- Resize & output options -------------------------------------------
  protected setWant(which: 'width' | 'height', event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    const value = raw === '' ? null : Math.max(1, Math.round(Number(raw)) || 1);
    (which === 'width' ? this.wantWidth : this.wantHeight).set(value);
    this.schedule();
  }

  protected scale(percent: number): void {
    const crop = this.crop();
    this.wantWidth.set(Math.max(1, Math.round((crop.width * percent) / 100)));
    this.wantHeight.set(
      this.lock() ? null : Math.max(1, Math.round((crop.height * percent) / 100)),
    );
    this.schedule();
  }

  protected setLock(event: Event): void {
    this.lock.set((event.target as HTMLInputElement).checked);
    this.schedule();
  }

  protected setTargetKb(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.targetKb.set(Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
    this.schedule();
  }

  protected setFormat(event: Event): void {
    this.format.set((event.target as HTMLSelectElement).value as CodecFormat);
    this.schedule();
  }

  protected setQuality(event: Event): void {
    this.quality.set(Number((event.target as HTMLInputElement).value) || 85);
    this.schedule();
  }

  // --- Encoding -----------------------------------------------------------
  private schedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => void this.encode(), SETTLE_MS);
  }

  private async encode(): Promise<void> {
    const file = this.file;
    if (!file) {
      return;
    }
    const run = ++this.run;
    this.busy.set(true);
    try {
      const encoded = await this.codec.encode(`resize-${this.id}`, file, {
        format: this.format(),
        quality: this.quality(),
        maxDimension: 0,
        targetBytes: this.lossy() ? this.targetKb() * 1024 : 0,
        keepMetadata: false,
        crop: this.crop(),
        size: this.output(),
      });
      if (run !== this.run) {
        return;
      }
      const previous = this.result();
      if (previous) {
        URL.revokeObjectURL(previous.url);
      }
      this.result.set({
        blob: encoded.blob,
        url: URL.createObjectURL(encoded.blob),
        size: encoded.bytes.byteLength,
        width: encoded.width,
        height: encoded.height,
        quality: encoded.quality,
        targetMissed: encoded.targetMissed,
      });
    } catch (error) {
      if (run === this.run) {
        this.showError(
          error instanceof Error ? error.message : 'The image could not be processed.',
        );
      }
    } finally {
      if (run === this.run) {
        this.busy.set(false);
      }
    }
  }

  protected download(): void {
    const result = this.result();
    if (!result) {
      return;
    }
    const extension = FORMATS.find((option) => option.value === this.format())?.extension ?? 'jpg';
    downloadBlob(
      result.blob,
      `${fileStem(this.name(), 'image')}-${result.width}x${result.height}.${extension}`,
    );
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 6000 });
  }
}
