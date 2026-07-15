import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';

import { CLIENT_ENCODE_MAX_BYTES, SERVER_ENCODE_MAX_BYTES } from '../../core/api-config';
import { Base64Api } from './base64-api';
import { EncodeChoice, EncodeChoiceDialog } from './encode-choice-dialog';

type TextMode = 'encode' | 'decode';

interface TextResult {
  value: string;
  error: string;
}

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
    MatProgressSpinnerModule,
    MatTabsModule,
  ],
  templateUrl: './base64.html',
  styleUrl: './base64.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Base64Tool {
  private readonly snackBar = inject(MatSnackBar);
  private readonly base64Api = inject(Base64Api);
  private readonly dialog = inject(MatDialog);

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
  protected readonly fileLoading = signal(false);
  protected readonly encodedOnServer = signal(false);

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
    if (file.size > SERVER_ENCODE_MAX_BYTES) {
      this.showError(`That file is too large. The maximum size is ${formatBytes(SERVER_ENCODE_MAX_BYTES)}.`);
      return;
    }

    // Small files stay in the browser. Larger ones let the user choose: server
    // processing (faster, off-device) or keep it in the browser.
    if (file.size <= CLIENT_ENCODE_MAX_BYTES) {
      this.startEncode(file, 'browser');
      return;
    }

    this.dialog
      .open(EncodeChoiceDialog, {
        width: '28rem',
        data: {
          fileName: file.name,
          sizeLabel: formatBytes(file.size),
          thresholdLabel: formatBytes(CLIENT_ENCODE_MAX_BYTES),
        },
      })
      .afterClosed()
      .subscribe((choice: EncodeChoice | undefined) => {
        if (choice) {
          this.startEncode(file, choice);
        }
      });
  }

  private startEncode(file: File, where: EncodeChoice): void {
    this.fileName.set(file.name);
    this.fileMime.set(file.type);
    this.fileBase64.set('');
    if (where === 'server') {
      this.encodeOnServer(file);
    } else {
      this.encodeInBrowser(file);
    }
  }

  private encodeInBrowser(file: File): void {
    this.encodedOnServer.set(false);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      // strip the "data:<mime>;base64," prefix to keep just the payload.
      this.fileBase64.set(dataUri.slice(dataUri.indexOf(',') + 1));
    };
    reader.onerror = () => this.showError('Could not read that file.');
    reader.readAsDataURL(file);
  }

  private encodeOnServer(file: File): void {
    // Large files are offloaded to the shared backend instead of being held in the browser.
    this.encodedOnServer.set(true);
    this.fileLoading.set(true);
    this.base64Api.encodeFile(file).subscribe({
      next: (result) => {
        this.fileBase64.set(result.base64);
        if (result.mime) {
          this.fileMime.set(result.mime);
        }
        this.fileLoading.set(false);
      },
      error: () => {
        this.showError('Could not reach the server to process this file. Make sure the API is running.');
        this.fileLoading.set(false);
      },
    });
  }

  protected toggleDataUri(checked: boolean): void {
    this.withDataUri.set(checked);
  }

  // --- File tab: decode -------------------------------------------------
  protected readonly decodeInput = signal('');
  protected readonly decodeFileName = signal('decoded.bin');

  protected onDecodeInput(event: Event): void {
    this.decodeInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onDecodeFileName(event: Event): void {
    this.decodeFileName.set((event.target as HTMLInputElement).value);
  }

  protected downloadDecoded(): void {
    let raw = this.decodeInput().trim();
    if (raw === '') {
      return;
    }
    let mime = 'application/octet-stream';
    const dataUriMatch = raw.match(/^data:(.*?);base64,(.*)$/s);
    if (dataUriMatch) {
      mime = dataUriMatch[1] || mime;
      raw = dataUriMatch[2];
    }
    try {
      const bytes = base64ToBytes(raw);
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = this.decodeFileName().trim() || 'decoded.bin';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      this.showError('That input is not valid Base64.');
    }
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
