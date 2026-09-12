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
import { PDFDocument } from '@cantoo/pdf-lib';
import { downloadBytes } from '../../core/download';
import { describeFile, formatBytes } from '../../core/format';
import { looksLikePdf } from '../../core/pdf-probe';
import { PdfDocumentRenderer } from '../../core/pdf-render';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import {
  Placement,
  canvasToPng,
  clamp,
  toPdfRect,
  trimTransparent,
  typedSignature,
} from './signature';

const MAX_INPUT_BYTES = 50 * 1024 * 1024;
/** Pages are rendered at 1.5× their point size: crisp on a laptop, still cheap. */
const RENDER_SCALE = 1.5;

type Mode = 'draw' | 'type' | 'upload';

interface Signature {
  dataUrl: string;
  png: Uint8Array;
  /** Height over width. */
  aspect: number;
}

/**
 * Sign PDF: draw, type or upload a signature, drag it onto a page, download.
 *
 * Everything stays in the browser. pdf.js renders the page for placing, and
 * pdf-lib embeds the signature as a PNG at the matching point coordinates —
 * a visible mark, not a cryptographic signature (that is a later phase).
 *
 * ponytail: one signature on one page. Every page / several marks is the
 * upgrade if people ask.
 */
@Component({
  selector: 'app-pdf-sign',
  imports: [ToolPage, Dropzone, ToolContent, MatButtonModule, NgIcon, Spinner],
  templateUrl: './pdf-sign.html',
  styleUrls: ['../tool-shell.css', './pdf-sign.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfSignTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly pad = viewChild<ElementRef<HTMLCanvasElement>>('pad');
  private readonly sheet = viewChild<ElementRef<HTMLElement>>('sheet');

  protected readonly fileName = signal('');
  protected readonly fileSize = signal(0);
  protected readonly pageCount = signal(0);
  protected readonly page = signal(0);
  protected readonly pageImage = signal<string | null>(null);
  protected readonly rendering = signal(false);
  protected readonly busy = signal(false);

  protected readonly mode = signal<Mode>('draw');
  protected readonly typed = signal('');
  protected readonly signature = signal<Signature | null>(null);
  protected readonly placement = signal<Placement | null>(null);

  protected readonly hasFile = computed(() => this.fileName() !== '');
  protected readonly fileSummary = computed(() =>
    describeFile(this.fileName(), this.pageCount() || null, this.fileSize()),
  );
  /** The placement, only when it belongs to the page on screen. */
  protected readonly shown = computed(() => {
    const placement = this.placement();
    return placement && placement.page === this.page() ? placement : null;
  });
  protected readonly canSign = computed(
    () => this.hasFile() && this.placement() !== null && !this.busy(),
  );

  private bytes: Uint8Array | null = null;
  private renderer: PdfDocumentRenderer | null = null;
  private renderToken = 0;
  private drawing = false;
  private drag: { pointerId: number; dx: number; dy: number } | null = null;

  ngOnDestroy(): void {
    this.renderer?.close();
  }

  // --- The document -----------------------------------------------------
  protected acceptFiles(files: File[]): void {
    const file = files[0];
    if (file) {
      void this.load(file);
    }
  }

  private async load(file: File): Promise<void> {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      this.showError(`"${file.name}" is not a PDF.`);
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!looksLikePdf(bytes)) {
      this.showError(`"${file.name}" is not a readable PDF.`);
      return;
    }

    this.closeDocument();
    try {
      this.renderer = await PdfDocumentRenderer.open(bytes);
    } catch {
      this.showError(
        `"${file.name}" could not be opened. It may be damaged or password-protected.`,
      );
      return;
    }
    this.bytes = bytes;
    this.fileName.set(file.name);
    this.fileSize.set(file.size);
    this.pageCount.set(this.renderer.pageCount);
    await this.showPage(0);
  }

  protected async showPage(index: number): Promise<void> {
    const renderer = this.renderer;
    if (!renderer || index < 0 || index >= renderer.pageCount) {
      return;
    }
    const token = ++this.renderToken;
    this.rendering.set(true);
    try {
      const { canvas } = await renderer.renderPageCanvas(index, RENDER_SCALE);
      if (token !== this.renderToken) {
        return;
      }
      this.page.set(index);
      this.pageImage.set(canvas.toDataURL('image/jpeg', 0.85));
    } catch {
      this.showError('That page could not be drawn.');
    } finally {
      if (token === this.renderToken) {
        this.rendering.set(false);
      }
    }
  }

  protected clear(): void {
    this.closeDocument();
    this.fileName.set('');
    this.fileSize.set(0);
    this.pageCount.set(0);
    this.pageImage.set(null);
    this.placement.set(null);
  }

  private closeDocument(): void {
    this.renderToken++;
    this.renderer?.close();
    this.renderer = null;
    this.bytes = null;
  }

  // --- Making a signature ----------------------------------------------
  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  protected onTyped(event: Event): void {
    this.typed.set((event.target as HTMLInputElement).value);
  }

  protected penDown(event: PointerEvent): void {
    const canvas = this.pad()?.nativeElement;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    this.drawing = true;
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0b1f4d';
    const { x, y } = this.padPoint(canvas, event);
    context.beginPath();
    context.moveTo(x, y);
  }

  protected penMove(event: PointerEvent): void {
    const canvas = this.pad()?.nativeElement;
    const context = canvas?.getContext('2d');
    if (!this.drawing || !canvas || !context) {
      return;
    }
    const { x, y } = this.padPoint(canvas, event);
    context.lineTo(x, y);
    context.stroke();
  }

  protected penUp(): void {
    this.drawing = false;
  }

  private padPoint(canvas: HTMLCanvasElement, event: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  protected clearPad(): void {
    const canvas = this.pad()?.nativeElement;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }

  protected async useDrawn(): Promise<void> {
    const canvas = this.pad()?.nativeElement;
    const trimmed = canvas ? trimTransparent(canvas) : null;
    if (!trimmed) {
      this.showError('Draw your signature first.');
      return;
    }
    await this.adopt(trimmed);
  }

  protected async useTyped(): Promise<void> {
    const name = this.typed().trim();
    if (!name) {
      this.showError('Type your name first.');
      return;
    }
    await this.adopt(typedSignature(name));
  }

  protected async acceptImage(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) {
      return;
    }
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      this.showError('Choose a PNG, JPEG or WebP image of your signature.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      bitmap.close();
      await this.adopt(canvas);
    } catch {
      this.showError(`"${file.name}" could not be read as an image.`);
    }
  }

  private async adopt(canvas: HTMLCanvasElement): Promise<void> {
    const png = await canvasToPng(canvas);
    this.signature.set({
      dataUrl: canvas.toDataURL('image/png'),
      png,
      aspect: canvas.height / canvas.width,
    });
    // A fresh signature lands on the page being looked at, lower right — where
    // a signature line usually is — unless one has already been placed.
    this.placement.update(
      (current) => current ?? { page: this.page(), x: 0.55, y: 0.78, width: 0.3 },
    );
  }

  // --- Placing it --------------------------------------------------------
  protected placeHere(): void {
    this.placement.update((current) => (current ? { ...current, page: this.page() } : current));
  }

  protected onWidth(event: Event): void {
    const width = Number((event.target as HTMLInputElement).value) / 100;
    this.placement.update((current) =>
      current ? clamp({ ...current, width }, this.heightFraction(width)) : current,
    );
  }

  protected dragStart(event: PointerEvent): void {
    const placement = this.shown();
    const sheet = this.sheet()?.nativeElement;
    if (!placement || !sheet) {
      return;
    }
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    const rect = sheet.getBoundingClientRect();
    this.drag = {
      pointerId: event.pointerId,
      dx: (event.clientX - rect.left) / rect.width - placement.x,
      dy: (event.clientY - rect.top) / rect.height - placement.y,
    };
    event.preventDefault();
  }

  protected dragMove(event: PointerEvent): void {
    const drag = this.drag;
    const sheet = this.sheet()?.nativeElement;
    if (!drag || drag.pointerId !== event.pointerId || !sheet) {
      return;
    }
    const rect = sheet.getBoundingClientRect();
    this.placement.update((current) =>
      current
        ? clamp(
            {
              ...current,
              x: (event.clientX - rect.left) / rect.width - drag.dx,
              y: (event.clientY - rect.top) / rect.height - drag.dy,
            },
            this.heightFraction(current.width),
          )
        : current,
    );
  }

  protected dragEnd(): void {
    this.drag = null;
  }

  /** The signature's height as a fraction of page height, for clamping. */
  private heightFraction(width: number): number {
    const sheet = this.sheet()?.nativeElement;
    const aspect = this.signature()?.aspect ?? 0.3;
    if (!sheet) {
      return width * aspect;
    }
    const rect = sheet.getBoundingClientRect();
    return (width * aspect * rect.width) / rect.height || 0;
  }

  // --- Export ------------------------------------------------------------
  protected async sign(): Promise<void> {
    const bytes = this.bytes;
    const signature = this.signature();
    const placement = this.placement();
    if (!bytes || !signature || !placement || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const image = await doc.embedPng(signature.png);
      const page = doc.getPage(placement.page);
      // ponytail: pages with their own /Rotate are shown unrotated here and
      // signed in that frame; rotate the image to match if it ever matters.
      page.drawImage(image, toPdfRect(placement, page.getSize(), signature.aspect));
      const out = await doc.save();
      downloadBytes(out, `${this.fileName().replace(/\.pdf$/i, '')}-signed.pdf`, 'application/pdf');
    } catch {
      this.showError('This PDF could not be signed. It may be damaged or encrypted.');
    } finally {
      this.busy.set(false);
    }
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  }
}
