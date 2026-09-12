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

export type OfficeServiceResult =
  { ok: true; sfdt: string } | { ok: false; failure: OfficeServiceFailure };

/** The Spreadsheet's own workbook shape, opaque to us — we only pass it on. */
export type WorkbookJson = Record<string, unknown>;

export type WorkbookResult =
  { ok: true; workbook: WorkbookJson } | { ok: false; failure: OfficeServiceFailure };

export type OfficeType = 'docx' | 'xlsx' | 'pptx';

export type PdfResult =
  { ok: true; bytes: Uint8Array } | { ok: false; failure: OfficeServiceFailure };

/** One decoded X.509 certificate, as the service describes it. */
export interface CertificateInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  version: number;
  notBefore: string;
  notAfter: string;
  signatureAlgorithm: string;
  publicKey: { algorithm: string; bits: number | null; curve: string | null };
  fingerprints: { sha1: string; sha256: string };
  selfSigned: boolean;
  subjectAlternativeNames: string[];
  keyUsage: string[];
  extendedKeyUsage: string[];
  basicConstraints: { isCertificateAuthority: boolean; pathLength: number | null } | null;
  subjectKeyIdentifier: string | null;
  authorityKeyIdentifier: string | null;
  extensions: { oid: string | null; name: string | null; critical: boolean; value: string }[];
}

export interface CertificateReport {
  certificates: CertificateInfo[];
  /** Present for a bundle: how the certificates link up, and what is wrong if they do not. */
  chain: { built: boolean; order: string[]; status: string[] } | null;
  /** True when a private key was pasted alongside — it was skipped, not read. */
  privateKeyIgnored: boolean;
}

export type CertificateResult =
  { ok: true; report: CertificateReport } | { ok: false; failure: OfficeServiceFailure };

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

  /**
   * Converts a .xlsx into the Spreadsheet's workbook JSON.
   *
   * The Spreadsheet component can do this upload itself — you give it an
   * `openUrl` and it posts the file — and that is how this tool started. It
   * was replaced because that path silently drops the request when the
   * component is asked before it is ready: `open()` reports the call accepted,
   * no upload is ever sent, and neither completion event fires, so the tool
   * waits on a spinner that never ends. Owning the fetch means the conversion
   * either succeeds or produces a message, and that handing the result to the
   * grid can be retried without re-uploading a file that already converted.
   *
   * Multipart rather than raw bytes, because that is the shape the service's
   * /excel/import already speaks — it was written for the component's own
   * uploader, and there was no reason to change the wire format too.
   */
  async importXlsx(file: File): Promise<WorkbookResult> {
    const body = new FormData();
    body.append('file', file, file.name);

    let response: Response;
    try {
      // No Content-Type header: the browser must set it, so that the multipart
      // boundary it generates is the one the service is told to look for.
      response = await fetch('/api/excel/import', { method: 'POST', body });
    } catch {
      return {
        ok: false,
        failure: {
          kind: 'unavailable',
          code: 'NETWORK',
          message: 'The workbook conversion service could not be reached.',
        },
      };
    }

    if (!response.ok) {
      return { ok: false, failure: await this.readFailure(response) };
    }

    const type = response.headers.get('Content-Type') ?? '';
    if (!type.includes('application/json')) {
      // Same SPA-fallback guard as importDocx: under `ng serve` there is no
      // Worker, so index.html comes back with a 200.
      return {
        ok: false,
        failure: {
          kind: 'unavailable',
          code: 'NOT_DEPLOYED',
          message: 'The workbook conversion service is not running in this environment.',
        },
      };
    }

    try {
      return { ok: true, workbook: (await response.json()) as WorkbookJson };
    } catch {
      return {
        ok: false,
        failure: {
          kind: 'unavailable',
          code: 'BAD_RESPONSE',
          message: 'The workbook conversion service returned something unreadable.',
        },
      };
    }
  }

  /**
   * Renders a Word, Excel or PowerPoint file to PDF. Same wire shape as
   * importDocx — raw bytes in, one document out — with the type carried in the
   * query because all three inputs are ZIPs and the service does not sniff.
   */
  toPdf(bytes: Uint8Array, type: OfficeType): Promise<PdfResult> {
    return this.fetchPdf(`/api/office/to-pdf?type=${type}`, {
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Blob([bytes.slice()], { type: 'application/octet-stream' }),
    });
  }

  /** Encrypts a PDF (AES-256) with an open password and, optionally, a separate owner password. */
  protectPdf(bytes: Uint8Array, password: string, owner: string): Promise<PdfResult> {
    const form = pdfForm(bytes, password);
    if (owner) {
      form.append('owner', owner);
    }
    return this.fetchPdf('/api/pdf/protect', { body: form });
  }

  /** Removes the passwords and restrictions from a PDF, given its password. */
  unlockPdf(bytes: Uint8Array, password: string): Promise<PdfResult> {
    return this.fetchPdf('/api/pdf/unlock', { body: pdfForm(bytes, password) });
  }

  /** Decodes one PEM/DER certificate or a PEM bundle into a structured report. */
  async decodeCertificate(text: string): Promise<CertificateResult> {
    let response: Response;
    try {
      response = await fetch('/api/x509/decode', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      });
    } catch {
      return {
        ok: false,
        failure: {
          kind: 'unavailable',
          code: 'NETWORK',
          message: 'The decoding service could not be reached.',
        },
      };
    }
    if (!response.ok) {
      return { ok: false, failure: await this.readFailure(response) };
    }
    if (!(response.headers.get('Content-Type') ?? '').includes('application/json')) {
      return {
        ok: false,
        failure: {
          kind: 'unavailable',
          code: 'NOT_DEPLOYED',
          message: 'The certificate decoding service is not running in this environment.',
        },
      };
    }
    return { ok: true, report: (await response.json()) as CertificateReport };
  }

  /**
   * POSTs to a route that answers with a PDF. A FormData body must go without
   * a Content-Type header so the browser sets the multipart boundary itself.
   */
  private async fetchPdf(url: string, init: RequestInit): Promise<PdfResult> {
    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', ...init });
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

    if (!response.ok) {
      return { ok: false, failure: await this.readFailure(response) };
    }

    const contentType = response.headers.get('Content-Type') ?? '';
    if (!contentType.includes('application/pdf')) {
      // Same SPA-fallback guard as the imports above.
      return {
        ok: false,
        failure: {
          kind: 'unavailable',
          code: 'NOT_DEPLOYED',
          message: 'The document conversion service is not running in this environment.',
        },
      };
    }
    return { ok: true, bytes: new Uint8Array(await response.arrayBuffer()) };
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

/** The multipart body /pdf/protect and /pdf/unlock share: the file, then the password. */
function pdfForm(bytes: Uint8Array, password: string): FormData {
  const form = new FormData();
  form.append('file', new Blob([bytes.slice()], { type: 'application/pdf' }), 'document.pdf');
  form.append('password', password);
  return form;
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
