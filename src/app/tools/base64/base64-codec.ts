/**
 * Base64 helpers sized for large payloads.
 *
 * The naive `atob` + per-character loop is O(n) in JavaScript and stalls the
 * main thread for seconds on a multi-megabyte file. Two things fix that:
 *
 *  1. `Uint8Array.toBase64` / `Uint8Array.fromBase64` — native, and roughly an
 *     order of magnitude faster than anything written in JS. Available in
 *     current Chrome/Safari/Firefox; the chunked `btoa`/`atob` fallback below
 *     covers everything else without ever building one giant binary string.
 *  2. Running the whole thing in a worker — see `base64.worker.ts`.
 */
import { transfer } from 'comlink';

/** Chunk sizes chosen so every slice is a whole number of Base64 groups. */
const ENCODE_CHUNK = 3 * 32768;
const DECODE_CHUNK = 4 * 32768;

/** `Uint8Array.prototype.toBase64`, which TypeScript's ES2022 lib doesn't know about yet. */
type NativeEncode = (this: Uint8Array) => string;
/** `Uint8Array.fromBase64`, likewise. */
type NativeDecode = (
  text: string,
  options?: { alphabet?: 'base64' | 'base64url' },
) => Uint8Array<ArrayBuffer>;

const nativeEncode = (Uint8Array.prototype as Partial<{ toBase64: NativeEncode }>).toBase64;
const nativeDecode = (Uint8Array as unknown as Partial<{ fromBase64: NativeDecode }>).fromBase64;

export interface Base64Payload {
  /** MIME type declared by a `data:` prefix, or '' when there was none. */
  mime: string;
  /** The Base64 payload with any `data:` prefix removed. */
  data: string;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (nativeEncode) {
    return nativeEncode.call(bytes);
  }
  const parts: string[] = [];
  for (let start = 0; start < bytes.length; start += ENCODE_CHUNK) {
    const slice = bytes.subarray(start, start + ENCODE_CHUNK);
    let binary = '';
    for (let i = 0; i < slice.length; i++) {
      binary += String.fromCharCode(slice[i]);
    }
    parts.push(btoa(binary));
  }
  return parts.join('');
}

/**
 * Decode a Base64 payload (no `data:` prefix — call {@link splitDataUri} first).
 *
 * Accepts both the standard alphabet and the URL-safe one (`-`/`_`), which is
 * what JWTs and anything that travels in a query string use.
 */
export function base64ToBytes(payload: string): Uint8Array<ArrayBuffer> {
  const clean = stripWhitespace(payload);
  if (clean === '') {
    return new Uint8Array(0);
  }
  const urlSafe = isUrlSafeAlphabet(clean);
  if (nativeDecode) {
    return nativeDecode.call(Uint8Array, clean, urlSafe ? { alphabet: 'base64url' } : undefined);
  }

  // atob only knows the standard alphabet, so translate first.
  const standard = urlSafe ? clean.replace(/-/g, '+').replace(/_/g, '/') : clean;
  const remainder = standard.length % 4;
  const padded = remainder === 0 ? standard : standard + '='.repeat(4 - remainder);
  // One allocation up front, then fill it in place — no array of chunks to concat.
  const out = new Uint8Array((padded.length / 4) * 3);
  let offset = 0;
  for (let start = 0; start < padded.length; start += DECODE_CHUNK) {
    const binary = atob(padded.slice(start, start + DECODE_CHUNK));
    for (let i = 0; i < binary.length; i++) {
      out[offset++] = binary.charCodeAt(i);
    }
  }
  return out.subarray(0, offset);
}

export function encodeTextToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function decodeBase64ToText(raw: string): string {
  return new TextDecoder().decode(base64ToBytes(splitDataUri(raw).data));
}

/**
 * Split an optional `data:<mime>;base64,` prefix off the front of the input.
 *
 * Deliberately avoids `trim()` and a whole-string regex: the input can be tens
 * of megabytes, and both would copy or scan all of it just to read the header.
 */
export function splitDataUri(raw: string): Base64Payload {
  const start = firstNonSpace(raw);
  const body = start === 0 ? raw : raw.slice(start);
  if (!body.startsWith('data:')) {
    return { mime: '', data: body };
  }
  const marker = body.indexOf(';base64,');
  // A real header is short; anything longer is payload that happens to start with "data:".
  if (marker < 0 || marker > 256) {
    return { mime: '', data: body };
  }
  return { mime: body.slice(5, marker), data: body.slice(marker + 8) };
}

