import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { buildClaims, extractToken, inspect, type Claim, type Finding } from './jwt-inspect';
import { VerifyResult, verifyJwt } from './jwt-verify';
import { SendTo } from '../../shared/send-to/send-to';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { TryExample } from '../../shared/try-example/try-example';

/** Signature-check state shown in the UI: idle until a key is entered. */
export type VerifyState = { kind: 'idle' } | { kind: 'verifying' } | VerifyResult;

/**
 * "Try an example" token: genuinely signed with HS256 and {@link SAMPLE_SECRET},
 * expiring in 2030 — so loading it demonstrates the whole tool at once,
 * including the green "signature verified" state, not just the decode step.
 */
const SAMPLE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiIxMTM4IiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsInJvbGUiOiJhZG1pbiIsImlzcyI6Imh0dHBzOi8veXlkZXZ0b29scy5jb20iLCJpYXQiOjE3MzU2ODk2MDAsImV4cCI6MTg5MzQ1NjAwMH0.' +
  '3GAzGougqSnFY_77p3O213GUikZLq9UxKnM_V3q64fc';

const SAMPLE_SECRET = 'yydevtools-demo-secret';

/** One part of the compact token, for the colour-coded preview. */
export interface Segment {
  text: string;
  kind: 'header' | 'payload' | 'signature' | 'cipher';
}

export type DecodeResult =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  /** Five parts: encrypted, so only the header can be read. */
  | { kind: 'jwe'; header: string; alg: string; enc: string }
  | {
      kind: 'ok';
      header: string;
      payload: string;
      signature: string;
      /** The parsed objects, for the claim table and the checks. */
      headerData: Record<string, unknown>;
      payloadData: Record<string, unknown>;
      expired: boolean;
      /** The `alg` from the header, used to drive signature verification. */
      alg: string;
      /** The `kid`, which is what picks a key out of a pasted JWKS. */
      kid: string;
    };

