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
import { getNews } from './news';
import { cacheControlFor } from './asset-cache';
import { withSecurityHeaders } from './security-headers';

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
  // The one non-Node service — see services/office-convert/Program.cs for why.
  OFFICE_CONVERT_URL?: string;

  // Shared secrets, each set with `wrangler secret put <NAME>` — never vars.
  PDF_COMPRESS_SECRET?: string;
  PDF_OCR_SECRET?: string;
  PDF_CONVERT_SECRET?: string;
  OFFICE_CONVERT_SECRET?: string;

  /** CurrentsAPI key for the news feed — a secret (`wrangler secret put CURRENTS_API_KEY`). */
  CURRENTS_API_KEY?: string;

  /** Coarse per-location rate limiter for the API operations (Cloudflare binding). */
  API_RATE_LIMITER?: RateLimiter;

  // Upstash Redis REST — the exact, global per-IP rate limiter. URL is a plain
  // var; the token is a secret (`wrangler secret put UPSTASH_REDIS_REST_TOKEN`).
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}

/** Keep the Worker from streaming huge bodies; the services cap a little higher. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * How long to wait on each service, per route.
 *
 * Each of these sits a little *above* that service's own internal timeout
 * (90 s / 150 s / 120 s) plus room for a cold-machine wake. The ordering is the
 * point: whoever gives up first decides whether the work stops, and it should
 * always be the service — a job the Worker has abandoned but the machine is
 * still grinding through is CPU nobody will ever collect. A single shared 180 s
 * budget got this backwards for OCR, which was allowed to run for 240 s.
 */
const ROUTE_TIMEOUT_MS = {
  compress: 120_000,
  ocr: 165_000,
  export: 135_000,
  // DocIO and XlsIO parse in-process — no Ghostscript/LibreOffice/Tesseract
  // spawn to wait on — so this mostly covers a cold Fly wake, not real work.
  officeImport: 60_000,
} as const;

/** Seconds to tell a rate-limited caller to wait, matching the 60 s window. */
const RETRY_AFTER_SECONDS = '60';

function rateLimited(): Response {
  return Response.json(
    {
      error: {
        code: 'RATE_LIMITED',
        message: 'You are making requests too quickly. Please wait a minute and try again.',
      },
    },
    { status: STATUS.RATE_LIMITED, headers: { 'Retry-After': RETRY_AFTER_SECONDS } },
  );
}

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
  timeoutMs: number,
  // Passed only by the Excel route, whose body is a multipart form the
  // Spreadsheet component built itself — that boundary has to survive the hop.
  contentType?: string,
): Promise<Response> {
  if (!endpoint) {
    return fail('NOT_CONFIGURED', 'This tool is not configured on the server right now.');
  }

  const body = await readBody(request);
  if (body instanceof Response) {
    return body;
  }

  try {
    const result = await forwardToService(endpoint, pathname, query, body, timeoutMs, contentType);
    return new Response(result.body, {
      headers: {
        'Content-Type': result.contentType,
        // Results are per-request and never shared; a cache between here and the
        // browser holding one would be both useless and a privacy problem.
        'Cache-Control': 'no-store',
        ...result.meta,
      },
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      return fail(error.code, error.message);
    }
    return fail('UPSTREAM_UNAVAILABLE', 'The service could not be reached.');
  }
}

/** How long the news response may be re-used, in the browser and at the edge. */
const NEWS_CACHE_CONTROL = 'public, max-age=1800, s-maxage=10800';

/**
 * Serves the cached technology-news feed. This is a cheap read, not a metered
 * operation, so it skips the per-IP limiter that guards the Fly services and
 * leans on caching instead: an edge hit here never runs the module below, and a
 * miss only reaches CurrentsAPI when the Redis copy has also expired.
 */
async function handleNews(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== 'GET') {
    return fail('NOT_FOUND', 'Unknown endpoint.');
  }

  // Collapse every caller onto one canonical, query-free cache entry so the feed
  // cannot be cache-busted into hammering Redis.
  const cache = caches.default;
  const cacheKey = new Request(new URL('/api/news', request.url).toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) {
    return hit;
  }

  const result = await getNews(env);
  if (!result.ok) {
    // Failures are deliberately not cached: a missing key or a transient outage
    // should recover the moment it is fixed, not linger for the cache window.
    return fail(
      result.code,
      result.code === 'NOT_CONFIGURED'
        ? 'The news feed is not configured on the server right now.'
        : 'The news feed could not be reached right now.',
    );
  }

  const response = new Response(JSON.stringify(result.payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': NEWS_CACHE_CONTROL,
    },
  });
  // Populate the edge cache off the response path.
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

