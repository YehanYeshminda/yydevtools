import { Injectable } from '@angular/core';

/**
 * Talks to the Worker's `/api/word/import` route, which proxies to the
 * word-convert Fly service — the one operation Word Viewer cannot do in the
 * browser. Turning an arbitrary .docx into SFDT is Syncfusion's own format
 * conversion, not something their client library can do unsupplied; see
 * services/word-convert/Program.cs for the full story of why this single
 * service is ASP.NET Core rather than Node like its three siblings.
 *
 * Same failure taxonomy as `PdfServicesClient`: `unavailable` means the
 * service could not serve the request through no fault of the file itself —
 * not configured, upstream down, timed out — and there is nothing local to
 * fall back to, since nothing else in this tool can parse a .docx.
 * `rejected` means the file itself was the problem (not a real .docx,
 * password-protected, too large).
 */
export type OfficeServiceFailure =
  | { kind: 'unavailable'; code: string; message: string }
  | { kind: 'rejected'; code: string; message: string };

export type OfficeServiceResult = { ok: true; sfdt: string } | { ok: false; failure: OfficeServiceFailure };

/** Server codes that mean "try again later", not "this file is the problem". */
const FALLBACK_CODES = new Set([
  'NOT_CONFIGURED',
  'UPSTREAM_UNAVAILABLE',
  'UPSTREAM_REJECTED',
  'TIMEOUT',
]);

@Injectable({ providedIn: 'root' })
export class OfficeServicesClient {
  /**
   * Wakes the word-convert machine while the user is still choosing a file.
   * Fire-and-forget, like the PDF tools' equivalent — see
   * `PdfServicesClient.warm` for the full reasoning.
   */
  warm(): void {
    void fetch('/api/warm?service=office').catch(() => undefined);
  }

  async importDocx(bytes: Uint8Array): Promise<OfficeServiceResult> {
    let response: Response;
    try {
      response = await fetch('/api/word/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        // Copy so the Blob owns a plain ArrayBuffer, not a possibly-shared view.
        body: new Blob([bytes.slice()], { type: 'application/octet-stream' }),
      });
    } catch {
      return {
        ok: false,
        failure: {
          kind: 'unavailable',
          code: 'NETWORK',
          message: 'The document conversion service could not be reached.',
        },
      };
    }

    if (response.ok) {
      const type = response.headers.get('Content-Type') ?? '';
      // Under `ng serve` there is no Worker, so the SPA fallback answers with
      // index.html and a 200. Treat that as the service being absent.
      if (!type.includes('application/json')) {
        return {
          ok: false,
          failure: {
            kind: 'unavailable',
            code: 'NOT_DEPLOYED',
            message: 'The document conversion service is not running in this environment.',
          },
        };
      }
      return { ok: true, sfdt: await response.text() };
    }

    return { ok: false, failure: await this.readFailure(response) };
  }

  private async readFailure(response: Response): Promise<OfficeServiceFailure> {
    let code = `HTTP_${response.status}`;
    let message = 'The document could not be converted.';

    try {
      const body: unknown = await response.json();
      if (isErrorBody(body)) {
        code = body.error.code;
        message = body.error.message;
      }
    } catch {
      // A non-JSON error body means something other than our Worker replied.
    }

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
