import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ClipboardService } from '../../core/clipboard.service';
import { downloadText } from '../../core/download';
import { formatBytes } from '../../core/format';
import { Spinner } from '../../shared/spinner/spinner';
import { HashWorkerClient, type Digest } from './hash-worker.client';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { ToolContent } from '../../shared/tool-content/tool-content';

export type { Digest };

type Source = 'text' | 'file';

/** One queued file and its digests. */
interface FileEntry {
  id: number;
  file: File;
  name: string;
  size: number;
  digests: Digest[] | null;
  error: string | null;
  working: boolean;
}

/** Hashing a file reads it fully into memory, so cap the input. */
const MAX_FILE_BYTES = 250 * 1024 * 1024;

/** A ceiling on the queue — each file is read whole, one after another. */
const MAX_FILES = 50;

/** Shown inline on each row of the file list until the user picks another. */
const DEFAULT_ALGORITHM = 'SHA-256';

@Component({
  selector: 'app-hash-generator',
  imports: [Dropzone, ToolContent, RouterLink, MatButtonModule, NgIcon, Spinner],
  templateUrl: './hash-generator.html',
  styleUrls: ['../tool-shell.css', './hash-generator.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HashGeneratorTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly clipboard = inject(ClipboardService);
  /** All hashing happens off the main thread where a worker is available. */
  private readonly hasher = new HashWorkerClient();

  protected readonly maxFiles = MAX_FILES;

  // --- State ------------------------------------------------------------
  protected readonly source = signal<Source>('text');
  protected readonly text = signal('');
  protected readonly uppercase = signal(false);
  protected readonly hashing = signal(false);
  protected readonly digests = signal<Digest[]>([]);
  /** When set, the tool emits keyed HMAC digests instead of plain checksums. */
  protected readonly hmacKey = signal('');

  protected readonly files = signal<FileEntry[]>([]);
  /** Which digest is shown on each file row, and written to the checksum file. */
  protected readonly algorithm = signal(DEFAULT_ALGORITHM);
  /** Compared against every digest, to answer "is this the file I expected?". */
  protected readonly expected = signal('');

  protected readonly hmacMode = computed(() => this.hmacKey() !== '');
  protected readonly hasFiles = computed(() => this.files().length > 0);
  protected readonly doneFiles = computed(() =>
    this.files().filter((entry) => entry.digests !== null),
  );

  /** The algorithms actually produced, taken from whichever file has finished. */
  protected readonly algorithms = computed(() => {
    const withDigests = this.files().find((entry) => entry.digests !== null);
    const source = withDigests?.digests ?? this.digests();
    return source.map((digest) => digest.algorithm);
  });

  /**
   * Where the pasted checksum matches, if anywhere.
   *
   * Every algorithm is compared rather than only the selected one, so pasting a
   * digest without knowing what produced it still identifies both the file and
   * the algorithm — which is the situation people are usually in.
   */
  protected readonly verification = computed(() => {
    const wanted = this.expected().trim().toLowerCase();
    if (wanted === '') {
      return null;
    }
    for (const entry of this.files()) {
      for (const digest of entry.digests ?? []) {
        if (digest.hex === wanted) {
          return { matched: true, name: entry.name, algorithm: digest.algorithm };
        }
      }
    }
    for (const digest of this.digests()) {
      if (digest.hex === wanted) {
        return { matched: true, name: 'the text above', algorithm: digest.algorithm };
      }
    }
    return { matched: false, name: '', algorithm: '' };
  });

  /**
   * Increments on every new request so a slow digest that resolves late cannot
   * overwrite the results of a newer one.
   */
  private requestId = 0;
  private fileRunToken = 0;
  private nextId = 0;

  /** The last text bytes hashed, kept so toggling the HMAC key re-hashes them. */
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
    if (source === 'text') {
      void this.hashText(this.text());
    }
  }

  protected onTextInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.text.set(value);
    void this.hashText(value);
  }

  protected addFiles(list: File[]): void {
    const room = MAX_FILES - this.files().length;
    if (room <= 0) {
      this.showError(`You can hash up to ${MAX_FILES} files at a time.`);
      return;
    }

    const added: FileEntry[] = [];
    for (const file of list.slice(0, room)) {
      if (file.size > MAX_FILE_BYTES) {
        this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_FILE_BYTES)}).`);
        continue;
      }
      added.push({
        id: this.nextId++,
        file,
        name: file.name,
        size: file.size,
        digests: null,
        error: null,
        working: false,
      });
    }

    if (added.length) {
      this.files.update((current) => [...current, ...added]);
      void this.runFiles(added);
    }
  }

  protected setAlgorithm(algorithm: string): void {
    this.algorithm.set(algorithm);
  }

  protected onExpectedInput(event: Event): void {
    this.expected.set((event.target as HTMLInputElement).value);
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
    if (this.files().length) {
      void this.runFiles(this.files());
    }
  }

  protected removeFile(id: number): void {
    this.files.update((current) => current.filter((entry) => entry.id !== id));
  }

  protected clear(): void {
    this.text.set('');
    this.digests.set([]);
    this.files.set([]);
    this.expected.set('');
    this.lastData = null;
    this.requestId++;
    this.fileRunToken++;
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

  /**
   * Hashes the given files one after another.
   *
   * Sequential on purpose: each file is read whole into memory, so running a
   * queue of them in parallel would multiply peak usage by the queue length for
   * no gain — the worker hashes on one thread either way.
   */
  private async runFiles(entries: FileEntry[]): Promise<void> {
    const token = ++this.fileRunToken;
    this.hashing.set(true);

    for (const entry of entries) {
      if (token !== this.fileRunToken) {
        return;
      }
      // Skip anything removed while the queue was running.
      if (!this.files().some((current) => current.id === entry.id)) {
        continue;
      }
      this.patchFile(entry.id, { working: true, error: null });

      try {
        const data = new Uint8Array(await entry.file.arrayBuffer());
        const digests = await this.hasher.digest(data, this.hmacKey());
        if (token !== this.fileRunToken) {
          return;
        }
        this.patchFile(entry.id, { digests, working: false, error: null });
      } catch {
        if (token !== this.fileRunToken) {
          return;
        }
        this.patchFile(entry.id, {
          working: false,
          digests: null,
          error: 'Could not be read or hashed.',
        });
      }
    }

    if (token === this.fileRunToken) {
      this.hashing.set(false);
    }
  }

  private patchFile(id: number, changes: Partial<FileEntry>): void {
    this.files.update((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)),
    );
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

  protected digestFor(entry: FileEntry): string | null {
    const match = entry.digests?.find((digest) => digest.algorithm === this.algorithm());
    return match ? this.present(match.hex) : null;
  }

  protected copy(hex: string, algorithm: string): void {
    void this.clipboard.copy(this.present(hex), {
      message: `${algorithm} digest copied to clipboard`,
    });
  }

  protected copyChecksums(): void {
    void this.clipboard.copy(this.checksumFile(), {
      message: `${this.doneFiles().length} checksums copied to clipboard`,
    });
  }

  protected downloadChecksums(): void {
    const algorithm = this.algorithm().toLowerCase().replace(/[^a-z0-9]+/g, '');
    downloadText(`${this.checksumFile()}\n`, `checksums.${algorithm}.txt`);
  }

  /**
   * The queue as a checksum manifest.
   *
   * The two-space separator is not decoration — it is the format `sha256sum`
   * and its relatives read, so the output of this tool can be fed straight to
   * `sha256sum -c` to verify the same files elsewhere.
   */
  private checksumFile(): string {
    return this.doneFiles()
      .map((entry) => {
        const hex = entry.digests?.find((digest) => digest.algorithm === this.algorithm())?.hex;
        return hex ? `${this.present(hex)}  ${entry.name}` : null;
      })
      .filter((line): line is string => line !== null)
      .join('\n');
  }

  protected formatBytes(bytes: number): string {
    return formatBytes(bytes);
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  }
}
