/**
 * Cache policy for the built static assets.
 *
 * Cloudflare's asset server sends `public, max-age=0, must-revalidate` for
 * everything it serves. That is the right default for the prerendered HTML —
 * `/tools/json-formatter` has to be allowed to change — but it is wasted work
 * for the build outputs whose filename carries a content hash. Those bytes can
 * never change: editing the source changes the hash, which changes the URL, so
 * the old URL either serves the old bytes or nothing at all. Revalidating them
 * on every repeat visit is a round trip that can only ever answer "unchanged".
 *
 * This lives in the Worker rather than in a `_headers` file because
 * `run_worker_first` is on (see wrangler.jsonc — it is what makes the real 404
 * possible). Cloudflare does not apply `_headers` to responses that come back
 * through a Worker, so a `_headers` file here would parse, deploy, and do
 * nothing. If `run_worker_first` is ever narrowed so asset requests bypass the
 * Worker, these rules move to `_headers`.
 */

/**
 * A year — the longest any browser will honour — plus `immutable`, which also
 * suppresses the revalidation a forced reload would otherwise send.
 */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Build outputs named with a content hash: `main-4MABCUTM.js`,
 * `chunk-24P2FEDI.js`, `styles-YECPLTDH.css`, `worker-VFRYLWSD.js`. The hash is
 * esbuild's eight upper-case base32 characters, and it is required here — a
 * plain name like `/sw.js` must keep revalidating, since its URL is stable
 * across deploys and a stale copy would stick for a year.
 *
 * Only the root is matched, which is everything the build emits today. Files
 * under `/wasm`, `/tesseract` and `/pdfjs` are vendored under stable names and
 * so are deliberately left on the revalidating default.
 */
const HASHED_ASSET = /^\/[\w.]+-[A-Z0-9]{8}\.(?:css|js)$/;

/**
 * The `Cache-Control` to send for a static asset path, or `null` to leave the
 * asset server's own header alone.
 */
export function cacheControlFor(pathname: string): string | null {
  return HASHED_ASSET.test(pathname) ? IMMUTABLE_CACHE_CONTROL : null;
}
