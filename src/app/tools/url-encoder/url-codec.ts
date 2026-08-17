/**
 * Pure percent-encoding helpers and a URL parser for the URL Encoder / Decoder.
 * No DOM, no Angular — everything here is unit-testable in isolation and safe to
 * run during prerender (the `URL` constructor exists in Node too).
 */

export type Mode = 'encode' | 'decode';

/**
 * Which slice of a URL the text represents:
 * - `component` — a single value such as a query parameter or path segment.
 *   Uses `encodeURIComponent`, which escapes the delimiters (`/ ? : & =` …) too.
 * - `full` — a whole URL. Uses `encodeURI`, which leaves those delimiters intact
 *   so the address stays a working address.
 */
export type Scope = 'component' | 'full';

export interface CodecResult {
  output: string;
  /** Human-readable reason the transform failed, or null when it succeeded. */
  error: string | null;
}

/**
 * Encode or decode `input` at the requested scope. Empty input is a success with
 * empty output, not an error, so the UI stays quiet until there is something to
 * act on.
 */
export function transform(input: string, mode: Mode, scope: Scope): CodecResult {
  if (input === '') {
    return { output: '', error: null };
  }
  try {
    if (mode === 'encode') {
      // encodeURIComponent only throws on a lone surrogate; encodeURI likewise.
      const output = scope === 'full' ? encodeURI(input) : encodeURIComponent(input);
      return { output, error: null };
    }
    const output = scope === 'full' ? decodeURI(input) : decodeURIComponent(input);
    return { output, error: null };
  } catch {
    return {
      output: '',
      error:
        mode === 'encode'
          ? 'This text contains an unpaired surrogate character and cannot be encoded.'
          : 'This is not valid percent-encoding — check for a stray % or an incomplete %XX sequence.',
    };
  }
}

export interface QueryParam {
  key: string;
  /** Already percent-decoded by URLSearchParams, so it reads as plain text. */
  value: string;
}

/** The parts of a URL, ready to render as a breakdown. */
export interface UrlParts {
  protocol: string;
  host: string;
  port: string;
  path: string;
  query: string;
  fragment: string;
  params: QueryParam[];
}

/**
 * Break `input` into its parts, or return null when it is not an absolute URL.
 *
 * Deliberately strict: the `URL` constructor rejects relative or malformed input,
 * which is what we want — the breakdown should appear only when there is a real
 * URL to break down, not for every scrap of text passing through the encoder.
 */
export function parseUrl(input: string): UrlParts | null {
  const trimmed = input.trim();
  if (trimmed === '') {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const params: QueryParam[] = [];
  url.searchParams.forEach((value, key) => params.push({ key, value }));
  return {
    protocol: url.protocol.replace(/:$/, ''),
    host: url.hostname,
    port: url.port,
    path: url.pathname,
    query: url.search.replace(/^\?/, ''),
    fragment: url.hash.replace(/^#/, ''),
    params,
  };
}
