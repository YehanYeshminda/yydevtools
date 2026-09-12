/**
 * Which way a pasted string wants to go, and what is wrong with it when it
 * cannot be decoded. Both look only at the head of the input so a paste of
 * tens of megabytes costs the same as one line.
 */
import { base64ToBytes, previewKind, sniffMime, splitDataUri } from './base64-codec';

export type Direction = 'encode' | 'decode';

export interface Detection {
  direction: Direction;
  /** One short clause the UI shows next to the mode switch. */
  reason: string;
  /** The sniffed type when the input decodes to something recognisable. */
  mime: string;
}

export interface Issue {
  /** Position in the input, 1-based, as a person would count it. */
  position: number;
  char: string;
  message: string;
}

/** How much of the input is examined. */
const HEAD = 4096;

const ALLOWED = /[A-Za-z0-9+/=_\-\s]/;

/** The first character that Base64 never contains, or null when there is none in the head. */
export function firstInvalid(text: string): Issue | null {
  const { data } = splitDataUri(text);
  const offset = text.length - data.length;
  const head = data.length > HEAD ? data.slice(0, HEAD) : data;
  for (let i = 0; i < head.length; i++) {
    const char = head[i];
    if (!ALLOWED.test(char)) {
      const shown = char === ' ' ? 'a non-breaking space' : `“${char}”`;
      return {
        position: offset + i + 1,
        char,
        message: `${shown} at position ${offset + i + 1} is not a Base64 character.`,
      };
    }
  }
  return null;
}

/** Removes every character Base64 never contains, keeping whitespace and any data: prefix. */
export function stripInvalid(text: string): string {
  const { data } = splitDataUri(text);
  const prefix = text.slice(0, text.length - data.length);
  return prefix + data.replace(/[^A-Za-z0-9+/=_\-\s]+/g, '');
}

/**
 * Decode if the input is well-formed Base64 that turns into readable text or a
 * recognisable file; otherwise the person almost certainly wants to encode.
 */
export function detect(text: string): Detection {
  const { data, mime } = splitDataUri(text);
  if (mime) {
    return { direction: 'decode', reason: 'a data URI', mime };
  }
  if (firstInvalid(text)) {
    return { direction: 'encode', reason: 'plain text', mime: '' };
  }
  const clean = (data.length > HEAD ? data.slice(0, HEAD) : data).replace(/\s+/g, '');
  if (clean.length < 4 || (data.length < HEAD && clean.length % 4 === 1)) {
    return { direction: 'encode', reason: 'plain text', mime: '' };
  }
  let bytes: Uint8Array;
  try {
    // Whole quads only, so a cut in the middle of the head does not throw.
    bytes = base64ToBytes(clean.slice(0, clean.length - (clean.length % 4)));
  } catch {
    return { direction: 'encode', reason: 'plain text', mime: '' };
  }
  const sniffed = sniffMime(bytes);
  if (previewKind(sniffed) !== 'text' || sniffed === 'application/octet-stream') {
    if (sniffed === 'application/octet-stream') {
      return { direction: 'encode', reason: 'plain text', mime: '' };
    }
    return { direction: 'decode', reason: 'Base64 of a file', mime: sniffed };
  }
  return isReadable(bytes)
    ? { direction: 'decode', reason: 'Base64 of text', mime: sniffed }
    : { direction: 'encode', reason: 'plain text', mime: '' };
}

/** Valid UTF-8 with no control characters beyond tab, newline and return. */
function isReadable(bytes: Uint8Array): boolean {
  try {
    // `stream` tolerates a multi-byte sequence cut off by the head limit.
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: true });
    // eslint-disable-next-line no-control-regex
    return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text);
  } catch {
    return false;
  }
}
