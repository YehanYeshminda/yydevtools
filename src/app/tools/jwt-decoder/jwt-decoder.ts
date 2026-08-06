import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';

import { ClipboardService } from '../../core/clipboard.service';
import { VerifyResult, verifyJwt } from './jwt-verify';
import { ToolContent } from '../../shared/tool-content/tool-content';

/** Signature-check state shown in the UI: idle until a key is entered. */
export type VerifyState = { kind: 'idle' } | { kind: 'verifying' } | VerifyResult;

const SAMPLE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJpc3MiOiJ5eWRldnRvb2xzIiwic3ViIjoiMTIzNDU2Nzg5MCIsIm5hbWUiOiJBZGEgTG92ZWxhY2UiLCJpYXQiOjE3MDAwMDAwMDAsIm5iZiI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAzNjAwfQ.' +
  'c2lnbmF0dXJlLXBsYWNlaG9sZGVyLW5vdC12ZXJpZmllZA';

/** Registered time claims, in display order, with a human label. */
const TIME_CLAIMS: { key: string; label: string }[] = [
  { key: 'iat', label: 'Issued at' },
  { key: 'nbf', label: 'Not valid before' },
  { key: 'exp', label: 'Expires at' },
];

/** Registered non-time claims worth surfacing in the summary. */
const TEXT_CLAIMS: { key: string; label: string }[] = [
  { key: 'iss', label: 'Issuer' },
  { key: 'sub', label: 'Subject' },
  { key: 'aud', label: 'Audience' },
  { key: 'jti', label: 'JWT ID' },
];

export interface Claim {
  key: string;
  label: string;
  value: string;
  /** Present for time claims: the formatted date and whether it makes the token invalid now. */
  detail?: string;
  state?: 'ok' | 'warn';
}

export type DecodeResult =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ok';
      header: string;
      payload: string;
      signature: string;
      claims: Claim[];
      expired: boolean;
      /** The `alg` from the header, used to drive signature verification. */
      alg: string;
    };

@Component({
  selector: 'app-jwt-decoder',
  imports: [ToolContent, RouterLink, MatButtonModule, NgIcon],
  templateUrl: './jwt-decoder.html',
  styleUrl: './jwt-decoder.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JwtDecoderTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly token = signal('');
  /** Shared secret (HS) or PEM public key (RS, PS, ES) for verification. */
  protected readonly key = signal('');
  protected readonly verifyState = signal<VerifyState>({ kind: 'idle' });

  /** Guards against a slow verify resolving after a newer one. */
  private verifyId = 0;

  constructor() {
    // Re-verify whenever the token, the key, or the decoded algorithm changes.
    effect(() => {
      const decoded = this.result();
      const key = this.key().trim();
      const id = ++this.verifyId;

      if (decoded.kind !== 'ok' || key === '') {
        this.verifyState.set({ kind: 'idle' });
        return;
      }
      this.verifyState.set({ kind: 'verifying' });
      void verifyJwt(this.token().trim(), decoded.alg, key).then((result) => {
        if (id === this.verifyId) {
          this.verifyState.set(result);
        }
      });
    });
  }

  /** The three raw segments, for the colour-coded token preview. */
  protected readonly segments = computed(() => {
    const raw = this.token().trim();
    if (raw === '') {
      return null;
    }
    const parts = raw.split('.');
    return {
      header: parts[0] ?? '',
      payload: parts[1] ?? '',
      signature: parts[2] ?? '',
    };
  });

  protected readonly result = computed<DecodeResult>(() => this.decode(this.token().trim()));

  protected onInput(event: Event): void {
    this.token.set((event.target as HTMLTextAreaElement).value);
  }

  protected onKeyInput(event: Event): void {
    this.key.set((event.target as HTMLTextAreaElement).value);
  }

  protected loadSample(): void {
    this.token.set(SAMPLE_TOKEN);
  }

  protected clear(): void {
    this.token.set('');
    this.key.set('');
  }

  protected copy(text: string, label: string): void {
    void this.clipboard.copy(text, { label });
  }

  private decode(raw: string): DecodeResult {
    if (raw === '') {
      return { kind: 'empty' };
    }
    const parts = raw.split('.');
    if (parts.length !== 3) {
      return {
        kind: 'error',
        message: `A JWT has three dot-separated parts; this one has ${parts.length}.`,
      };
    }
    const [headerPart, payloadPart, signaturePart] = parts;

    let header: unknown;
    let payload: Record<string, unknown>;
    try {
      header = JSON.parse(base64UrlDecode(headerPart));
    } catch {
      return { kind: 'error', message: 'The header is not valid base64url-encoded JSON.' };
    }
    try {
      payload = JSON.parse(base64UrlDecode(payloadPart)) as Record<string, unknown>;
    } catch {
      return { kind: 'error', message: 'The payload is not valid base64url-encoded JSON.' };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const claims = buildClaims(payload, nowSeconds);
    const exp = payload['exp'];
    const expired = typeof exp === 'number' && exp < nowSeconds;
    const algValue = (header as Record<string, unknown> | null)?.['alg'];
    const alg = typeof algValue === 'string' ? algValue : '';

    return {
      kind: 'ok',
      header: JSON.stringify(header, null, 2),
      payload: JSON.stringify(payload, null, 2),
      signature: signaturePart,
      claims,
      expired,
      alg,
    };
  }
}

/** Decode a base64url segment to a UTF-8 string. Throws on malformed input. */
function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Build the human-readable claim summary from a decoded payload. */
function buildClaims(payload: Record<string, unknown>, nowSeconds: number): Claim[] {
  const claims: Claim[] = [];

  for (const { key, label } of TIME_CLAIMS) {
    const value = payload[key];
    if (typeof value !== 'number') {
      continue;
    }
    const detail = new Date(value * 1000).toLocaleString();
    let state: 'ok' | 'warn' = 'ok';
    if (key === 'exp' && value < nowSeconds) {
      state = 'warn';
    } else if (key === 'nbf' && value > nowSeconds) {
      state = 'warn';
    }
    claims.push({ key, label, value: String(value), detail, state });
  }

  for (const { key, label } of TEXT_CLAIMS) {
    const value = payload[key];
    if (value === undefined) {
      continue;
    }
    claims.push({ key, label, value: Array.isArray(value) ? value.join(', ') : String(value) });
  }

  return claims;
}
