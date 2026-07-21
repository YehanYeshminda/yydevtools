/**
 * yydevtools Worker.
 *
 * Serves the built Angular SPA from static assets and exposes a small
 * `/api/pdf/*` surface for the operations that cannot run in the browser
 * (conversion, OCR, real compression). Everything else — merge, split,
 * viewing — stays client-side and never touches this Worker.
 */

import { AdobeError, runOperation, type AdobeCredentials } from './adobe';
import { readQuota, recordUsage } from './quota';

export interface Env {
  ASSETS: Fetcher;
  PDF_QUOTA: KVNamespace;
  /** Public client ID (a plain var). */
  ADOBE_PDF_CLIENT_ID?: string;
  /** Set with `wrangler secret put ADOBE_PDF_CLIENT_SECRET` — never a var. */
  ADOBE_PDF_CLIENT_SECRET?: string;
  /** Overrides the default monthly transaction budget. */
  ADOBE_MONTHLY_LIMIT?: string;
}

/**
 * Deliberately below Adobe's 500/month free tier. The margin absorbs both the
 * KV increment race and any job Adobe bills that we fail to record.
 */
const DEFAULT_MONTHLY_LIMIT = 460;

/** Adobe's own limits are higher, but Workers should not stream huge bodies. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

type ErrorCode =
  | 'QUOTA_EXCEEDED'
  | 'NOT_CONFIGURED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_REJECTED'
  | 'TIMEOUT'
  | 'TOO_LARGE'
  | 'INVALID_INPUT'
  | 'NOT_FOUND';

const STATUS: Record<ErrorCode, number> = {
  QUOTA_EXCEEDED: 429,
  NOT_CONFIGURED: 503,
  UPSTREAM_UNAVAILABLE: 502,
  UPSTREAM_REJECTED: 502,
  TIMEOUT: 504,
  TOO_LARGE: 413,
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
};

function fail(code: ErrorCode, message: string): Response {
  return Response.json({ error: { code, message } }, { status: STATUS[code] });
}

/** Export targets we accept, mapped to the MIME type of the result. */
const EXPORT_FORMATS: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  rtf: 'application/rtf',
};

const COMPRESSION_LEVELS = new Set(['LOW', 'MEDIUM', 'HIGH']);

/**
 * The API only exists to serve our own pages, and it spends a metered budget,
 * so reject cross-origin callers rather than letting anyone drain the quota.
 */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) {
    // Non-browser callers (curl, health checks) have no Origin to check.
    return true;
  }
  try {
    const from = new URL(origin);
    if (from.hostname === 'localhost' || from.hostname === '127.0.0.1') {
      return true;
    }
    return from.host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function credentials(env: Env): AdobeCredentials | null {
  const clientId = env.ADOBE_PDF_CLIENT_ID ?? '';
  const clientSecret = env.ADOBE_PDF_CLIENT_SECRET ?? '';
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function monthlyLimit(env: Env): number {
  const parsed = Number(env.ADOBE_MONTHLY_LIMIT);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MONTHLY_LIMIT;
}

async function readBody(request: Request): Promise<ArrayBuffer | Response> {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
    return fail('TOO_LARGE', `That file is larger than the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit for this tool.`);
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) {
    return fail('INVALID_INPUT', 'No document was sent.');
  }
  // Content-Length can be absent or wrong; the real size is authoritative.
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return fail('TOO_LARGE', `That file is larger than the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit for this tool.`);
  }
  return bytes;
}

/** Runs an operation with the quota guard and error translation around it. */
async function metered(
  env: Env,
  request: Request,
  operation: string,
  params: Record<string, unknown>,
  resultType: string,
): Promise<Response> {
  const creds = credentials(env);
  if (!creds) {
    return fail('NOT_CONFIGURED', 'This tool is not configured on the server right now.');
  }

  const now = Date.now();
  const quota = await readQuota(env.PDF_QUOTA, monthlyLimit(env), now);
  if (quota.remaining <= 0) {
    return fail(
      'QUOTA_EXCEEDED',
      'This month’s allowance for the hosted converter is used up. It resets at the start of next month.',
    );
  }

  const body = await readBody(request);
  if (body instanceof Response) {
    return body;
  }

  try {
    const result = await runOperation(creds, {
      operation,
      params,
      input: body,
      inputMediaType: 'application/pdf',
    });

    // Only bill the user's budget once Adobe has actually delivered something.
    await recordUsage(env.PDF_QUOTA, now);

    return new Response(result, {
      headers: {
        'Content-Type': resultType,
        'X-Quota-Remaining': String(Math.max(0, quota.remaining - 1)),
      },
    });
  } catch (error) {
    if (error instanceof AdobeError) {
      return fail(error.code, error.message);
    }
    return fail('UPSTREAM_UNAVAILABLE', 'The conversion service could not be reached.');
  }
}

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  if (!sameOrigin(request)) {
    return fail('INVALID_INPUT', 'Cross-origin requests are not accepted.');
  }

  if (path === '/api/pdf/usage' && request.method === 'GET') {
    const quota = await readQuota(env.PDF_QUOTA, monthlyLimit(env), Date.now());
    return Response.json({ ...quota, configured: credentials(env) !== null });
  }

  if (request.method !== 'POST') {
    return fail('NOT_FOUND', 'Unknown endpoint.');
  }

  const url = new URL(request.url);

  if (path === '/api/pdf/export') {
    const format = (url.searchParams.get('format') ?? 'docx').toLowerCase();
    const resultType = EXPORT_FORMATS[format];
    if (!resultType) {
      return fail('INVALID_INPUT', `"${format}" is not a supported export format.`);
    }
    return metered(env, request, 'operation/exportpdf', { targetFormat: format }, resultType);
  }

  if (path === '/api/pdf/ocr') {
    const language = url.searchParams.get('lang') ?? 'en-US';
    return metered(env, request, 'operation/ocr', { ocrLang: language }, 'application/pdf');
  }

  if (path === '/api/pdf/compress') {
    const level = (url.searchParams.get('level') ?? 'MEDIUM').toUpperCase();
    if (!COMPRESSION_LEVELS.has(level)) {
      return fail('INVALID_INPUT', `"${level}" is not a supported compression level.`);
    }
    return metered(
      env,
      request,
      'operation/compresspdf',
      { compressionLevel: level },
      'application/pdf',
    );
  }

  return fail('NOT_FOUND', 'Unknown endpoint.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/')) {
      return handleApi(request, env, path);
    }
    // Everything else is the SPA.
    return env.ASSETS.fetch(request);
  },
};
