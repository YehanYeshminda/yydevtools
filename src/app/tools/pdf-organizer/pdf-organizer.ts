import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { PDFDocument, degrees } from '@cantoo/pdf-lib';

import { downloadBytes, fileStem } from '../../core/download';
import { formatBytes } from '../../core/format';
import { looksLikePdf } from '../../core/pdf-probe';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import {
  insertBlankAfter,
  movePage,
  pagesForDocument,
  removePages,
  reversePages,
  rotatePages,
  type Page,
} from './organise';
import { PdfDocumentRenderer } from '../../core/pdf-render';

interface LoadedDoc {
  name: string;
  size: number;
  bytes: Uint8Array;
  renderer: PdfDocumentRenderer;
}

/** Everything is held in memory, so reject anything unreasonable up front. */
const MAX_INPUT_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 10;

/**
 * A ceiling on pages in one session.
 *
 * Arranging pages by hand stops being a sensible way to work long before this,
 * and every page costs a rendered thumbnail held in memory. Splitting a
 * thousand-page scan is what PDF Split's page ranges are for.
 */
const MAX_PAGES = 300;

/** Longest edge of a thumbnail, in CSS pixels. */
const THUMB_EDGE = 260;

@Component({
  selector: 'app-pdf-organizer',
  imports: [
    ToolContent,
    RouterLink,
    DragDropModule,
    MatButtonModule,
    MatIconModule,
    Spinner,
  ],
  templateUrl: './pdf-organizer.html',
  styleUrls: ['../tool-shell.css', './pdf-organizer.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfOrganizerTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);

  protected readonly maxFiles = MAX_FILES;
  protected readonly maxPages = MAX_PAGES;

  // --- State ------------------------------------------------------------
  protected readonly docs = signal<LoadedDoc[]>([]);
  protected readonly pages = signal<Page[]>([]);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  /** Thumbnails keyed by `doc:index`, so a page keeps its image as it moves. */
  protected readonly thumbs = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly loading = signal(false);
  protected readonly exporting = signal(false);
  protected readonly dragOver = signal(false);
  /** How many thumbnails are still to be drawn, for the progress line. */
  protected readonly pendingThumbs = signal(0);

  protected readonly hasPages = computed(() => this.pages().length > 0);
  protected readonly pageCount = computed(() => this.pages().length);
  protected readonly selectedCount = computed(() => this.selected().size);
  protected readonly busy = computed(() => this.loading() || this.exporting());

  protected readonly canExport = computed(() => this.hasPages() && !this.busy());
  protected readonly allSelected = computed(
    () => this.hasPages() && this.selected().size === this.pages().length,
  );

  /** Source-file summary, shown once more than one document is loaded. */
  protected readonly sources = computed(() =>
    this.docs().map((doc) => `${doc.name} (${formatBytes(doc.size)})`),
  );

  /** Guards a thumbnail run against a reset that happens while it is going. */
  private renderToken = 0;
  private nextId = 0;

  ngOnDestroy(): void {
    this.closeDocs();
  }

  // --- File selection ---------------------------------------------------
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (files.length) {
      void this.addFiles(files);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files?.length) {
      void this.addFiles(Array.from(files));
    }
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  protected onDragLeave(): void {
    this.dragOver.set(false);
  }

  private async addFiles(files: File[]): Promise<void> {
    if (this.docs().length + files.length > MAX_FILES) {
      this.showError(`You can open up to ${MAX_FILES} documents at once.`);
      return;
    }

    this.loading.set(true);
    try {
      for (const file of files) {
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
          this.showError(`"${file.name}" is not a PDF and was skipped.`);
          continue;
        }
        if (file.size > MAX_INPUT_BYTES) {
          this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
          continue;
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!looksLikePdf(bytes)) {
          this.showError(`"${file.name}" is not a readable PDF.`);
          continue;
        }

        let renderer: PdfDocumentRenderer;
        try {
          renderer = await PdfDocumentRenderer.open(bytes);
        } catch {
          this.showError(`"${file.name}" could not be opened. It may be corrupt or protected.`);
          continue;
        }

        const room = MAX_PAGES - this.pages().length;
        if (room <= 0) {
          renderer.close();
          this.showError(`That would exceed the ${MAX_PAGES}-page limit for this tool.`);
          break;
        }

        const sizes = (await renderer.pageSizes()).slice(0, room);
        if (renderer.pageCount > sizes.length) {
          this.showError(
            `Only the first ${sizes.length} pages of "${file.name}" were added (limit ${MAX_PAGES}).`,
          );
        }

        const docIndex = this.docs().length;
        this.docs.update((current) => [
          ...current,
          { name: file.name, size: file.size, bytes, renderer },
        ]);
        const added = pagesForDocument(docIndex, sizes, this.nextId);
        this.nextId += sizes.length;
        this.pages.update((current) => [...current, ...added]);

        void this.renderThumbnails(docIndex, renderer, sizes.length);
      }
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Draws each page's thumbnail in the background, one at a time.
   *
   * Sequential on purpose: rasterising is the expensive part, and running a
   * whole document's worth in parallel would fight the main thread for exactly
   * the frames the user needs to scroll and drag. They appear in reading order
   * as they finish.
   */
  private async renderThumbnails(
    doc: number,
    renderer: PdfDocumentRenderer,
    count: number,
  ): Promise<void> {
    const token = this.renderToken;
    this.pendingThumbs.update((value) => value + count);

    for (let index = 0; index < count; index++) {
      if (token !== this.renderToken) {
        return; // the session was reset under us
      }
      try {
        const dataUrl = await renderer.renderThumbnail(index, THUMB_EDGE);
        if (token !== this.renderToken) {
          return;
        }
        this.thumbs.update((current) => new Map(current).set(`${doc}:${index}`, dataUrl));
      } catch {
        // One page that will not draw should not stop the rest; the card keeps
        // its placeholder and every other operation still works on it.
      } finally {
        this.pendingThumbs.update((value) => Math.max(0, value - 1));
      }
    }
  }

  // --- Page operations --------------------------------------------------
  protected thumbFor(page: Page): string | null {
    return page.kind === 'source'
      ? (this.thumbs().get(`${page.doc}:${page.index}`) ?? null)
      : null;
  }

  protected sourceLabel(page: Page): string {
    if (page.kind === 'blank') {
      return 'Blank page';
    }
    const name = this.docs()[page.doc]?.name ?? 'document';
    return `Page ${page.index + 1} of ${name}`;
  }

  protected drop(event: CdkDragDrop<unknown>): void {
    this.pages.update((pages) => movePage(pages, event.previousIndex, event.currentIndex));
  }

  /** Keyboard-reachable equivalent of a drag, one position at a time. */
  protected move(index: number, delta: number): void {
    this.pages.update((pages) => movePage(pages, index, index + delta));
  }

  protected rotateOne(id: string, turns: number): void {
    this.pages.update((pages) => rotatePages(pages, new Set([id]), turns));
  }

  protected removeOne(id: string): void {
    this.pages.update((pages) => removePages(pages, new Set([id])));
    this.deselect(id);
  }

  protected insertBlank(index: number): void {
    this.pages.update((pages) => insertBlankAfter(pages, index, `b${this.nextId++}`));
  }

  protected reverse(): void {
    this.pages.update(reversePages);
  }

  // --- Selection --------------------------------------------------------
  protected isSelected(id: string): boolean {
    return this.selected().has(id);
  }

  protected toggleSelected(id: string): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  private deselect(id: string): void {
    this.selected.update((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  protected selectAll(): void {
    this.selected.set(new Set(this.pages().map((page) => page.id)));
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  protected rotateSelected(turns: number): void {
    this.pages.update((pages) => rotatePages(pages, this.selected(), turns));
  }

  protected removeSelected(): void {
    this.pages.update((pages) => removePages(pages, this.selected()));
    this.clearSelection();
  }

  // --- Export -----------------------------------------------------------
  /**
   * Writes the arranged document.
   *
   * Pages are copied per source document in one `copyPages` call rather than
   * one call each: pdf-lib re-walks the source's object graph on every call, so
   * interleaving two documents page by page would do that hundreds of times.
   * The copies are then placed in the order the user actually arranged.
   */
  protected async export(): Promise<void> {
    const pages = this.pages();
    const docs = this.docs();
    if (!pages.length || this.exporting()) {
      return;
    }

    this.exporting.set(true);
    try {
      const out = await PDFDocument.create();

      // Which pages each source contributes, in the order pdf-lib will copy them.
      const wanted = new Map<number, number[]>();
      for (const page of pages) {
        if (page.kind === 'source') {
          const list = wanted.get(page.doc) ?? [];
          if (!list.includes(page.index)) {
            list.push(page.index);
          }
          wanted.set(page.doc, list);
        }
      }

      const copied = new Map<string, Awaited<ReturnType<typeof out.copyPages>>[number]>();
      for (const [doc, indices] of wanted) {
        const source = await PDFDocument.load(docs[doc].bytes, { ignoreEncryption: true });
        const batch = await out.copyPages(source, indices);
        indices.forEach((index, at) => copied.set(`${doc}:${index}`, batch[at]));
      }

      for (const page of pages) {
        if (page.kind === 'blank') {
          out.addPage([page.width, page.height]);
          continue;
        }
        const embedded = copied.get(`${page.doc}:${page.index}`);
        if (!embedded) {
          continue;
        }
        if (page.rotation !== 0) {
          // Add to whatever the page already carried, so a scan that was
          // already sideways ends up where the thumbnail showed it.
          embedded.setRotation(degrees((embedded.getRotation().angle + page.rotation) % 360));
        }
        out.addPage(embedded);
      }

      downloadBytes(await out.save(), this.outputName(), 'application/pdf');
    } catch {
      this.showError('Could not build the document. One of the files may be corrupt or protected.');
    } finally {
      this.exporting.set(false);
    }
  }

  protected reset(): void {
    this.renderToken++;
    this.closeDocs();
    this.docs.set([]);
    this.pages.set([]);
    this.thumbs.set(new Map());
    this.selected.set(new Set());
    this.pendingThumbs.set(0);
  }

  // --- Helpers ----------------------------------------------------------
  protected formatBytes(bytes: number): string {
    return formatBytes(bytes);
  }

  private outputName(): string {
    const first = this.docs()[0];
    return first ? `${fileStem(first.name, 'document')}-organised.pdf` : 'organised.pdf';
  }

  private closeDocs(): void {
    for (const doc of this.docs()) {
      doc.renderer.close();
    }
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  }
}
