import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { PDFDocument } from 'pdf-lib';
import { PdfPreview } from '../../shared/pdf-preview/pdf-preview';

/** The document is held in memory, so reject anything unreasonable up front. */
const MAX_INPUT_BYTES = 100 * 1024 * 1024;

@Component({
  selector: 'app-pdf-viewer',
  imports: [RouterLink, MatButtonModule, MatIconModule, PdfPreview],
  templateUrl: './pdf-viewer.html',
  styleUrls: ['../tool-shell.css', './pdf-viewer.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfViewerTool {
  private readonly snackBar = inject(MatSnackBar);

  protected readonly fileName = signal('');
  protected readonly fileSize = signal(0);
  protected readonly pageCount = signal(0);
  protected readonly bytes = signal<Uint8Array | null>(null);
  protected readonly dragOver = signal(false);

  protected readonly hasFile = computed(() => this.bytes() !== null);

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
      // Parse once so we can show a page count and catch unreadable files
      // before handing anything to the viewer.
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      this.pageCount.set(doc.getPageCount());
      this.fileName.set(file.name);
      this.fileSize.set(file.size);
      this.bytes.set(bytes);
    } catch {
      this.showError(`"${file.name}" could not be read. It may be corrupt or password-protected.`);
    }
  }

  protected clear(): void {
    this.bytes.set(null);
    this.fileName.set('');
    this.fileSize.set(0);
    this.pageCount.set(0);
  }

  protected formatBytes(bytes: number): string {
    return formatBytes(bytes);
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded =
    value >= 10 || Number.isInteger(value) ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}