/** How long a wake is assumed to still be in effect, so repeat visits are free. */
const WARM_TTL_SECONDS = 60;

/** Long enough for a suspended machine to answer, short enough to not hang on a dead one. */
const WARM_TIMEOUT_MS = 20_000;

/** Base URL of the machine behind a hosted tool, or undefined if unknown. */
export function warmBaseUrl(env: Env, service: string): string | undefined {
  switch (service) {
    case 'compress':
      return env.PDF_COMPRESS_URL;
    case 'ocr':
      return env.PDF_OCR_URL;
    case 'export':
      return env.PDF_CONVERT_URL;
    case 'office':
      return env.OFFICE_CONVERT_URL;
    default:
      return undefined;
  }
}

/**
 * Wakes the machine behind a hosted tool, so it is up by the time the user has
 * chosen a file.
 *
 * The Fly machines run `min_machines_running = 0` and suspend when idle, so the
 * first request after a quiet spell pays for the resume. That cost is the same
 * whether it lands on the upload or on a page view — the difference is that a
 * page view has ten seconds of the user reading and picking a file to hide it
 * behind, and the upload has nothing.
 *
 * `/health` is the target because it is unauthenticated (Fly's own checks call
 * it), so this route never needs to touch a secret. The response is deliberately
 * not awaited: the page is not waiting on it, and the point is to *start* the
 * wake. It is also cached at the edge for a minute, so a burst of visitors, or
 * one visitor reloading, produces one wake rather than one each.
 */