@Component({
  selector: 'app-jwt-decoder',
  imports: [ToolPage, ToolContent, TryExample, ShareLink, SendTo, MatButtonModule, NgIcon],
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
  /** Whether the dates are shown in UTC rather than this machine's zone. */
  protected readonly utc = signal(false);

  protected readonly levelIcons: Record<Finding['level'], string> = {
    danger: 'matGppBadOutline',
    warn: 'matWarningOutline',
    info: 'matInfoOutline',
  };

  /**
   * How each level is said in words.
   *
   * Not decoration: the level is otherwise carried by colour alone, which
   * anyone reading in greyscale or with a colour vision deficiency cannot see.
   */
  protected readonly levelWords: Record<Finding['level'], string> = {
    danger: 'Risk',
    warn: 'Check',
    info: 'Note',
  };

  /**
   * The token travels in a link — it is what people paste into chat to ask
   * "what is in this?" anyway, and a link is only made when the button is
   * pressed. The verification key never does; it survives a reload of this tab
   * and nothing more.
   */
  protected readonly shared = syncToolState({
    key: 'jwt-decoder',
    snapshot: () => ({ token: this.token(), key: this.key() }),
    omitFromLink: ['key'],
    restore: (state) => {
      if (typeof state.token === 'string') {
        this.token.set(state.token);
      }
      if (typeof state.key === 'string') {
        this.key.set(state.key);
      }
    },
  });

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
      void verifyJwt(this.cleaned(), decoded.alg, key).then((result) => {
        if (id === this.verifyId) {
          this.verifyState.set(result);
        }
      });
    });
  }

  /**
   * The token itself, dug out of whatever was pasted around it.
   *
   * Everything downstream works from this rather than the raw text, so a
   * `Bearer` header or a line-wrapped copy decodes like a bare token. The box
   * keeps what was typed — rewriting it under the cursor would be worse than
   * the problem.
   */
  protected readonly cleaned = computed(() => extractToken(this.token()));

  /** True when the token had to be found inside something else. */
  protected readonly foundInside = computed(() => {
    const cleaned = this.cleaned();
    return cleaned !== '' && cleaned !== this.token().trim();
  });

  /** The parts of the token, for the colour-coded preview. */
  protected readonly segments = computed<Segment[]>(() => {
    const raw = this.cleaned();
    if (raw === '') return [];
    const parts = raw.split('.');
    const three = parts.length === 3;
    return parts.map((text, at) => ({
      text,
      kind: at === 0 ? 'header' : three ? (at === 1 ? 'payload' : 'signature') : 'cipher',
    }));
  });

  protected readonly result = computed<DecodeResult>(() => this.decode(this.cleaned()));

  /** Every claim in the payload, re-dated whenever the UTC switch moves. */
  protected readonly claims = computed<Claim[]>(() => {
    const decoded = this.result();
    if (decoded.kind !== 'ok') return [];
    return buildClaims(decoded.payloadData, Math.floor(Date.now() / 1000), this.utc());
  });

  /**
   * What is worth knowing about the token before trusting it.
   *
   * Separate from `result` so that typing in the key box re-runs the checks —
   * one of them is about the key — without re-decoding the token on every
   * keystroke.
   */
  protected readonly findings = computed<Finding[]>(() => {
    const decoded = this.result();
    if (decoded.kind !== 'ok') return [];
    return inspect({
      header: decoded.headerData,
      payload: decoded.payloadData,
      token: this.cleaned(),
      key: this.key(),
      nowSeconds: Math.floor(Date.now() / 1000),
    });
  });

  protected onInput(event: Event): void {
    this.token.set((event.target as HTMLTextAreaElement).value);
  }

  protected onKeyInput(event: Event): void {
    this.key.set((event.target as HTMLTextAreaElement).value);
  }

  protected toggleUtc(): void {
    this.utc.update((on) => !on);
  }

  /** Fill in the signed sample token and its secret, so verification succeeds too. */
  protected loadExample(): void {
    this.token.set(SAMPLE_TOKEN);
    this.key.set(SAMPLE_SECRET);
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

    // Five parts is a JWE: header, encrypted key, IV, ciphertext, tag. The
    // header is still plain, and saying so beats "this one has 5 parts".
    if (parts.length === 5) {
      const header = readJson(parts[0]);
      if (!header) {
        return { kind: 'error', message: 'The header is not valid base64url-encoded JSON.' };
      }
      return {
        kind: 'jwe',
        header: JSON.stringify(header, null, 2),
        alg: typeof header['alg'] === 'string' ? header['alg'] : '',
        enc: typeof header['enc'] === 'string' ? header['enc'] : '',
      };
    }

    if (parts.length !== 3) {
      return {
        kind: 'error',
        message: `A JWT has three dot-separated parts; this one has ${parts.length}.`,
      };
    }
    const [headerPart, payloadPart, signaturePart] = parts;

    const header = readJson(headerPart);
    if (!header) {
      return { kind: 'error', message: 'The header is not a base64url-encoded JSON object.' };
    }
    const payload = readJson(payloadPart);
    if (!payload) {
      return { kind: 'error', message: 'The payload is not a base64url-encoded JSON object.' };
    }

    const exp = payload['exp'];
    const algValue = header['alg'];
    const kidValue = header['kid'];

    return {
      kind: 'ok',
      header: JSON.stringify(header, null, 2),
      payload: JSON.stringify(payload, null, 2),
      signature: signaturePart,
      headerData: header,
      payloadData: payload,
      expired: typeof exp === 'number' && exp < Math.floor(Date.now() / 1000),
      alg: typeof algValue === 'string' ? algValue : '',
      kid: typeof kidValue === 'string' ? kidValue : '',
    };
  }
}

/**
 * A base64url segment as a JSON object, or null if it is not one.
 *
 * Both halves of a JWT are defined as JSON objects, so anything else — a bare
 * number, a string, malformed base64 — is a broken token rather than something
 * to display claims from.
 */
function readJson(segment: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(segment));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

/** Decode a base64url segment to a UTF-8 string. Throws on malformed input. */
function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
