import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ClipboardService } from '../../core/clipboard.service';
import { formatBytes } from '../../core/format';
import { Spinner } from '../../shared/spinner/spinner';
import { HashWorkerClient, type Digest } from './hash-worker.client';
import { ToolContent } from '../../shared/tool-content/tool-content';

export type { Digest };

type Source = 'text' | 'file';

/** Hashing a file reads it fully into memory, so cap the input. */
const MAX_FILE_BYTES = 250 * 1024 * 1024;

@Component({
  selector: 'app-hash-generator',
  imports: [ToolContent, RouterLink, MatButtonModule, MatIconModule, Spinner],
  templateUrl: './hash-generator.html',
  styleUrls: ['../tool-shell.css', './hash-generator.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HashGeneratorTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly clipboard = inject(ClipboardService);
  /** All hashing happens off the main thread where a worker is available. */
  private readonly hasher = new HashWorkerClient();

  // --- State ------------------------------------------------------------
  protected readonly source = signal<Source>('text');
  protected readonly text = signal('');
  protected readonly fileName = signal('');
  protected readonly fileSize = signal(0);
  protected readonly uppercase = signal(false);
  protected readonly hashing = signal(false);
  protected readonly digests = signal<Digest[]>([]);
  /** When set, the tool emits keyed HMAC digests instead of plain checksums. */
  protected readonly hmacKey = signal('');

  protected readonly hmacMode = computed(() => this.hmacKey() !== '');

  /**
   * Increments on every new request so a slow digest that resolves late cannot
   * overwrite the results of a newer one.
   */
  private requestId = 0;

  /** The last bytes hashed, kept so toggling the HMAC key re-hashes them. */
  private lastData: Uint8Array | null = null;

  ngOnDestroy(): void {
    this.hasher.terminate();
  }

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

  protected onHmacKeyInput(event: Event): void {
    this.hmacKey.set((event.target as HTMLInputElement).value);
    // Re-hash the current input under the new keying without re-reading a file.
    if (this.lastData) {
      void this.digest(this.lastData);
    }
  }

  protected clear(): void {
    this.text.set('');
    this.fileName.set('');
    this.fileSize.set(0);
    this.digests.set([]);
    this.lastData = null;
    this.requestId++;
  }

  // --- Hashing ----------------------------------------------------------
  private async hashText(value: string): Promise<void> {
    if (value === '') {
      this.requestId++;
      this.lastData = null;
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
      await this.digest(new Uint8Array(await file.arrayBuffer()));
    } catch {
      this.showError(`"${file.name}" could not be read.`);
    }
  }

  private async digest(data: Uint8Array): Promise<void> {
    const id = ++this.requestId;
    this.lastData = data;
    this.hashing.set(true);
    try {
      const results = await this.hasher.digest(data, this.hmacKey());
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

  protected copy(hex: string, algorithm: string): void {
    void this.clipboard.copy(this.present(hex), { message: `${algorithm} digest copied to clipboard` });
  }

  protected formatBytes(bytes: number): string {
    return formatBytes(bytes);
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  }
}
