import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { PDFDocument } from '@cantoo/pdf-lib';
import { downloadBytes, fileStem } from '../../core/download';
import { formatBytes } from '../../core/format';
import { downloadZip, type ZipEntry } from '../../core/zip';
import { PdfPreview } from '../../shared/pdf-preview/pdf-preview';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';

/** How the selected pages are written out. */
export type SplitMode = 'single' | 'perPage';

export type Selection =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  /** `pages` holds 1-based page numbers, in the order the user asked for. */
  | { kind: 'ok'; pages: number[] };

/** Splitting is done in memory, so reject anything unreasonable up front. */
const MAX_INPUT_BYTES = 100 * 1024 * 1024;

@Component({
  selector: 'app-pdf-split',
  imports: [ToolContent, RouterLink, MatButtonModule, MatIconModule, Spinner, PdfPreview],
  templateUrl: './pdf-split.html',
  styleUrls: ['../tool-shell.css', './pdf-split.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfSplitTool {
  private readonly snackBar = inject(MatSnackBar);

  // --- State ------------------------------------------------------------
  protected readonly fileName = signal('');
  protected readonly fileSize = signal(0);
  protected readonly pageCount = signal(0);
  protected readonly ranges = signal('');
  protected readonly mode = signal<SplitMode>('single');
  protected readonly working = signal(false);
  protected readonly dragOver = signal(false);

  /** The loaded document, exposed so the template can preview it. */
  protected readonly bytes = signal<Uint8Array | null>(null);

  protected readonly hasFile = computed(() => this.pageCount() > 0);

  protected readonly selection = computed<Selection>(() =>
    parseRanges(this.ranges().trim(), this.pageCount()),
  );

  protected readonly selectedPages = computed(() => {
    const selection = this.selection();
    return selection.kind === 'ok' ? selection.pages : [];
  });

  protected readonly canSplit = computed(
    () => this.hasFile() && this.selectedPages().length > 0 && !this.working(),
  );

  // --- File selection ---------------------------------------------------
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so picking the same file again still fires (change).
    input.value = '';
    if (file) {
      void this.load(file);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void this.load(file);
    }
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  protected onDragLeave(): void {
    this.dragOver.set(false);
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

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      this.bytes.set(bytes);
      this.fileName.set(file.name);
      this.fileSize.set(file.size);
      this.pageCount.set(doc.getPageCount());
      // Default to the whole document so the tool is useful before any typing.
      this.ranges.set(`1-${doc.getPageCount()}`);
    } catch {
      this.showError(`"${file.name}" could not be read. It may be corrupt or password-protected.`);
    }
  }

  protected clear(): void {
    this.bytes.set(null);
    this.fileName.set('');
    this.fileSize.set(0);
    this.pageCount.set(0);
    this.ranges.set('');
  }

  // --- Selection --------------------------------------------------------
  protected onRangesInput(event: Event): void {
    this.ranges.set((event.target as HTMLInputElement).value);
  }

  protected selectAll(): void {
    this.ranges.set(`1-${this.pageCount()}`);
  }

  protected selectOdd(): void {
    this.ranges.set(everyOther(this.pageCount(), 1).join(', '));
  }

  protected selectEven(): void {
    this.ranges.set(everyOther(this.pageCount(), 2).join(', '));
  }

  protected selectMode(mode: SplitMode): void {
    this.mode.set(mode);
  }

  // --- Split ------------------------------------------------------------
  protected async split(): Promise<void> {
    const source = this.bytes();
    const pages = this.selectedPages();
    if (!source || !pages.length || this.working()) {
      return;
    }

    this.working.set(true);
    try {
      const doc = await PDFDocument.load(source, { ignoreEncryption: true });
      const stem = fileStem(this.fileName(), 'document');

      if (this.mode() === 'single') {
        const out = await PDFDocument.create();
        const copied = await out.copyPages(
          doc,
          pages.map((page) => page - 1),
        );
        for (const page of copied) {
          out.addPage(page);
        }
        downloadBytes(await out.save(), `${stem}-pages.pdf`, 'application/pdf');
        return;
      }

      // One file per page used to mean one download per page, which browsers
      // throttle and then block outright — the tool could only warn about it.
      // A single archive sidesteps the limit entirely, however many pages.
      const entries: ZipEntry[] = [];
      for (const page of pages) {
        const out = await PDFDocument.create();
        const [copied] = await out.copyPages(doc, [page - 1]);
        out.addPage(copied);
        entries.push({ name: `${stem}-p${page}.pdf`, bytes: await out.save() });
      }

      if (entries.length === 1) {
        downloadBytes(entries[0].bytes, entries[0].name, 'application/pdf');
      } else {
        await downloadZip(entries, `${stem}-pages.zip`);
      }
    } catch {
      this.showError('Could not split this PDF. It may be corrupt or protected.');
    } finally {
      this.working.set(false);
    }
  }

  // --- Helpers ----------------------------------------------------------
  protected formatBytes(bytes: number): string {
    return formatBytes(bytes);
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  }
}

// --- Pure helpers -------------------------------------------------------

/**
 * Parses a page selection such as `1-3, 5, 8-` into 1-based page numbers.
 * Duplicates are dropped but the user's ordering is preserved, so `3,1` really
 * does put page 3 first.
 */
function parseRanges(raw: string, pageCount: number): Selection {
  if (pageCount === 0 || raw === '') {
    return { kind: 'empty' };
  }

  const pages: number[] = [];
  const seen = new Set<number>();

  for (const part of raw.split(',')) {
    const token = part.trim();
    if (token === '') {
      continue;
    }

    const match = /^(\d+)?\s*(-)?\s*(\d+)?$/.exec(token);
    if (!match || (!match[1] && !match[3])) {
      return { kind: 'error', message: `"${token}" is not a page or range.` };
    }

    const [, startRaw, dash, endRaw] = match;
    const start = startRaw ? Number(startRaw) : 1;
    const end = dash ? (endRaw ? Number(endRaw) : pageCount) : start;

    if (start < 1 || end < 1 || start > pageCount || end > pageCount) {
      return {
        kind: 'error',
        message: `"${token}" is out of range — this PDF has ${pageCount} pages.`,
      };
    }

    const step = start <= end ? 1 : -1;
    for (let page = start; step > 0 ? page <= end : page >= end; page += step) {
      if (!seen.has(page)) {
        seen.add(page);
        pages.push(page);
      }
    }
  }

  if (!pages.length) {
    return { kind: 'empty' };
  }
  return { kind: 'ok', pages };
}

function everyOther(pageCount: number, first: number): number[] {
  const pages: number[] = [];
  for (let page = first; page <= pageCount; page += 2) {
    pages.push(page);
  }
  return pages;
}
