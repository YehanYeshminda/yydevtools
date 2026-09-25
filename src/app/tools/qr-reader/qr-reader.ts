import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { formatBytes } from '../../core/format';
import { ImageCodecClient } from '../../core/image/image-codec.client';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { SendTo } from '../../shared/send-to/send-to';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { isHeic, isImage } from '../image-viewer/image-view';
import { scan, type ScannedCode } from './qr-scan';

const MAX_INPUT_BYTES = 30 * 1024 * 1024;

/** A photo is scaled to this on its long edge before reading; codes stay far above ZXing's minimum. */
const MAX_EDGE = 3000;

/** Camera frames are read this often. Each read takes a few ms, on the main thread. */
const FRAME_INTERVAL_MS = 150;

@Component({
  selector: 'app-qr-reader',
  imports: [ToolPage, ToolContent, Dropzone, SendTo, Spinner, MatButtonModule, NgIcon],
  templateUrl: './qr-reader.html',
  styleUrls: ['../tool-shell.css', './qr-reader.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:paste)': 'onPaste($event)',
  },
})
export class QrReaderTool implements OnDestroy {
  private readonly clipboard = inject(ClipboardService);
  private readonly codec = new ImageCodecClient();
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('camera');

  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped by every new input, so a slow read of an old one is dropped. */
  private run = 0;
  private nextId = 0;

  protected readonly source = signal<{ file: File; name: string; url: string } | null>(null);
  protected readonly codes = signal<ScannedCode[] | null>(null);
  protected readonly busy = signal(false);
  protected readonly scanning = signal(false);
  protected readonly error = signal('');

  ngOnDestroy(): void {
    this.stopCamera();
    this.codec.terminate();
    this.revoke();
  }

  // --- Images -----------------------------------------------------------
  protected openFiles(files: File[]): void {
    if (files[0]) {
      void this.open(files[0]);
    }
  }

  protected onPaste(event: ClipboardEvent): void {
    const file = [...(event.clipboardData?.files ?? [])].find((item) =>
      item.type.startsWith('image/'),
    );
    if (file) {
      event.preventDefault();
      void this.open(file);
    }
  }

  private async open(file: File): Promise<void> {
    this.clear();
    if (!isImage(file.type, file.name)) {
      this.error.set(`"${file.name}" is not an image.`);
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.error.set(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
      return;
    }
    const run = this.run;
    this.busy.set(true);
    try {
      // A browser cannot draw HEIC; the codec worker renders it as JPEG.
      const blob = isHeic(file.type, file.name)
        ? await this.codec.preview(`qr-${this.nextId++}`, file)
        : file;
      const url = URL.createObjectURL(blob);
      this.source.set({ file, name: file.name, url });
      const codes = await scan(await pixels(url), { tryHarder: true, maxNumberOfSymbols: 8 });
      if (run === this.run) {
        this.codes.set(codes);
      }
    } catch {
      if (run === this.run) {
        this.error.set(`"${file.name}" could not be read as an image.`);
      }
    } finally {
      if (run === this.run) {
        this.busy.set(false);
      }
    }
  }

  // --- Camera -----------------------------------------------------------
  protected async startCamera(): Promise<void> {
    this.clear();
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set('This browser cannot use a camera here. Upload a photo of the code instead.');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
    } catch (error) {
      this.error.set(cameraError(error));
      return;
    }
    const video = this.video().nativeElement;
    video.srcObject = this.stream;
    this.scanning.set(true);
    await video.play().catch(() => undefined);
    void this.readFrame(this.run);
  }

  /** One frame, then the next — stopping at the first code found. */
  private async readFrame(run: number): Promise<void> {
    if (run !== this.run || !this.scanning()) {
      return;
    }
    const video = this.video().nativeElement;
    if (video.videoWidth) {
      const frame = grab(video);
      const codes = await scan(frame, { maxNumberOfSymbols: 1 }).catch(() => []);
      if (run !== this.run) {
        return;
      }
      if (codes.length) {
        this.stopCamera();
        this.codes.set(codes);
        return;
      }
    }
    this.timer = setTimeout(() => void this.readFrame(run), FRAME_INTERVAL_MS);
  }

  protected stopCamera(): void {
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.scanning.set(false);
  }

  // --- Output -----------------------------------------------------------
  protected copy(text: string): void {
    void this.clipboard.copy(text);
  }

  protected clear(): void {
    this.run++;
    this.stopCamera();
    this.revoke();
    this.source.set(null);
    this.codes.set(null);
    this.busy.set(false);
    this.error.set('');
  }

  private revoke(): void {
    const url = this.source()?.url;
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}

/** Decodes an image URL to pixels, scaled down if it is very large. */
async function pixels(url: string): Promise<ImageData> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight, 1));
  return draw(img, img.naturalWidth * scale, img.naturalHeight * scale);
}

function grab(video: HTMLVideoElement): ImageData {
  return draw(video, video.videoWidth, video.videoHeight);
}

function draw(source: CanvasImageSource, width: number, height: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function cameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError') {
    return 'Camera access was refused. Allow it in the address bar, or upload a photo of the code.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found. Upload a photo of the code instead.';
  }
  return 'The camera could not be started. Upload a photo of the code instead.';
}
