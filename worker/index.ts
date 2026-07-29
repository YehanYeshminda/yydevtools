/**
 * yydevtools Worker.
 *
 * Serves the built Angular SPA from static assets and exposes a small API for
 * the operations that cannot run in the browser. Each one forwards to a
 * self-hosted service on Fly.io — Ghostscript (compress), ocrmypdf (OCR) and
 * LibreOffice (convert to Word/RTF). All are free per call, so nothing here is
 * metered. Merge, split, viewing and image compression stay entirely
 * client-side and never touch this Worker.
 */

import { ServiceError, serviceEndpoint, forwardToService } from './services';
import { allowRequest } from './rate-limit';

/** Workers Rate Limiting binding (see the `ratelimits` block in wrangler.jsonc). */
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ASSETS: Fetcher;

  // Base URLs of the Fly services (plain vars).
  PDF_COMPRESS_URL?: string;
  PDF_OCR_URL?: string;
  PDF_CONVERT_URL?: string;

  // Shared secrets, each set with `wrangler secret put <NAME>` — never vars.
  PDF_COMPRESS_SECRET?: string;
  PDF_OCR_SECRET?: string;
  PDF_CONVERT_SECRET?: string;

  /** Coarse per-location rate limiter for the API operations (Cloudflare binding). */
  API_RATE_LIMITER?: RateLimiter;

  // Upstash Redis REST — the exact, global per-IP rate limiter. URL is a plain
  // var; the token is a secret (`wrangler secret put UPSTASH_REDIS_REST_TOKEN`).
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}

/** Keep the Worker from streaming huge bodies; the services cap a little higher. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

type ErrorCode =
  | 'NOT_CONFIGURED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_REJECTED'
  | 'TIMEOUT'
  | 'TOO_LARGE'
  | 'INVALID_INPUT'
  | 'RATE_LIMITED'
  | 'NOT_FOUND';

const STATUS: Record<ErrorCode, number> = {
  NOT_CONFIGURED: 503,
  UPSTREAM_UNAVAILABLE: 502,
  UPSTREAM_REJECTED: 502,
  TIMEOUT: 504,
  TOO_LARGE: 413,
  INVALID_INPUT: 400,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
};

function fail(code: ErrorCode, message: string): Response {
  return Response.json({ error: { code, message } }, { status: STATUS[code] });
}

/** Ghostscript presets, mapped from the tool's LOW/MEDIUM/HIGH levels. */
const COMPRESS_PRESETS: Record<string, string> = {
  LOW: 'printer', // ~300 dpi, barely touches image detail
  MEDIUM: 'ebook', // ~150 dpi, a good default
  HIGH: 'screen', // ~72 dpi, smallest file
};

/** PDF→Office targets we accept. xlsx/pptx are dropped: LibreOffice does them badly. */
const EXPORT_FORMATS = new Set(['docx', 'rtf']);

/** Tool locale codes → Tesseract language codes the OCR service ships packs for. */
const OCR_LANGS: Record<string, string> = {
  'en-US': 'eng',
  'en-GB': 'eng',
  'de-DE': 'deu',
  'fr-FR': 'fra',
  'es-ES': 'spa',
  'it-IT': 'ita',
  'pt-BR': 'por',
  'nl-NL': 'nld',
  'sv-SE': 'swe',
  'pl-PL': 'pol',
  'tr-TR': 'tur',
  'ru-RU': 'rus',
  'ja-JP': 'jpn',
  'ko-KR': 'kor',
  'zh-CN': 'chi_sim',
};

/**
 * The API only exists to serve our own pages, so reject cross-origin callers
 * rather than letting anyone else use the services.
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

async function readBody(request: Request): Promise<ArrayBuffer | Response> {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
    return fail(
      'TOO_LARGE',
      `That file is larger than the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit for this tool.`,
    );
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) {
    return fail('INVALID_INPUT', 'No file was sent.');
  }
  // Content-Length can be absent or wrong; the real size is authoritative.
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return fail(
      'TOO_LARGE',
      `That file is larger than the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit for this tool.`,
    );
  }
  return bytes;
}

/**
 * Reads the body and forwards it to a Fly service, translating failures into
 * the shared error contract. `endpoint` is null when the service is not wired
 * up on this deployment.
 */
