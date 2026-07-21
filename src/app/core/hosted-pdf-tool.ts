import { computed, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PDFDocument } from 'pdf-lib';
import { PdfServiceResult, PdfServicesClient, QuotaSnapshot } from './pdf-services.client';

/** Matches the Worker's own cap, so oversized files fail before the upload. */
export const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/**
 * Shared behaviour for the tools that spend an Adobe transaction: convert, OCR
 * and compress.
 *
 * They differ only in which endpoint they call and what they do with the bytes
 * that come back. Everything before and after that — picking a file, parsing it
 * locally so a bad PDF never costs quota, tracking the monthly allowance,
 * reporting failures — is identical, so it lives here.
 */
export abstract class HostedPdfTool {
  protected readonly service = inject(PdfServicesClient);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly fileName = signal('');
  protected readonly fileSize = signal(0);
  protected readonly pageCount = signal(0);
  protected readonly working = signal(false);
  protected readonly dragOver = signal(false);
  protected readonly quota = signal<QuotaSnapshot | null>(null);
  /** Non-empty when the hosted service cannot serve this tool at all. */
  protected readonly unavailable = signal('');

  protected bytes: Uint8Array | null = null;

  protected readonly hasFile = computed(() => this.pageCount() > 0);
  protected readonly canRun = computed(() => this.hasFile() && !this.working());

  constructor() {
    void this.refreshQuota();
  }

  private async refreshQuota(): Promise<void> {
    const snapshot = await this.service.usage();
    this.quota.set(snapshot);
    if (snapshot && !snapshot.configured) {
      this.unavailable.set('The hosted service is not configured on this deployment.');
    }
  }

  // --- File selection ---------------------------------------------------
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so re-picking the same file still fires a change event.
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
      // Parse locally first so an unreadable file never costs a transaction.
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      this.clear();
      this.bytes = bytes;
      this.fileName.set(file.name);
      this.fileSize.set(file.size);
      this.pageCount.set(doc.getPageCount());
    } catch {
      this.showError(`"${file.name}" could not be read. It may be corrupt or password-protected.`);
    }
  }

  /** Subclasses override to also drop whatever result they were holding. */
  protected clear(): void {
    this.bytes = null;
    this.fileName.set('');
    this.fileSize.set(0);
    this.pageCount.set(0);
  }

  // --- Running an operation ---------------------------------------------
  /**
   * Calls the hosted service with the loaded file and returns the result bytes,
   * or null if there was nothing to send or the call failed. Failures are
   * already reported to the user by the time this resolves.
   */
  protected async runHosted(
    call: (bytes: Uint8Array) => Promise<PdfServiceResult>,
  ): Promise<Uint8Array | null> {
    const source = this.bytes;
    if (!source || this.working()) {
      return null;
    }

    this.working.set(true);
    this.unavailable.set('');
    try {
      const result = await call(source);

      if (result.ok) {
        const remaining = result.remaining;
        if (remaining !== null) {
          this.quota.update((current) => (current ? { ...current, remaining } : current));
        }
        return result.bytes;
      }

      // None of these tools has a local equivalent, so when the service is down
      // the honest move is to say so rather than pretend with a worse result.
      if (result.failure.kind === 'unavailable') {
        this.unavailable.set(result.failure.message);
      } else {
        this.showError(result.failure.message);
      }
      return null;
    } finally {
      this.working.set(false);
    }
  }

  // --- Helpers ----------------------------------------------------------
  protected formatBytes(bytes: number): string {
    return formatBytes(bytes);
  }

  protected download(bytes: Uint8Array, name: string): void {
    const blob = new Blob([bytes.slice()]);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /** The input's name without its `.pdf` extension, for naming the output. */
  protected stem(): string {
    return this.fileName().replace(/\.pdf$/i, '');
  }

  protected showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  }
}

export function formatBytes(bytes: number): string {
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
