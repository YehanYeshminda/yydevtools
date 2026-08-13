import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { describeFile, formatBytes } from '../../core/format';
import { looksLikePdf, readPageCount } from '../../core/pdf-probe';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { PdfPreview } from '../../shared/pdf-preview/pdf-preview';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { ToolContent } from '../../shared/tool-content/tool-content';

/** The document is held in memory, so reject anything unreasonable up front. */
const MAX_INPUT_BYTES = 100 * 1024 * 1024;

@Component({
  selector: 'app-pdf-viewer',
  imports: [ToolPage, Dropzone, ToolContent, MatButtonModule, NgIcon, PdfPreview],
  templateUrl: './pdf-viewer.html',
  styleUrls: ['../tool-shell.css', './pdf-viewer.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfViewerTool {
  private readonly snackBar = inject(MatSnackBar);

  protected readonly fileName = signal('');
  protected readonly fileSize = signal(0);
  /** Null when the page tree could not be read; the summary then omits it. */
  protected readonly pageCount = signal<number | null>(null);
  protected readonly bytes = signal<Uint8Array | null>(null);

  protected readonly hasFile = computed(() => this.bytes() !== null);

  /** The "name · pages · size" line shown above the viewer. */
  protected readonly fileSummary = computed(() =>
    describeFile(this.fileName(), this.pageCount(), this.fileSize()),
  );

  /** Single-file tool, so anything past the first dropped file is ignored. */
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
    // Only the header is checked here. pdf.js opens the document for real a
    // moment later and reports anything worse in its own words, so parsing it
    // twice would just be a second opinion nobody reads.
    if (!looksLikePdf(bytes)) {
      this.showError(`"${file.name}" is not a readable PDF.`);
      return;
    }

    this.pageCount.set(await readPageCount(bytes));
    this.fileName.set(file.name);
    this.fileSize.set(file.size);
    this.bytes.set(bytes);
  }

  protected clear(): void {
    this.bytes.set(null);
    this.fileName.set('');
    this.fileSize.set(0);
    this.pageCount.set(null);
  }

  protected formatBytes(bytes: number): string {
    return formatBytes(bytes);
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  }
}