/**
 * Byte count the payload will decode to. Approximate when the input contains
 * line breaks — it is used for a size hint, not for allocation.
 */
export function decodedByteLength(payload: string): number {
  if (payload.length === 0) {
    return 0;
  }
  const tail = payload.slice(-8).replace(/\s+$/, '');
  const padding = tail.endsWith('==') ? 2 : tail.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(payload.length / 4) * 3 - padding);
}

/**
 * Identify the payload from its first few bytes without decoding the rest —
 * this runs on every paste, so it must stay O(1).
 *
 * Returns '' when the leading characters are not valid Base64 at all.
 */
export function sniffBase64Mime(payload: string): string {
  const head = stripWhitespace(payload.slice(0, 128));
  // Trim to a whole number of Base64 groups, unless the whole input is shorter
  // than one group — a final partial group decodes fine on its own.
  const aligned = head.slice(0, head.length - (head.length % 4));
  const usable = aligned.length >= 4 ? aligned : head;
  if (usable.length < 2) {
    return '';
  }
  try {
    return sniffMime(base64ToBytes(usable));
  } catch {
    return '';
  }
}

/**
 * How much of the payload is looked at when deciding whether it is text.
 * Bounded so this stays cheap on a 50 MB decode.
 */
const TEXT_SAMPLE_BYTES = 2048;

/**
 * True when the text contains a control character that real text never has.
 * Tab (9), newline (10) and carriage return (13) are the legitimate exceptions.
 *
 * Written as a scan rather than a regex so the character range is unambiguous
 * in the source.
 */
function hasBinaryControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      return true;
    }
  }
  return false;
}

/**
 * Guess a MIME type from a file's magic bytes, falling back to a UTF-8 sniff
 * so that Base64 of JSON, XML or plain text is recognised as such rather than
 * being written off as opaque binary. Generic binary is the last resort.
 */
export function sniffMime(b: Uint8Array): string {
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    return 'application/pdf'; // %PDF
  }
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return 'image/png';
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return 'image/jpeg';
  }
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return 'image/gif'; // GIF8
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 && // RIFF
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50 // WEBP
  ) {
    return 'image/webp';
  }
  return sniffTextMime(b.subarray(0, TEXT_SAMPLE_BYTES)) ?? 'application/octet-stream';
}

/**
 * Classify a leading sample as text, or return null if it isn't.
 *
 * Decoding in `stream` mode is what makes a *sample* safe to test: a multi-byte
 * character chopped in half at the sample boundary is held back rather than
 * treated as invalid, so a large UTF-8 file is not misread as binary.
 */
function sniffTextMime(sample: Uint8Array): string | null {
  if (sample.length === 0) {
    return null;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(sample, { stream: true });
  } catch {
    return null; // Not valid UTF-8 — binary.
  }
  // Control characters that never appear in real text give away binary data
  // that happens to be UTF-8 decodable. Tab, newline and carriage return are
  // the legitimate exceptions.
  if (text === '' || hasBinaryControlChars(text)) {
    return null;
  }
  const head = text.trimStart();
  const lower = head.toLowerCase();
  if (head.startsWith('{') || head.startsWith('[')) {
    return 'application/json';
  }
  // Checked before the generic XML case so an SVG behind an XML declaration is
  // still reported as an SVG.
  if (lower.includes('<svg')) {
    return 'image/svg+xml';
  }
  if (lower.startsWith('<?xml')) {
    return 'application/xml';
  }
  if (lower.startsWith('<!doctype html') || lower.startsWith('<html')) {
    return 'text/html';
  }
  return 'text/plain';
}

export type PreviewKind = 'image' | 'pdf' | 'text' | 'other';

export function previewKind(mime: string): PreviewKind {
  if (mime === 'image/svg+xml') {
    // Shown as source rather than rendered — an SVG is a document, and reading
    // it is more useful here than drawing it.
    return 'text';
  }
  if (mime.startsWith('image/')) {
    return 'image';
  }
  if (mime === 'application/pdf') {
    return 'pdf';
  }
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml') {
    return 'text';
  }
  return 'other';
}

