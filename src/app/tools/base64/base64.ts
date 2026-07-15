import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';

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
    MatTabsModule,
  ],
  templateUrl: './base64.html',
  styleUrl: './base64.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Base64Tool {
  private readonly snackBar = inject(MatSnackBar);

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
    return this.withDataUri() ? `data:${this.fileMime() || 'application/octet-stream'};base64,${base64}` : base64;
  });

  protected onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    this.fileName.set(file.name);
    this.fileMime.set(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      // strip the "data:<mime>;base64," prefix to keep just the payload.
      this.fileBase64.set(dataUri.slice(dataUri.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  }

  protected toggleDataUri(checked: boolean): void {
    this.withDataUri.set(checked);
  }

  // --- File tab: decode -------------------------------------------------
  protected readonly decodeInput = signal('');
  protected readonly decodeFileName = signal('decoded.bin');
  protected readonly decodeError = signal('');

  protected onDecodeInput(event: Event): void {
    this.decodeInput.set((event.target as HTMLTextAreaElement).value);
    this.decodeError.set('');
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
      this.decodeError.set('That input is not valid Base64.');
    }
  }
}

// --- Pure helpers (UTF-8 safe) ------------------------------------------
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
