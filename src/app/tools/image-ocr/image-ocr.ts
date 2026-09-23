import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { downloadText, fileStem } from '../../core/download';
import { formatBytes } from '../../core/format';
import { ImageCodecClient } from '../../core/image/image-codec.client';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { SendTo } from '../../shared/send-to/send-to';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { isHeic, isImage } from '../image-viewer/image-view';
import { createWorker, type TesseractWorker } from '../pdf-ocr/local-ocr';
import { OCR_LANGUAGES, ocrScale, tidyText } from './ocr-text';

/** Decoding happens on the main thread, and recognition holds the raster in memory. */
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

interface Source {
  file: File;
  /** What the <img> and the recognition canvas draw — a JPEG rendering for HEIC. */
  url: string;
}

@Component({
  selector: 'app-image-ocr',
  imports: [ToolPage, ToolContent, Dropzone, SendTo, Spinner, RouterLink, MatButtonModule, NgIcon],
  templateUrl: './image-ocr.html',
  styleUrls: ['../tool-shell.css', '../pdf-ocr/pdf-ocr.css', './image-ocr.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // Ctrl+V of a screenshot anywhere on the page, the quickest way in.
    '(document:paste)': 'onPaste($event)',
  },
})
export class ImageOcrTool implements OnDestroy {
  private readonly clipboard = inject(ClipboardService);
  private readonly codec = new ImageCodecClient();

  /** The live engine and the languages it was started with; reused while they match. */
  private worker: { langs: string; ready: Promise<TesseractWorker> } | null = null;
  /** Bumped by every new run and by Stop, so a stale result is dropped. */
  private run = 0;
  /** The codec caches its last decode by id, so every file needs a new one. */
  private nextId = 0;

  protected readonly languages = OCR_LANGUAGES;
  protected readonly formatBytes = formatBytes;

  protected readonly language = signal('eng');
  protected readonly source = signal<Source | null>(null);
  protected readonly busy = signal(false);
  protected readonly progress = signal('');
  protected readonly text = signal('');
  protected readonly confidence = signal<number | null>(null);
  protected readonly error = signal('');

  protected readonly done = computed(() => this.confidence() !== null);
  protected readonly fileName = computed(() => this.source()?.file.name ?? '');

  ngOnDestroy(): void {
    this.stopWorker();
    this.codec.terminate();
    this.revoke();
  }

  // --- Input ------------------------------------------------------------
  protected openFiles(files: File[]): void {
    const file = files[0];
    if (file) {
      void this.open(file);
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

  protected onLanguageChange(event: Event): void {
    this.language.set((event.target as HTMLSelectElement).value);
    if (this.source()) {
      void this.recognise();
    }
  }

  private async open(file: File): Promise<void> {
    this.clear();
    if (!isImage(file.type, file.name)) {
      this.error.set(`"${file.name}" is not an image. Scanned PDFs go to PDF OCR.`);
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.error.set(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
      return;
    }
    let blob: Blob = file;
    if (isHeic(file.type, file.name)) {
      // A browser cannot draw HEIC; the codec worker renders it as JPEG.
      try {
        blob = await this.codec.preview(`ocr-${this.nextId++}`, file);
      } catch {
        this.error.set(`"${file.name}" could not be decoded.`);
        return;
      }
    }
    this.source.set({ file, url: URL.createObjectURL(blob) });
    await this.recognise();
  }

  // --- Recognition ------------------------------------------------------
  protected async recognise(): Promise<void> {
    const source = this.source();
    if (!source) {
      return;
    }
    const run = ++this.run;
    const langs = this.language();
    this.busy.set(true);
    this.error.set('');
    this.text.set('');
    this.confidence.set(null);
    try {
      const canvas = await this.draw(source.url);
      if (this.worker?.langs !== langs) {
        this.stopWorker();
        this.progress.set('Loading the recognition engine and language…');
        this.worker = { langs, ready: createWorker(langs) };
      }
      const worker = await this.worker.ready;
      if (run !== this.run) {
        return;
      }
      this.progress.set('Reading the text…');
      const { data } = await worker.recognize(canvas);
      canvas.width = 0;
      if (run !== this.run) {
        return;
      }
      this.text.set(tidyText(data.text));
      this.confidence.set(Math.round(data.confidence));
    } catch {
      if (run === this.run) {
        // A failed engine is not worth keeping for the next attempt.
        this.stopWorker();
        this.error.set('The text could not be read from this image.');
      }
    } finally {
      if (run === this.run) {
        this.busy.set(false);
        this.progress.set('');
      }
    }
  }

  /**
   * Draws the image at the size Tesseract reads best. (No white underlay: a
   * transparent screenshot measured the same without one.)
   */
  private async draw(url: string): Promise<HTMLCanvasElement> {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = ocrScale(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  protected stop(): void {
    this.run++;
    this.stopWorker();
    this.busy.set(false);
    this.progress.set('');
  }

  // --- Output -----------------------------------------------------------
  protected onTextInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }

  protected copy(): void {
    void this.clipboard.copy(this.text(), { label: 'Text' });
  }

  protected download(): void {
    downloadText(this.text(), `${fileStem(this.fileName(), 'image')}.txt`);
  }

  protected clear(): void {
    this.run++;
    this.revoke();
    this.source.set(null);
    this.busy.set(false);
    this.progress.set('');
    this.text.set('');
    this.confidence.set(null);
    this.error.set('');
  }

  private stopWorker(): void {
    const worker = this.worker;
    this.worker = null;
    void worker?.ready.then((live) => live.terminate()).catch(() => {
      // Never started, or already gone.
    });
  }

  private revoke(): void {
    const url = this.source()?.url;
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