async function proxy(
  request: Request,
  endpoint: ReturnType<typeof serviceEndpoint>,
  pathname: string,
  query: Record<string, string>,
): Promise<Response> {
  if (!endpoint) {
    return fail('NOT_CONFIGURED', 'This tool is not configured on the server right now.');
  }

  const body = await readBody(request);
  if (body instanceof Response) {
    return body;
  }

  try {
    const result = await forwardToService(endpoint, pathname, query, body);
    return new Response(result.body, { headers: { 'Content-Type': result.contentType } });
  } catch (error) {
    if (error instanceof ServiceError) {
      return fail(error.code, error.message);
    }
    return fail('UPSTREAM_UNAVAILABLE', 'The service could not be reached.');
  }
}

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  if (!sameOrigin(request)) {
    return fail('INVALID_INPUT', 'Cross-origin requests are not accepted.');
  }

  if (request.method !== 'POST') {
    return fail('NOT_FOUND', 'Unknown endpoint.');
  }

  // Rate-limit the operations by client IP so nobody can hammer the Fly
  // services. The Worker holds the only real IP (CF-Connecting-IP); the services
  // just see the Worker. Two layers, cheapest first: the Cloudflare binding is a
  // free, per-location coarse guard that absorbs bursts without a Redis
  // round-trip, then Upstash Redis enforces an exact 20/minute ceiling shared
  // across every Cloudflare location. Either one saying no rejects the request;
  // both are skipped only when unconfigured rather than failing the request.
  const clientIp = request.headers.get('CF-Connecting-IP') ?? 'anonymous';

  if (env.API_RATE_LIMITER) {
    const { success } = await env.API_RATE_LIMITER.limit({ key: clientIp });
    if (!success) {
      return fail(
        'RATE_LIMITED',
        'You are making requests too quickly. Please wait a minute and try again.',
      );
    }
  }

  if (!(await allowRequest(env, clientIp))) {
    return fail(
      'RATE_LIMITED',
      'You are making requests too quickly. Please wait a minute and try again.',
    );
  }

  const url = new URL(request.url);

  if (path === '/api/pdf/compress') {
    const level = (url.searchParams.get('level') ?? 'MEDIUM').toUpperCase();
    const preset = COMPRESS_PRESETS[level];
    if (!preset) {
      return fail('INVALID_INPUT', `"${level}" is not a supported compression level.`);
    }
    const endpoint = serviceEndpoint(env.PDF_COMPRESS_URL, env.PDF_COMPRESS_SECRET);
    return proxy(request, endpoint, '/compress', { preset });
  }

  if (path === '/api/pdf/ocr') {
    const locale = url.searchParams.get('lang') ?? 'en-US';
    const lang = OCR_LANGS[locale];
    if (!lang) {
      return fail('INVALID_INPUT', `"${locale}" is not a supported OCR language.`);
    }
    const endpoint = serviceEndpoint(env.PDF_OCR_URL, env.PDF_OCR_SECRET);
    return proxy(request, endpoint, '/ocr', { lang });
  }

  if (path === '/api/pdf/export') {
    const format = (url.searchParams.get('format') ?? 'docx').toLowerCase();
    if (!EXPORT_FORMATS.has(format)) {
      return fail('INVALID_INPUT', `"${format}" is not a supported export format.`);
    }
    const endpoint = serviceEndpoint(env.PDF_CONVERT_URL, env.PDF_CONVERT_SECRET);
    return proxy(request, endpoint, '/convert', { format });
  }

  // There is deliberately no /api/image/compress. Image compression moved into
  // the browser (mozjpeg and libwebp as WebAssembly), so the route would be an
  // open proxy into an image decoder that nothing calls — attack surface with no
  // user behind it.

  return fail('NOT_FOUND', 'Unknown endpoint.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // The site is canonical on the apex domain; www exists only so that anyone
    // who types it lands somewhere instead of on a DNS error. Redirect it
    // permanently, path and query intact, before anything else runs — serving
    // the same pages on two hostnames would split the SEO signal and give
    // AdSense a second, uncanonical copy of every page to crawl.
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }

    const path = url.pathname;
    if (path.startsWith('/api/')) {
      return handleApi(request, env, path);
    }
    // Every route is prerendered to its own HTML file, so a miss is a genuine
    // miss. Serve the prerendered 404 page, but with a 404 status — returning
    // the homepage with 200 (the old SPA fallback) made every bad URL a soft
    // 404 in Search Console and is a common AdSense rejection reason.
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) {
      return response;
    }

    const notFound = await env.ASSETS.fetch(new URL('/404', request.url));
    return new Response(notFound.body, {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};
