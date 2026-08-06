import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';

import { ClipboardService } from '../../core/clipboard.service';
import { SignResult, signJwt } from './jwt-sign';
import { ToolContent } from '../../shared/tool-content/tool-content';

/** Signing state shown in the UI: idle until a key is entered. */
export type SignState = { kind: 'idle' } | { kind: 'signing' } | SignResult;

const SAMPLE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJpc3MiOiJ5eWRldnRvb2xzIiwic3ViIjoiMTIzNDU2Nzg5MCIsIm5hbWUiOiJBZGEgTG92ZWxhY2UiLCJyb2xlIjoidXNlciIsImlhdCI6MTcwMDAwMDAwMH0.' +
  'c2lnbmF0dXJlLXBsYWNlaG9sZGVyLW5vdC12ZXJpZmllZA';

const SAMPLE_SECRET = 'a-shared-secret';

/** Which kind of key an algorithm needs, for the hint next to the key field. */
function keyKindFor(alg: string | null): 'hmac' | 'pem' | 'none' | null {
  if (!alg) return null;
  if (alg.toLowerCase() === 'none') return 'none';
  const family = alg.slice(0, 2);
  if (family === 'HS') return 'hmac';
  if (family === 'RS' || family === 'PS' || family === 'ES') return 'pem';
  return null;
}

@Component({
  selector: 'app-jwt-editor',
  imports: [ToolContent, RouterLink, MatButtonModule, NgIcon],
  templateUrl: './jwt-editor.html',
  styleUrl: './jwt-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JwtEditorTool {
  private readonly clipboard = inject(ClipboardService);

  /** The token pasted in to load into the editor. */
  protected readonly token = signal('');
  /** Editable header and payload JSON — the working state the output is signed from. */
  protected readonly header = signal('');
  protected readonly payload = signal('');
  /** Shared secret (HS) or PKCS#8 private key PEM (RS/PS/ES) for signing. */
  protected readonly key = signal('');
  /** Error from the decode/import step, shown next to the token field. */
  protected readonly decodeError = signal<string | null>(null);

  protected readonly signState = signal<SignState>({ kind: 'idle' });

  /** Guards against a slow sign resolving after a newer one. */
  private signId = 0;

  constructor() {
    // Re-sign whenever the header, the payload, or the key changes. The `none`
    // algorithm needs no key, so it is not gated on one.
    effect(() => {
      const header = this.header();
      const payload = this.payload();
      const key = this.key();
      const isNone = this.keyKind() === 'none';
      const id = ++this.signId;

      const hasInput = header.trim() !== '' || payload.trim() !== '';
      if (!hasInput || (!isNone && key.trim() === '')) {
        this.signState.set({ kind: 'idle' });
        return;
      }
      this.signState.set({ kind: 'signing' });
      void signJwt(header, payload, key).then((result) => {
        if (id === this.signId) {
          this.signState.set(result);
        }
      });
    });
  }

  /** The `alg` from the edited header, for display and the key hint. */
  protected readonly alg = computed(() => {
    try {
      const header = JSON.parse(this.header()) as Record<string, unknown>;
      const alg = header?.['alg'];
      return typeof alg === 'string' ? alg : null;
    } catch {
      return null;
    }
  });

  protected readonly keyKind = computed(() => keyKindFor(this.alg()));

  /** The three colour-coded segments of the signed (or unsigned) output. */
  protected readonly outputSegments = computed(() => {
    const state = this.signState();
    if (state.kind !== 'ok' && state.kind !== 'unsigned') return null;
    const [header, payload, signature] = state.token.split('.');
    return { header, payload, signature };
  });

  protected onTokenInput(event: Event): void {
    this.token.set((event.target as HTMLTextAreaElement).value);
  }

  protected onHeaderInput(event: Event): void {
    this.header.set((event.target as HTMLTextAreaElement).value);
  }

  protected onPayloadInput(event: Event): void {
    this.payload.set((event.target as HTMLTextAreaElement).value);
  }

  protected onKeyInput(event: Event): void {
    this.key.set((event.target as HTMLTextAreaElement).value);
  }

  /** Split the pasted token and pretty-print its header and payload into the editor. */
  protected decode(): void {
    const raw = this.token().trim();
    if (raw === '') {
      this.decodeError.set('Paste a token to load it into the editor.');
      return;
    }
    const parts = raw.split('.');
    if (parts.length !== 3) {
      this.decodeError.set(
        `A JWT has three dot-separated parts; this one has ${parts.length}.`,
      );
      return;
    }
    let header: string;
    let payload: string;
    try {
      header = prettyJson(parts[0]);
    } catch {
      this.decodeError.set('The header is not valid base64url-encoded JSON.');
      return;
    }
    try {
      payload = prettyJson(parts[1]);
    } catch {
      this.decodeError.set('The payload is not valid base64url-encoded JSON.');
      return;
    }
    this.decodeError.set(null);
    this.header.set(header);
    this.payload.set(payload);
  }

  /** Rewrite the header's `alg` to `none`, keeping any other header fields. */
  protected makeUnsigned(): void {
    let header: Record<string, unknown> = { alg: 'none', typ: 'JWT' };
    try {
      const parsed = JSON.parse(this.header()) as unknown;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        header = { ...(parsed as Record<string, unknown>), alg: 'none' };
      }
    } catch {
      // Header wasn't valid JSON yet — fall back to a minimal none header.
    }
    this.header.set(JSON.stringify(header, null, 2));
  }

  protected loadSample(): void {
    this.token.set(SAMPLE_TOKEN);
    this.decode();
    this.key.set(SAMPLE_SECRET);
  }

  protected clear(): void {
    this.token.set('');
    this.header.set('');
    this.payload.set('');
    this.key.set('');
    this.decodeError.set(null);
  }

  protected copy(text: string, label: string): void {
    void this.clipboard.copy(text, { label });
  }
}

/** Base64url-decode a JWT segment and re-serialise it as pretty JSON. Throws on bad input. */
function prettyJson(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return JSON.stringify(JSON.parse(text), null, 2);
}