export function extForMime(mime: string): string {
  switch (mime) {
    case 'application/pdf':
      return 'pdf';
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    case 'application/json':
      return 'json';
    case 'application/xml':
      return 'xml';
    case 'text/html':
      return 'html';
    case 'text/plain':
      return 'txt';
    default:
      return 'bin';
  }
}

/** Short, human label for a sniffed type — used in the "looks like a PDF" hint. */
export function labelForMime(mime: string): string {
  switch (mime) {
    case 'application/pdf':
      return 'PDF';
    case 'application/octet-stream':
      return 'Binary';
    case 'application/json':
      return 'JSON';
    case 'application/xml':
      return 'XML';
    case 'image/svg+xml':
      return 'SVG';
    case 'text/html':
      return 'HTML';
    case 'text/plain':
      return 'Text';
    default:
      return mime.startsWith('image/') ? mime.slice(6).toUpperCase() : mime;
  }
}

export interface DecodedBytes {
  bytes: Uint8Array<ArrayBuffer>;
  /** Declared by a `data:` prefix, or sniffed from the decoded bytes. */
  mime: string;
}

/**
 * What `base64.worker.ts` exposes over Comlink — and what the client calls
 * directly when there is no worker to talk to.
 *
 * Defining it here rather than in the worker means the two paths cannot drift:
 * the fallback is not a reimplementation, it is the same object.
 *
 * Failures are normalised into a plain `Error` on this side of the boundary so
 * the message is identical whichever path ran, and so nothing exotic has to
 * survive being structured-cloned out of the worker.
 *
 * Every method is async even where the work is not: it makes the local object
 * and Comlink's proxy of it the same shape, so the client can hold either.
 */
export const base64Api = {
  async encodeFile(file: File): Promise<string> {
    try {
      return bytesToBase64(new Uint8Array(await file.arrayBuffer()));
    } catch (error) {
      throw new Error(base64ErrorMessage(error));
    }
  },

  async encodeText(text: string): Promise<string> {
    return reported(() => encodeTextToBase64(text));
  },

  async decodeText(text: string): Promise<string> {
    return reported(() => decodeBase64ToText(text));
  },

  async decodeBytes(text: string): Promise<DecodedBytes> {
    return reported(() => {
      const { mime, data } = splitDataUri(text);
      const bytes = base64ToBytes(data);
      // Move the decoded bytes to the caller instead of copying them. Marking a
      // result for transfer is inert when nothing crosses a thread, so the
      // fallback path can run the very same function.
      return transfer({ bytes, mime: mime || sniffMime(bytes) }, [bytes.buffer]);
    });
  },
};

export type Base64Api = typeof base64Api;

/** Run a step, turning anything it throws into a message worth showing a user. */
function reported<T>(step: () => T): T {
  try {
    return step();
  } catch (error) {
    throw new Error(base64ErrorMessage(error));
  }
}

// Re-exported so the codec stays the single import for everything Base64,
// including the worker, while the implementation lives with the other shared
// formatting helpers.
export { formatBytes } from '../../core/format';

/** Turn an unknown throwable into a message worth showing a user. */
export function base64ErrorMessage(error: unknown): string {
  if (error instanceof DOMException || error instanceof Error) {
    if (
      /invalid|character|base64|decode/i.test(error.message) ||
      error.name === 'InvalidCharacterError'
    ) {
      return 'That input is not valid Base64.';
    }
    return error.message;
  }
  return 'That input could not be processed.';
}

/**
 * Detect the URL-safe alphabet by looking for `-` or `_`, which the standard
 * alphabet never produces.
 *
 * Only the head is scanned so this stays O(1) on a 50 MB payload. That is safe:
 * those two characters occur in roughly 1 in 32 positions, so any payload long
 * enough for the limit to matter will reveal itself immediately, and a short
 * URL-safe payload containing neither is byte-identical to the standard form.
 */
function isUrlSafeAlphabet(clean: string): boolean {
  const head = clean.length > 4096 ? clean.slice(0, 4096) : clean;
  return head.includes('-') || head.includes('_');
}

/** Strip ASCII whitespace, but only pay for the copy when there is some to strip. */
function stripWhitespace(text: string): string {
  return /\s/.test(text) ? text.replace(/\s+/g, '') : text;
}

function firstNonSpace(text: string): number {
  let i = 0;
  while (i < text.length && text.charCodeAt(i) <= 32) {
    i++;
  }
  return i;
}
