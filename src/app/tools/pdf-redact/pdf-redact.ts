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
import { PDFDocument, degrees } from '@cantoo/pdf-lib';

import { downloadBytes } from '../../core/download';
import { describeFile, formatBytes } from '../../core/format';
import { looksLikePdf } from '../../core/pdf-probe';
import { PdfDocumentRenderer } from '../../core/pdf-render';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { Box, dragBox, findBoxes } from './redact';

const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const PREVIEW_SCALE = 1.5;
/** Smaller than this (in page fractions) is a click, not a box. */
const MIN_BOX = 0.005;

/**
 * Redact PDF: black out regions or every occurrence of a phrase, then rebuild
 * the document from page images so the covered content is genuinely gone.
 *
 * Rasterising is the honest way to do this in a browser: editing content
 * streams to cut text out from under a rectangle is where most "redaction"
 * tools quietly fail and leave the words selectable. The cost is that the
 * result is image-only (no text layer, no metadata, no links), which the page
 * says plainly. ponytail: pages are drawn unrotated and the rotation is put
 * back on the page object, so the reader sees the same orientation.
 */
@Component({
  selector: 'app-pdf-redact',
  imports: [ToolPage, Dropzone, ToolContent, MatButtonModule, NgIcon, Spinner],
  templateUrl: './pdf-redact.html',
  styleUrls: ['../tool-shell.css', './pdf-redact.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfRedactTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly sheet = viewChild<ElementRef<HTMLElement>>('sheet');

  protected readonly fileName = signal('');
  protected readonly fileSize = signal(0);
  protected readonly pageCount = signal(0);
  protected readonly page = signal(0);
  protected readonly pageImage = signal<string | null>(null);
  protected readonly rendering = signal(false);
  protected readonly boxes = signal<Box[]>([]);
  protected readonly query = signal('');
  protected readonly searching = signal(false);
  protected readonly found = signal<{ count: number; pages: number } | null>(null);
  protected readonly dpi = signal(150);
  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  /** A box being dragged out right now. */
  protected readonly draft = signal<Box | null>(null);

  protected readonly hasFile = computed(() => this.fileName() !== '');
  protected readonly fileSummary = computed(() =>
    describeFile(this.fileName(), this.pageCount() || null, this.fileSize()),
  );
  protected readonly onPage = computed(() => this.boxes().filter((b) => b.page === this.page()));
  protected readonly pagesTouched = computed(() => new Set(this.boxes().map((b) => b.page)).size);
  protected readonly canApply = computed(() => this.boxes().length > 0 && !this.busy());

  private bytes: Uint8Array | null = null;
  private renderer: PdfDocumentRenderer | null = null;
  private renderToken = 0;
  private drag: { pointerId: number; start: { x: number; y: number } } | null = null;

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
    this.boxes.set([]);
    this.found.set(null);
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
      const { canvas } = await renderer.renderPageCanvas(index, PREVIEW_SCALE);
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
    this.boxes.set([]);
    this.found.set(null);
  }

  private closeDocument(): void {
    this.renderToken++;
    this.renderer?.close();
    this.renderer = null;
    this.bytes = null;
  }

  // --- Boxes by hand -----------------------------------------------------
  protected sheetDown(event: PointerEvent): void {
    const point = this.point(event);
    if (!point || !this.pageImage()) {
      return;
    }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.drag = { pointerId: event.pointerId, start: point };
    this.draft.set(dragBox(this.page(), point, point));
    event.preventDefault();
  }

  protected sheetMove(event: PointerEvent): void {
    const drag = this.drag;
    const point = this.point(event);
    if (!drag || drag.pointerId !== event.pointerId || !point) {
      return;
    }
    this.draft.set(dragBox(this.page(), drag.start, point));
  }

  protected sheetUp(event: PointerEvent): void {
    if (this.drag?.pointerId !== event.pointerId) {
      return;
    }
    this.drag = null;
    const box = this.draft();
    this.draft.set(null);
    if (box && box.width > MIN_BOX && box.height > MIN_BOX) {
      this.boxes.update((current) => [...current, box]);
    }
  }

  private point(event: PointerEvent): { x: number; y: number } | null {
    const sheet = this.sheet()?.nativeElement;
    if (!sheet) {
      return null;
    }
    const rect = sheet.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  protected removeBox(box: Box, event: Event): void {
    event.stopPropagation();
    this.boxes.update((current) => current.filter((b) => b !== box));
  }

  protected clearPage(): void {
    const page = this.page();
    this.boxes.update((current) => current.filter((b) => b.page !== page));
  }

  protected clearAll(): void {
    this.boxes.set([]);
    this.found.set(null);
  }

  // --- Boxes by search ---------------------------------------------------
  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected async find(): Promise<void> {
    const renderer = this.renderer;
    const query = this.query().trim();
    if (!renderer || !query || this.searching()) {
      return;
    }
    this.searching.set(true);
    try {
      const sizes = await renderer.pageSizes();
      const hits: Box[] = [];
      for (let index = 0; index < renderer.pageCount; index++) {
        hits.push(...findBoxes(index, await renderer.pageText(index), query, sizes[index]));
      }
      this.boxes.update((current) => [...current, ...hits]);
      this.found.set({ count: hits.length, pages: new Set(hits.map((h) => h.page)).size });
    } catch {
      this.showError('The text of this PDF could not be read. Draw the boxes by hand instead.');
    } finally {
      this.searching.set(false);
    }
  }

  protected setDpi(event: Event): void {
    this.dpi.set(Number((event.target as HTMLSelectElement).value) || 150);
  }

  // --- Apply -------------------------------------------------------------
  protected async apply(): Promise<void> {
    const renderer = this.renderer;
    if (!renderer || !this.bytes || !this.canApply()) {
      return;
    }
    this.busy.set(true);
    this.progress.set(0);
    try {
      const rotations = await renderer.pageRotations();
      const sizes = await renderer.pageSizes();
      const scale = this.dpi() / 72;
      const boxes = this.boxes();
      const out = await PDFDocument.create();

      for (let index = 0; index < renderer.pageCount; index++) {
        const { canvas } = await renderer.renderPageCanvas(index, scale);
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('no canvas');
        }
        context.fillStyle = '#000';
        for (const box of boxes) {
          if (box.page === index) {
            context.fillRect(
              Math.floor(box.x * canvas.width),
              Math.floor(box.y * canvas.height),
              Math.ceil(box.width * canvas.width),
              Math.ceil(box.height * canvas.height),
            );
          }
        }
        const jpeg = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', 0.85),
        );
        if (!jpeg) {
          throw new Error('encode');
        }
        const image = await out.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
        const page = out.addPage([sizes[index].width, sizes[index].height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: sizes[index].width,
          height: sizes[index].height,
        });
        if (rotations[index]) {
          page.setRotation(degrees(rotations[index]));
        }
        this.progress.set(Math.round(((index + 1) / renderer.pageCount) * 100));
      }

      const bytes = await out.save();
      downloadBytes(
        bytes,
        `${this.fileName().replace(/\.pdf$/i, '')}-redacted.pdf`,
        'application/pdf',
      );
    } catch {
      this.showError('The redacted PDF could not be built. Try a lower resolution.');
    } finally {
      this.busy.set(false);
    }
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 6000, panelClass: 'snack-error' });
  }
}
