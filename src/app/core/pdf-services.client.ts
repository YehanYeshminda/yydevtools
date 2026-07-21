import { Injectable } from '@angular/core';

/**
 * Talks to the Worker's `/api/pdf/*` routes.
 *
 * Only operations that genuinely cannot run in the browser go through here.
 * Merge, split and viewing stay local — they are free, unlimited and offline,
 * and spending a metered transaction on them would be strictly worse.
 */

/** Export targets supported by the hosted converter. */
export type ExportFormat = 'docx' | 'xlsx' | 'pptx' | 'rtf';

/**
 * `unavailable` means the hosted service could not serve this request through
 * no fault of the user's — out of quota, not configured, upstream down. Callers
 * should fall back to a local path if they have one.
 *
 * `rejected` means the request itself was bad (wrong file, too large). Retrying
 * elsewhere will not help, so the message is shown as-is.
 */
export type PdfServiceFailure =
  | { kind: 'unavailable'; code: string; message: string }
  | { kind: 'rejected'; code: string; message: string };

export type PdfServiceResult =
  | { ok: true; bytes: Uint8Array; remaining: number | null }
  | { ok: false; failure: PdfServiceFailure };

export interface QuotaSnapshot {
  used: number;
  limit: number;
  remaining: number;
  period: string;
  configured: boolean;
}

/** Server codes that mean "try something else", not "your input was wrong". */
const FALLBACK_CODES = new Set([
  'QUOTA_EXCEEDED',
  'NOT_CONFIGURED',
  'UPSTREAM_UNAVAILABLE',
  'UPSTREAM_REJECTED',
  'TIMEOUT',
]);

@Injectable({ providedIn: 'root' })
export class PdfServicesClient {
  /**
   * Current month's allowance, or null if the API is unreachable — which is the
   * normal case under `ng serve`, where no Worker is running.
   */
  async usage(): Promise<QuotaSnapshot | null> {
    try {
      const response = await fetch('/api/pdf/usage');
      if (!response.ok) {
        return null;
      }
      const body: unknown = await response.json();
      return isQuota(body) ? body : null;
    } catch {
      return null;
    }
  }

  exportPdf(bytes: Uint8Array, format: ExportFormat): Promise<PdfServiceResult> {
    return this.run(`/api/pdf/export?format=${format}`, bytes);
  }

  ocr(bytes: Uint8Array, language = 'en-US'): Promise<PdfServiceResult> {
    return this.run(`/api/pdf/ocr?lang=${encodeURIComponent(language)}`, bytes);
  }

  compress(bytes: Uint8Array, level: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM'): Promise<PdfServiceResult> {
    return this.run(`/api/pdf/compress?level=${level}`, bytes);
  }

  private async run(url: string, bytes: Uint8Array): Promise<PdfServiceResult> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        // Copy so the Blob owns a plain ArrayBuffer, not a possibly-shared view.
        body: new Blob([bytes.slice()], { type: 'application/pdf' }),
      });
    } catch {
      return {
        ok: false,
        failure: {
          kind: 'unavailable',
          code: 'NETWORK',
          message: 'The hosted converter could not be reached.',
        },
      };
    }

    if (response.ok) {
      const type = response.headers.get('Content-Type') ?? '';
      // Under `ng serve` there is no Worker, so the SPA fallback answers with
      // index.html and a 200. Treat that as the service being absent.
      if (type.includes('text/html')) {
        return {
          ok: false,
          failure: {
            kind: 'unavailable',
            code: 'NOT_DEPLOYED',
            message: 'The hosted converter is not running in this environment.',
          },
        };
      }
      const buffer = await response.arrayBuffer();
      const header = response.headers.get('X-Quota-Remaining');
      const remaining = header !== null && header !== '' ? Number(header) : null;
      return {
        ok: true,
        bytes: new Uint8Array(buffer),
        remaining: remaining !== null && Number.isFinite(remaining) ? remaining : null,
      };
    }

    return { ok: false, failure: await this.readFailure(response) };
  }

  private async readFailure(response: Response): Promise<PdfServiceFailure> {
    let code = `HTTP_${response.status}`;
    let message = 'The hosted converter could not process this file.';

    try {
      const body: unknown = await response.json();
      if (isErrorBody(body)) {
        code = body.error.code;
        message = body.error.message;
      }
    } catch {
      // A non-JSON error body means something other than our Worker replied.
    }

    // Anything the server did not explicitly blame on the input is worth
    // falling back on, including 5xx from an intermediary.
    const shouldFallback = FALLBACK_CODES.has(code) || response.status >= 500;
    return { kind: shouldFallback ? 'unavailable' : 'rejected', code, message };
  }
}

function isQuota(value: unknown): value is QuotaSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record['remaining'] === 'number' && typeof record['limit'] === 'number';
}

function isErrorBody(value: unknown): value is { error: { code: string; message: string } } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const error = (value as Record<string, unknown>)['error'];
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const record = error as Record<string, unknown>;
  return typeof record['code'] === 'string' && typeof record['message'] === 'string';
}
