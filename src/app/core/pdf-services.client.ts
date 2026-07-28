import { Injectable } from '@angular/core';

/**
 * Talks to the Worker's `/api/*` routes, which proxy to self-hosted Fly
 * services (Ghostscript, ocrmypdf, LibreOffice).
 *
 * Only operations that genuinely cannot run in the browser go through here.
 * Merge, split, viewing and image compression all stay local — they are free,
 * unlimited and work offline.
 */

/** Export targets supported by the LibreOffice converter. */
export type ExportFormat = 'docx' | 'rtf';

/**
 * `unavailable` means the hosted service could not serve this request through
 * no fault of the user's — not configured, upstream down, timed out. Callers
 * should fall back to a local path if they have one.
 *
 * `rejected` means the request itself was bad (wrong file, too large). Retrying
 * elsewhere will not help, so the message is shown as-is.
 */
export type PdfServiceFailure =
  | { kind: 'unavailable'; code: string; message: string }
  | { kind: 'rejected'; code: string; message: string };

export type PdfServiceResult =
  { ok: true; bytes: Uint8Array } | { ok: false; failure: PdfServiceFailure };

/** Server codes that mean "try something else", not "your input was wrong". */
const FALLBACK_CODES = new Set([
  'NOT_CONFIGURED',
  'UPSTREAM_UNAVAILABLE',
  'UPSTREAM_REJECTED',
  'TIMEOUT',
]);

@Injectable({ providedIn: 'root' })
export class PdfServicesClient {
  exportPdf(bytes: Uint8Array, format: ExportFormat): Promise<PdfServiceResult> {
    return this.run(`/api/pdf/export?format=${format}`, bytes, 'application/pdf');
  }

  ocr(bytes: Uint8Array, language = 'en-US'): Promise<PdfServiceResult> {
    return this.run(`/api/pdf/ocr?lang=${encodeURIComponent(language)}`, bytes, 'application/pdf');
  }

  compress(
    bytes: Uint8Array,
    level: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM',
  ): Promise<PdfServiceResult> {
    return this.run(`/api/pdf/compress?level=${level}`, bytes, 'application/pdf');
  }

  private async run(
    url: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<PdfServiceResult> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        // Copy so the Blob owns a plain ArrayBuffer, not a possibly-shared view.
        body: new Blob([bytes.slice()], { type: contentType }),
      });
    } catch {
      return {
        ok: false,
        failure: {
          kind: 'unavailable',
          code: 'NETWORK',
          message: 'The hosted service could not be reached.',
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
            message: 'The hosted service is not running in this environment.',
          },
        };
      }
      const buffer = await response.arrayBuffer();
      return { ok: true, bytes: new Uint8Array(buffer) };
    }

    return { ok: false, failure: await this.readFailure(response) };
  }

  private async readFailure(response: Response): Promise<PdfServiceFailure> {
    let code = `HTTP_${response.status}`;
    let message = 'The hosted service could not process this file.';

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