async function handleWarm(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== 'GET') {
    return fail('NOT_FOUND', 'Unknown endpoint.');
  }

  const service = new URL(request.url).searchParams.get('service') ?? '';
  const base = warmBaseUrl(env, service);
  if (!base) {
    return fail('INVALID_INPUT', `"${service}" is not a hosted service.`);
  }

  // One canonical key per service, so a query-string variation cannot bypass
  // the dedupe and turn this into a way to hammer the machines.
  const cache = caches.default;
  const cacheKey = new Request(
    new URL(`/api/warm?service=${service}`, request.url).toString(),
    { method: 'GET' },
  );
  const hit = await cache.match(cacheKey);
  if (hit) {
    return hit;
  }

  ctx.waitUntil(
    fetch(new URL('/health', base), { signal: AbortSignal.timeout(WARM_TIMEOUT_MS) }).then(
      () => undefined,
      // A machine that will not wake is not the page's problem: the upload
      // itself reports failure properly, with the retry in services.ts.
      () => undefined,
    ),
  );

  const response = Response.json(
    { warming: service },
    { headers: { 'Cache-Control': `public, max-age=${WARM_TTL_SECONDS}` } },
  );
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function handleApi(
  request: Request,
  env: Env,
  path: string,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!sameOrigin(request)) {
    return fail('INVALID_INPUT', 'Cross-origin requests are not accepted.');
  }

  // The news feed and the pre-warm are cached GETs, handled before the
  // POST-only gate below. Neither is metered, so neither pays the per-IP
  // limiter that guards the Fly operations.
  if (path === '/api/news') {
    return handleNews(request, env, ctx);
  }
  if (path === '/api/warm') {
    return handleWarm(request, env, ctx);
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
      return rateLimited();
    }
  }

  if (!(await allowRequest(env, clientIp))) {
    return rateLimited();
  }

  const url = new URL(request.url);

  if (path === '/api/pdf/compress') {
    const level = (url.searchParams.get('level') ?? 'MEDIUM').toUpperCase();
    const preset = COMPRESS_PRESETS[level];
    if (!preset) {
      return fail('INVALID_INPUT', `"${level}" is not a supported compression level.`);
    }
    const endpoint = serviceEndpoint(env.PDF_COMPRESS_URL, env.PDF_COMPRESS_SECRET);
    return proxy(request, endpoint, '/compress', { preset }, ROUTE_TIMEOUT_MS.compress);
  }

  if (path === '/api/pdf/ocr') {
    const locale = url.searchParams.get('lang') ?? 'en-US';
    const lang = OCR_LANGS[locale];
    if (!lang) {
      return fail('INVALID_INPUT', `"${locale}" is not a supported OCR language.`);
    }
    const endpoint = serviceEndpoint(env.PDF_OCR_URL, env.PDF_OCR_SECRET);
    // `deskew` straightens a crooked scan before recognition. It is off unless
    // asked for — it re-renders the page image, so it is not free.
    const query: Record<string, string> = { lang };
    if (url.searchParams.get('deskew') === '1') {
      query['deskew'] = '1';
    }
    return proxy(request, endpoint, '/ocr', query, ROUTE_TIMEOUT_MS.ocr);
  }

  if (path === '/api/pdf/export') {
    const format = (url.searchParams.get('format') ?? 'docx').toLowerCase();
    if (!EXPORT_FORMATS.has(format)) {
      return fail('INVALID_INPUT', `"${format}" is not a supported export format.`);
    }
    const endpoint = serviceEndpoint(env.PDF_CONVERT_URL, env.PDF_CONVERT_SECRET);
    return proxy(request, endpoint, '/convert', { format }, ROUTE_TIMEOUT_MS.export);
  }

  if (path === '/api/word/import') {
    const endpoint = serviceEndpoint(env.OFFICE_CONVERT_URL, env.OFFICE_CONVERT_SECRET);
    return proxy(request, endpoint, '/word/import', {}, ROUTE_TIMEOUT_MS.officeImport);
  }

  // Unlike every other route here, the browser rather than our own code shapes
  // this request: the Spreadsheet component posts the file to whatever
  // `openUrl` it was given. So the multipart body is forwarded verbatim,
  // Content-Type and boundary intact, and the shared secret is added on this
  // side where it belongs.
  if (path === '/api/excel/import') {
    const endpoint = serviceEndpoint(env.OFFICE_CONVERT_URL, env.OFFICE_CONVERT_SECRET);
    return proxy(
      request,
      endpoint,
      '/excel/import',
      {},
      ROUTE_TIMEOUT_MS.officeImport,
      request.headers.get('Content-Type') ?? undefined,
    );
  }

  // There is deliberately no /api/image/compress. Image compression moved into
  // the browser (mozjpeg and libwebp as WebAssembly), so the route would be an
  // open proxy into an image decoder that nothing calls — attack surface with no
  // user behind it.

  return fail('NOT_FOUND', 'Unknown endpoint.');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Every answer gets the security headers, including redirects and errors —
    // an HSTS header on the www redirect is the one that matters most, since
    // that redirect is often the first response a visitor ever sees.
    return withSecurityHeaders(await route(request, env, ctx));
  },
};

/** Everything the site answers, before the security headers are put on top. */
async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
    return handleApi(request, env, path, ctx);
  }
  // Every route is prerendered to its own HTML file, so a miss is a genuine
  // miss. Serve the prerendered 404 page, but with a 404 status — returning
  // the homepage with 200 (the old SPA fallback) made every bad URL a soft
  // 404 in Search Console and is a common AdSense rejection reason.
  const response = await env.ASSETS.fetch(request);
  if (response.status !== 404) {
    // Content-hashed bundles are safe to keep forever; everything else stays
    // on the asset server's revalidating default. See asset-cache.ts for why
    // this is here rather than in a `_headers` file.
    const cacheControl = cacheControlFor(path);
    if (cacheControl && (response.status === 200 || response.status === 304)) {
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', cacheControl);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  }

  const notFound = await env.ASSETS.fetch(new URL('/404', request.url));
  return new Response(notFound.body, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
