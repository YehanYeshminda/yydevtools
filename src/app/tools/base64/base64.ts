import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

type TextMode = 'encode' | 'decode';

interface TextResult {
  value: string;
  error: string;
}

/** A live preview of decoded Base64, when the bytes are a recognisable image or PDF. */
interface DecodePreview {
  kind: 'image' | 'pdf' | 'other';
  /** Object URL of the decoded blob — used for the image preview and for downloading. */
  url: string;
  /** Same URL, trusted for an <iframe> — only set for PDFs. */
  frameUrl: SafeResourceUrl | null;
  mime: string;
}

/** Largest file we will encode in the browser. Everything is processed on-device. */
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

@Component({
  selector: 'app-base64',
  imports: [
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTabsModule,
  ],
  templateUrl: './base64.html',
  styleUrl: './base64.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Base64Tool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly sanitizer = inject(DomSanitizer);

  private lastTextError = '';

  constructor() {
    // Surface live text-tab errors as a snackbar, but only when the error first
    // appears — not repeatedly on every keystroke while the input stays invalid.
    effect(() => {
      const error = this.result().error;
      if (error && error !== this.lastTextError) {
        this.showError(error);
      }
      this.lastTextError = error;
    });

    // Rebuild the decode preview as the Base64 input changes. A short debounce
    // keeps typing/pasting smooth instead of decoding on every keystroke.
    effect((onCleanup) => {
      const raw = this.decodeInput();
      const handle = setTimeout(() => this.buildDecodePreview(raw), 250);
      onCleanup(() => clearTimeout(handle));
    });
  }

  ngOnDestroy(): void {
    this.releaseDecodePreview();
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', {
      duration: 5000,
      panelClass: 'snack-error',
    });
  }

  // --- Text tab ---------------------------------------------------------
  protected readonly mode = signal<TextMode>('encode');
  protected readonly input = signal('');

  protected readonly result = computed<TextResult>(() => {
    const text = this.input();
    if (text === '') {
      return { value: '', error: '' };
    }
    try {
      const value = this.mode() === 'encode' ? encodeBase64(text) : decodeBase64(text);
      return { value, error: '' };
    } catch {
      return { value: '', error: 'That input is not valid Base64.' };
    }
  });

  protected setMode(mode: TextMode): void {
    this.mode.set(mode);
  }

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected clearText(): void {
    this.input.set('');
  }

  /** Move the output back into the input and flip the mode — handy for round-tripping. */
  protected swap(): void {
    const output = this.result().value;
    if (output === '') {
      return;
    }
    this.input.set(output);
    this.mode.update((m) => (m === 'encode' ? 'decode' : 'encode'));
  }

  protected async copy(text: string): Promise<void> {
    if (text === '') {
      return;
    }
    await navigator.clipboard.writeText(text);
    this.snackBar.open('Copied to clipboard', undefined, { duration: 2000 });
  }

  // --- File tab: encode -------------------------------------------------
  protected readonly fileName = signal('');
  protected readonly fileBase64 = signal('');
  protected readonly fileMime = signal('');
  protected readonly withDataUri = signal(false);

  protected readonly encodedFileOutput = computed(() => {
    const base64 = this.fileBase64();
    if (base64 === '') {
      return '';
    }
    return this.withDataUri()
      ? `data:${this.fileMime() || 'application/octet-stream'};base64,${base64}`
      : base64;
  });

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset the input so picking the same file again still fires (change).
    input.value = '';
    if (!file) {
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.showError(`That file is too large. The maximum size is ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }

    this.fileName.set(file.name);
    this.fileMime.set(file.type);
    this.fileBase64.set('');
    this.encodeInBrowser(file);
  }

  private encodeInBrowser(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      // strip the "data:<mime>;base64," prefix to keep just the payload.
      this.fileBase64.set(dataUri.slice(dataUri.indexOf(',') + 1));
    };
    reader.onerror = () => this.showError('Could not read that file.');
    reader.readAsDataURL(file);
  }

  protected toggleDataUri(checked: boolean): void {
    this.withDataUri.set(checked);
  }

  // --- File tab: decode -------------------------------------------------
  protected readonly decodeInput = signal('');
  protected readonly decodeFileName = signal('decoded.bin');
  protected readonly decodePreview = signal<DecodePreview | null>(null);

  protected onDecodeInput(event: Event): void {
    this.decodeInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onDecodeFileName(event: Event): void {
    this.decodeFileName.set((event.target as HTMLInputElement).value);
  }

  /** Decode the current input into a blob and preview it if it's an image or PDF. */
  private buildDecodePreview(raw: string): void {
    this.releaseDecodePreview();

    const parsed = parseBase64Input(raw);
    if (!parsed) {
      // Silent while typing — a hard error is only raised when Download is clicked.
      this.decodePreview.set(null);
      return;
    }

    const kind = previewKind(parsed.mime);
    const url = URL.createObjectURL(new Blob([parsed.bytes], { type: parsed.mime }));
    this.decodePreview.set({
      kind,
      url,
      frameUrl: kind === 'pdf' ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null,
      mime: parsed.mime,
    });
    this.suggestDecodeFileName(parsed.mime);
  }

  /** Suggest an extension for the detected type, but never clobber a custom name. */
  private suggestDecodeFileName(mime: string): void {
    const current = this.decodeFileName().trim();
    if (current === '' || /^decoded\.[a-z0-9]+$/i.test(current)) {
      this.decodeFileName.set(`decoded.${extForMime(mime)}`);
    }
  }

  private releaseDecodePreview(): void {
    const preview = this.decodePreview();
    if (preview) {
      URL.revokeObjectURL(preview.url);
    }
  }

  protected downloadDecoded(): void {
    const raw = this.decodeInput().trim();
    if (raw === '') {
      return;
    }
    const parsed = parseBase64Input(raw);
    if (!parsed) {
      this.showError('That input is not valid Base64.');
      return;
    }
    const blob = new Blob([parsed.bytes], { type: parsed.mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = this.decodeFileName().trim() || 'decoded.bin';
    anchor.click();
    URL.revokeObjectURL(url);
  }
}

// --- Pure helpers (UTF-8 safe) ------------------------------------------
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
  const rounded = value >= 10 || Number.isInteger(value) ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64(base64: string): string {
  return new TextDecoder().decode(base64ToBytes(base64));
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decode a Base64 string (optionally a `data:` URI) into bytes plus a MIME type.
 * When there's no data-URI prefix, the type is sniffed from the leading bytes.
 * Returns null if the input is empty or not valid Base64.
 */
function parseBase64Input(input: string): { bytes: Uint8Array<ArrayBuffer>; mime: string } | null {
  const raw = input.trim();
  if (raw === '') {
    return null;
  }
  let data = raw;
  let mime = '';
  const dataUriMatch = raw.match(/^data:(.*?);base64,(.*)$/s);
  if (dataUriMatch) {
    mime = dataUriMatch[1] || '';
    data = dataUriMatch[2];
  }
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64ToBytes(data);
  } catch {
    return null;
  }
  return { bytes, mime: mime || sniffMime(bytes) };
}

/** Guess a MIME type from a file's magic bytes. Falls back to a generic binary type. */
function sniffMime(bytes: Uint8Array): string {
  const b = bytes;
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    return 'application/pdf'; // %PDF
  }
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return 'image/png';
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return 'image/jpeg';
  }
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return 'image/gif'; // GIF8
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  ) {
    return 'image/webp';
  }
  return 'application/octet-stream';
}

function previewKind(mime: string): DecodePreview['kind'] {
  if (mime.startsWith('image/')) {
    return 'image';
  }
  if (mime === 'application/pdf') {
    return 'pdf';
  }
  return 'other';
}

function extForMime(mime: string): string {
  switch (mime) {
    case 'application/pdf':
      return 'pdf';
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'bin';
  }
}
