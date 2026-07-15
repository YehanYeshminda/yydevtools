import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { PDFDocument } from 'pdf-lib';

/** A PDF queued for merging. The bytes are kept so we can merge without re-reading. */
interface PdfItem {
  id: number;
  name: string;
  size: number;
  pageCount: number;
  bytes: Uint8Array;
}

/** Reject anything larger than this up front — merging is done entirely in memory. */
const MAX_INPUT_BYTES = 100 * 1024 * 1024;

@Component({
  selector: 'app-pdf-merge',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './pdf-merge.html',
  styleUrl: './pdf-merge.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfMergeTool {
  private readonly snackBar = inject(MatSnackBar);

  // --- State ------------------------------------------------------------
  protected readonly files = signal<PdfItem[]>([]);
  protected readonly merging = signal(false);
  protected readonly dragOver = signal(false);

  protected readonly totalPages = computed(() =>
    this.files().reduce((sum, file) => sum + file.pageCount, 0),
  );
  protected readonly totalSize = computed(() =>
    this.files().reduce((sum, file) => sum + file.size, 0),
  );

  private nextId = 0;

  // --- File selection ---------------------------------------------------
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    // Copy out of the live FileList before resetting — clearing `input.value`
    // also empties `input.files`, which would otherwise leave us nothing to add.
    const files = input.files ? Array.from(input.files) : [];
    // Reset so picking the same file again still fires (change).
    input.value = '';
    if (files.length) {
      void this.addFiles(files);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files && files.length) {
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

  private async addFiles(list: File[]): Promise<void> {
    const added: PdfItem[] = [];
    for (const file of list) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        this.showError(`"${file.name}" is not a PDF and was skipped.`);
        continue;
      }
      if (file.size > MAX_INPUT_BYTES) {
        this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
        continue;
      }

      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        // Parse it once to get a page count and confirm it is a readable PDF.
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        added.push({
          id: this.nextId++,
          name: file.name,
          size: file.size,
          pageCount: doc.getPageCount(),
          bytes,
        });
      } catch {
        this.showError(`"${file.name}" could not be read. It may be corrupt or password-protected.`);
      }
    }

    if (added.length > 0) {
      this.files.update((current) => [...current, ...added]);
    }
  }

  // --- List management --------------------------------------------------
  protected moveUp(index: number): void {
    if (index <= 0) {
      return;
    }
    this.files.update((current) => swap(current, index, index - 1));
  }

  protected moveDown(index: number): void {
    this.files.update((current) => {
      if (index >= current.length - 1) {
        return current;
      }
      return swap(current, index, index + 1);
    });
  }

  protected remove(id: number): void {
    this.files.update((current) => current.filter((file) => file.id !== id));
  }

  protected clearAll(): void {
    this.files.set([]);
  }

  // --- Merge ------------------------------------------------------------
  protected async merge(): Promise<void> {
    const items = this.files();
    if (items.length < 2 || this.merging()) {
      return;
    }

    this.merging.set(true);
    try {
      const merged = await PDFDocument.create();
      for (const item of items) {
        const source = await PDFDocument.load(item.bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(source, source.getPageIndices());
        for (const page of pages) {
          merged.addPage(page);
        }
      }
      const bytes = await merged.save();
      this.downloadBytes(bytes);
    } catch {
      this.showError('Could not merge these PDFs. One of them may be corrupt or protected.');
    } finally {
      this.merging.set(false);
    }
  }

  private downloadBytes(bytes: Uint8Array): void {
    // Copy into a fresh ArrayBuffer so the Blob owns a plain ArrayBuffer, not a
    // possibly-shared typed-array view.
    const blob = new Blob([bytes.slice()], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'merged.pdf';
    anchor.click();
    URL.revokeObjectURL(url);
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
function swap<T>(list: readonly T[], a: number, b: number): T[] {
  const copy = list.slice();
  [copy[a], copy[b]] = [copy[b], copy[a]];
  return copy;
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
