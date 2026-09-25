/**
 * Security headers, applied to everything this Worker answers.
 *
 * Like the cache policy next door, these live in the Worker rather than in a
 * `_headers` file: `run_worker_first` is on, and Cloudflare does not apply
 * `_headers` to responses that come back through a Worker.
 *
 * There is deliberately no `Content-Security-Policy` beyond `frame-ancestors`.
 * A `srcdoc` iframe inherits its parent document's CSP, and the HTML Preview
 * tool is a `srcdoc` iframe whose entire purpose is to run the HTML someone
 * pasted — so any `script-src` worth setting would break that tool, silently,
 * for exactly the people using its scripts toggle. The PDF preview embeds a
 * `blob:` frame with the same inheritance. A real policy has to be written
 * around both, plus whatever AdSense turns out to need, and that is its own
 * job rather than a line in this table. `frame-ancestors` is safe now because
 * it governs who may embed *us*, which is nobody, and does not reach documents
 * that were never fetched over the network.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  /**
   * Two years, subdomains included. Not `preload` — that is a one-way door
   * (removal from the browser list takes months) and belongs to whoever owns
   * the domain, not to a header table.
   */
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',

  /**
   * Stops a browser from second-guessing a Content-Type. This site hands back
   * user-supplied bytes from the PDF and image tools, and a file the browser
   * decides to treat as HTML is the whole class of bug this prevents.
   */
  'X-Content-Type-Options': 'nosniff',

  /**
   * Send the full URL to ourselves, only the origin to other sites, and
   * nothing at all when leaving HTTPS. Tool URLs can carry a fragment holding
   * what someone typed, so leaking a path off-site is not hypothetical here.
   */
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  /**
   * Nobody has any business framing these pages. `frame-ancestors` is the
   * modern spelling; `X-Frame-Options` is kept for browsers that never learned
   * it. Both say "same origin" rather than "deny" so that an internal frame is
   * never the thing that breaks.
   */
  'Content-Security-Policy': "frame-ancestors 'self'",
  'X-Frame-Options': 'SAMEORIGIN',

  /**
   * The camera is allowed for this origin only: the QR Code Reader scans
   * through it. `camera=()` here once switched it off for every page, and the
   * reader's "Scan with camera" failed with NotAllowedError on production
   * without the browser ever asking. The e2e did not notice, because it stubs
   * getUserMedia and runs without the Worker in front. `(self)` still refuses
   * it to any cross-origin frame.
   *
   * No tool needs a microphone, a location or a payment sheet, and saying so
   * means an injected script cannot ask on our behalf. Anything not listed
   * keeps its browser default, which is why the clipboard (the copy buttons
   * use it) is absent.
   *
   * public/_headers repeats this value for the paths the Worker never sees.
   * Change both together.
   */
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
};

/**
 * Returns `response` with the headers above set.
 *
 * Responses from the asset server arrive with immutable headers, so this
 * rebuilds rather than mutating. The body is passed through untouched — it is
 * a stream, so nothing is buffered — and a bodyless status such as 304 or a
 * redirect stays bodyless.
 */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
