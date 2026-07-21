import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';

/** The digests WebCrypto exposes, in ascending strength. */
const ALGORITHMS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;
type Algorithm = (typeof ALGORITHMS)[number];

export interface Digest {
  algorithm: Algorithm;
  hex: string;
}

type Source = 'text' | 'file';

/** Hashing a file reads it fully into memory, so cap the input. */
const MAX_FILE_BYTES = 250 * 1024 * 1024;

@Component({
  selector: 'app-hash-generator',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './hash-generator.html',
  styleUrls: ['../tool-shell.css', './hash-generator.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HashGeneratorTool {
  private readonly snackBar = inject(MatSnackBar);

  protected readonly algorithms = ALGORITHMS;

  // --- State ------------------------------------------------------------
  protected readonly source = signal<Source>('text');
  protected readonly text = signal('');
  protected readonly fileName = signal('');
  protected readonly fileSize = signal(0);
  protected readonly uppercase = signal(false);
  protected readonly hashing = signal(false);
  protected readonly digests = signal<Digest[]>([]);

  /**
   * Increments on every new request so a slow digest that resolves late cannot
   * overwrite the results of a newer one.
   */
  private requestId = 0;

  // --- Input handling ---------------------------------------------------
  protected selectSource(source: Source): void {
    if (this.source() === source) {
      return;
    }
    this.source.set(source);
    this.digests.set([]);
    this.fileName.set('');
    this.fileSize.set(0);
    if (source === 'text') {
      void this.hashText(this.text());
    }
  }

  protected onTextInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.text.set(value);
    void this.hashText(value);
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so picking the same file again still fires (change).
    input.value = '';
    if (file) {
      void this.hashFile(file);
    }
  }

  protected toggleCase(): void {
    this.uppercase.update((value) => !value);
  }

  protected clear(): void {
    this.text.set('');
    this.fileName.set('');
    this.fileSize.set(0);
    this.digests.set([]);
    this.requestId++;
  }

  // --- Hashing ----------------------------------------------------------
  private async hashText(value: string): Promise<void> {
    if (value === '') {
      this.requestId++;
      this.digests.set([]);
      return;
    }
    await this.digest(new TextEncoder().encode(value));
  }

  private async hashFile(file: File): Promise<void> {
    if (file.size > MAX_FILE_BYTES) {
      this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_FILE_BYTES)}).`);
      return;
    }
    this.fileName.set(file.name);
    this.fileSize.set(file.size);
    try {
      await this.digest(await file.arrayBuffer());
    } catch {
      this.showError(`"${file.name}" could not be read.`);
    }
  }

  private async digest(data: BufferSource): Promise<void> {
    const id = ++this.requestId;
    this.hashing.set(true);
    try {
      const results: Digest[] = [];
      for (const algorithm of ALGORITHMS) {
        const buffer = await crypto.subtle.digest(algorithm, data);
        results.push({ algorithm, hex: toHex(buffer) });
      }
      if (id === this.requestId) {
        this.digests.set(results);
      }
    } catch {
      if (id === this.requestId) {
        this.digests.set([]);
        this.showError('Hashing failed. WebCrypto needs a secure context (HTTPS or localhost).');
      }
    } finally {
      if (id === this.requestId) {
        this.hashing.set(false);
      }
    }
  }

  // --- Output -----------------------------------------------------------
  protected present(hex: string): string {
    return this.uppercase() ? hex.toUpperCase() : hex;
  }

  protected async copy(hex: string, algorithm: string): Promise<void> {
    await navigator.clipboard.writeText(this.present(hex));
    this.snackBar.open(`${algorithm} digest copied to clipboard`, undefined, { duration: 2000 });
  }

  protected formatBytes(bytes: number): string {
    return formatBytes(bytes);
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  }
}

// --- Pure helpers -------------------------------------------------------
function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
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
