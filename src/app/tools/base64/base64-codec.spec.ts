import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  base64ToBytes,
  bytesToBase64,
  decodeBase64ToText,
  decodedByteLength,
  encodeTextToBase64,
  extForMime,
  formatBytes,
  labelForMime,
  previewKind,
  sniffBase64Mime,
  sniffMime,
  splitDataUri,
} from './base64-codec';

/**
 * The codec has two implementations: the native `Uint8Array.toBase64` /
 * `fromBase64` pair, and a chunked `btoa`/`atob` fallback for browsers without
 * them. `base64-codec.ts` picks one at module load, so which suite below is
 * meaningful depends on the runtime:
 *
 *  - Under the Node/jsdom runner (Node 24 has no native Base64 methods) only
 *    the FALLBACK exists. That is the valuable case: the fallback is dead code
 *    in every browser this ships to, so this is the only place it gets tested.
 *  - In a browser-mode run the natives exist and both suites are real.
 *
 * The native suite is skipped rather than faked when the runtime lacks the
 * methods — a skip is visible in the report, a fake would be a false pass.
 */
type Codec = typeof import('./base64-codec');

const HAS_NATIVE =
  typeof (Uint8Array.prototype as unknown as Record<string, unknown>)['toBase64'] === 'function' &&
  typeof (Uint8Array as unknown as Record<string, unknown>)['fromBase64'] === 'function';

/** Import the module with the native methods hidden, forcing the fallback. */
async function loadWithoutNatives(): Promise<Codec> {
  const proto = Uint8Array.prototype as unknown as Record<string, unknown>;
  const ctor = Uint8Array as unknown as Record<string, unknown>;
  const savedTo = proto['toBase64'];
  const savedFrom = ctor['fromBase64'];
  delete proto['toBase64'];
  delete ctor['fromBase64'];
  try {
    vi.resetModules();
    return await import('./base64-codec');
  } finally {
    if (savedTo !== undefined) {
      proto['toBase64'] = savedTo;
    }
    if (savedFrom !== undefined) {
      ctor['fromBase64'] = savedFrom;
    }
  }
}

/** The module as normally imported — native where the runtime provides it. */
const ambient: Codec = {
  base64ToBytes,
  bytesToBase64,
  decodeBase64ToText,
  decodedByteLength,
  encodeTextToBase64,
  extForMime,
  formatBytes,
  labelForMime,
  previewKind,
  sniffBase64Mime,
  sniffMime,
  splitDataUri,
} as Codec;

let fallback: Codec;

beforeAll(async () => {
  fallback = await loadWithoutNatives();
});

afterAll(() => {
  vi.resetModules();
});

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

const utf8 = (value: string) => new TextEncoder().encode(value);
const text = (value: Uint8Array) => new TextDecoder().decode(value);

describe('base64 codec', () => {
  for (const variant of ['native', 'fallback'] as const) {
    // Skipped, not faked, when the runtime has no native Base64 methods.
    describe.skipIf(variant === 'native' && !HAS_NATIVE)(variant, () => {
      const codec = () => (variant === 'native' ? ambient : fallback);

      // --- Round trips ---------------------------------------------------
      it('round-trips every length modulo 3, so padding is exercised', () => {
        const { bytesToBase64: encode, base64ToBytes: decode } = codec();
        for (let length = 0; length <= 24; length++) {
          const source = new Uint8Array(length);
          for (let i = 0; i < length; i++) {
            source[i] = (i * 37 + 11) % 256;
          }
          expect(decode(encode(source)), `length ${length}`).toEqual(source);
        }
      });

      it('round-trips a payload larger than one internal chunk', () => {
        const { bytesToBase64: encode, base64ToBytes: decode } = codec();
        // The chunked fallback works in 3 * 32768 byte blocks; go past two of
        // them with a deliberately unaligned tail.
        const source = new Uint8Array(3 * 32768 * 2 + 1234);
        for (let i = 0; i < source.length; i++) {
          source[i] = (i * 31) % 256;
        }
        const round = decode(encode(source));
        expect(round.length).toBe(source.length);
        expect(round).toEqual(source);
      });

      it('produces the canonical encoding for the RFC 4648 vectors', () => {
        const { bytesToBase64: encode } = codec();
        expect(encode(utf8(''))).toBe('');
        expect(encode(utf8('f'))).toBe('Zg==');
        expect(encode(utf8('fo'))).toBe('Zm8=');
        expect(encode(utf8('foo'))).toBe('Zm9v');
        expect(encode(utf8('foob'))).toBe('Zm9vYg==');
        expect(encode(utf8('fooba'))).toBe('Zm9vYmE=');
        expect(encode(utf8('foobar'))).toBe('Zm9vYmFy');
      });

      it('decodes the same vectors back', () => {
        const { base64ToBytes: decode } = codec();
        expect(text(decode(''))).toBe('');
        expect(text(decode('Zg=='))).toBe('f');
        expect(text(decode('Zm8='))).toBe('fo');
        expect(text(decode('Zm9v'))).toBe('foo');
        expect(text(decode('Zm9vYg=='))).toBe('foob');
        expect(text(decode('Zm9vYmE='))).toBe('fooba');
        expect(text(decode('Zm9vYmFy'))).toBe('foobar');
      });

      it('handles bytes across the whole 0-255 range', () => {
        const { bytesToBase64: encode, base64ToBytes: decode } = codec();
        const all = new Uint8Array(256);
        for (let i = 0; i < 256; i++) {
          all[i] = i;
        }
        expect(decode(encode(all))).toEqual(all);
      });

      // --- Tolerant input ------------------------------------------------
      it('accepts input wrapped across lines', () => {
        const { base64ToBytes: decode } = codec();
        expect(text(decode('Zm9v\nYmFy'))).toBe('foobar');
        expect(text(decode('  Zm9v \r\n YmFy  '))).toBe('foobar');
      });

      it('accepts a final chunk with its padding omitted', () => {
        const { base64ToBytes: decode } = codec();
        expect(text(decode('Zg'))).toBe('f');
        expect(text(decode('Zm8'))).toBe('fo');
      });

      it('rejects input that is not Base64 at all', () => {
        const { base64ToBytes: decode } = codec();
        expect(() => decode('not base64 !!!')).toThrow();
        // A trailing single character can never be a valid final chunk.
        expect(() => decode('Zm9vY')).toThrow();
      });

      // --- URL-safe alphabet ---------------------------------------------
      it('decodes the URL-safe alphabet', () => {
        const { base64ToBytes: decode, bytesToBase64: encode } = codec();
        // 0xFB 0xFF encodes as "+/8=" in standard Base64 and "-_8=" URL-safe.
        const source = bytes(0xfb, 0xff);
        expect(encode(source)).toBe('+/8=');
        expect(decode('+/8=')).toEqual(source);
        expect(decode('-_8=')).toEqual(source);
      });

      it('decodes URL-safe input with its padding stripped, as a JWT has', () => {
        const { base64ToBytes: decode } = codec();
        const segment = 'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0';
        expect(text(decode(segment))).toBe('{"sub":"1234567890","name":"John Doe"}');
      });

      it('round-trips URL-safe data of every alignment', () => {
        const { base64ToBytes: decode, bytesToBase64: encode } = codec();
        for (let length = 1; length <= 12; length++) {
          const source = new Uint8Array(length);
          for (let i = 0; i < length; i++) {
            source[i] = 0xf8 + (i % 8); // biased towards bytes that produce + and /
          }
          const urlSafe = encode(source)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
          expect(decode(urlSafe), `length ${length}`).toEqual(source);
        }
      });

      it('does not mistake standard Base64 for the URL-safe alphabet', () => {
        const { base64ToBytes: decode, bytesToBase64: encode } = codec();
        const source = new Uint8Array(300);
        for (let i = 0; i < source.length; i++) {
          source[i] = (i * 251) % 256;
        }
        const encoded = encode(source);
        expect(encoded).toMatch(/[+/]/); // the vector really does exercise both
        expect(decode(encoded)).toEqual(source);
      });

      // --- UTF-8 text ----------------------------------------------------
      it('round-trips non-ASCII text', () => {
        const { encodeTextToBase64: enc, decodeBase64ToText: dec } = codec();
        for (const value of ['héllo wörld', '日本語テキスト', 'emoji ✅🚀', '']) {
          expect(dec(enc(value))).toBe(value);
        }
      });

      it('decodes text straight from a data URI', () => {
        const { decodeBase64ToText: dec } = codec();
        expect(dec('data:text/plain;base64,Zm9vYmFy')).toBe('foobar');
      });

      // --- Type sniffing from the head only -------------------------------
      it('identifies a payload from its first characters without decoding it', () => {
        const { bytesToBase64: encode, sniffBase64Mime: sniff } = codec();
        const pdf = new Uint8Array(4096);
        pdf.set([0x25, 0x50, 0x44, 0x46]); // %PDF
        expect(sniff(encode(pdf))).toBe('application/pdf');

        const png = new Uint8Array(4096);
        png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        expect(sniff(encode(png))).toBe('image/png');
      });

      it('reports invalid input as empty', () => {
        const { sniffBase64Mime: sniff } = codec();
        expect(sniff('!!!!not base64!!!!')).toBe('');
        expect(sniff('')).toBe('');
      });

      it('does not report short-but-valid input as invalid', () => {
        const { sniffBase64Mime: sniff } = codec();
        // Three characters is a legal final chunk; it must not read as broken.
        expect(sniff('Zm8')).not.toBe('');
      });

      // --- Text payloads --------------------------------------------------
      it('recognises text payloads instead of calling them binary', () => {
        const { bytesToBase64: encode, sniffBase64Mime: sniff } = codec();
        expect(sniff(encode(utf8('{"a":1,"b":[2,3]}')))).toBe('application/json');
        expect(sniff(encode(utf8('  [1, 2, 3]')))).toBe('application/json');
        expect(sniff(encode(utf8('<?xml version="1.0"?><root/>')))).toBe('application/xml');
        expect(sniff(encode(utf8('<svg xmlns="http://www.w3.org/2000/svg"></svg>')))).toBe(
          'image/svg+xml',
        );
        expect(sniff(encode(utf8('<!DOCTYPE html><html></html>')))).toBe('text/html');
        expect(sniff(encode(utf8('just some notes\nover two lines')))).toBe('text/plain');
      });

      it('still calls genuinely binary data binary', () => {
        const { bytesToBase64: encode, sniffBase64Mime: sniff } = codec();
        const binary = new Uint8Array(512);
        for (let i = 0; i < binary.length; i++) {
          binary[i] = (i * 7 + 3) % 256; // includes NUL and other control bytes
        }
        expect(sniff(encode(binary))).toBe('application/octet-stream');
      });
    });
  }

  // --- Pure helpers, implementation independent ---------------------------
  describe('text sniffing', () => {
    it('does not misread a multi-byte character split at the sample boundary', () => {
      // Runs past the 2048-byte sample so the last character inside the window
      // is chopped in half; streaming decode must hold it back, not fail.
      expect(sniffMime(utf8('あ'.repeat(2000)))).toBe('text/plain');
    });

    it('treats an empty payload as binary rather than text', () => {
      expect(sniffMime(new Uint8Array(0))).toBe('application/octet-stream');
    });

    it('rejects invalid UTF-8', () => {
      // 0xC3 starts a two-byte sequence; 0x28 cannot continue it.
      expect(sniffMime(bytes(0xc3, 0x28, 0x41, 0x42))).toBe('application/octet-stream');
    });

    it('allows tab, newline and carriage return in text', () => {
      expect(sniffMime(utf8('a\tb\r\nc'))).toBe('text/plain');
    });

    it('rejects text containing a NUL or other control byte', () => {
      expect(sniffMime(bytes(0x61, 0x00, 0x62))).toBe('application/octet-stream');
      expect(sniffMime(bytes(0x61, 0x07, 0x62))).toBe('application/octet-stream');
    });

    it('lets magic bytes win over the text sniff', () => {
      // "%PDF" is also perfectly good ASCII.
      expect(sniffMime(utf8('%PDF-1.7\nbody'))).toBe('application/pdf');
    });
  });

  describe('splitDataUri', () => {
    it('splits a data URI into its type and payload', () => {
      expect(splitDataUri('data:image/png;base64,AAAA')).toEqual({
        mime: 'image/png',
        data: 'AAAA',
      });
    });

    it('leaves a bare payload alone', () => {
      expect(splitDataUri('AAAA')).toEqual({ mime: '', data: 'AAAA' });
    });

    it('skips leading whitespace without copying the whole string', () => {
      expect(splitDataUri('\n  data:application/pdf;base64,JVBE')).toEqual({
        mime: 'application/pdf',
        data: 'JVBE',
      });
    });

    it('treats a payload that merely starts with "data:" as payload', () => {
      // No ";base64," marker anywhere near the front.
      const payload = 'data:' + 'A'.repeat(500);
      expect(splitDataUri(payload)).toEqual({ mime: '', data: payload });
    });

    it('handles a data URI with no declared type', () => {
      expect(splitDataUri('data:;base64,AAAA')).toEqual({ mime: '', data: 'AAAA' });
    });
  });

  describe('decodedByteLength', () => {
    it('matches the real decoded size', () => {
      for (const value of ['', 'Zg==', 'Zm8=', 'Zm9v', 'Zm9vYg==', 'Zm9vYmE=', 'Zm9vYmFy']) {
        expect(decodedByteLength(value), value).toBe(base64ToBytes(value).length);
      }
    });
  });

  describe('sniffMime', () => {
    it('recognises the formats the preview can render', () => {
      expect(sniffMime(bytes(0x25, 0x50, 0x44, 0x46))).toBe('application/pdf');
      expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
      expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
      expect(sniffMime(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe('image/gif');
      expect(sniffMime(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe(
        'image/webp',
      );
    });

    it('falls back to a generic type, and never reads past the end', () => {
      expect(sniffMime(bytes())).toBe('application/octet-stream');
      // Too short to carry a signature, and not decodable as text either.
      expect(sniffMime(bytes(0x89, 0x50))).toBe('application/octet-stream');
    });

    it('does not claim a truncated signature is that format', () => {
      // "%P" is the start of "%PDF" but also perfectly good text, so it must
      // read as text — never as a PDF.
      expect(sniffMime(bytes(0x25, 0x50))).toBe('text/plain');
      expect(sniffMime(bytes(0xff, 0xd8))).toBe('application/octet-stream');
    });
  });

  describe('labels', () => {
    it('maps types to preview kinds', () => {
      expect(previewKind('application/pdf')).toBe('pdf');
      expect(previewKind('image/png')).toBe('image');
      expect(previewKind('application/json')).toBe('text');
      expect(previewKind('application/xml')).toBe('text');
      expect(previewKind('text/html')).toBe('text');
      expect(previewKind('text/plain')).toBe('text');
      // An SVG is shown as source rather than drawn.
      expect(previewKind('image/svg+xml')).toBe('text');
      expect(previewKind('application/octet-stream')).toBe('other');
    });

    it('maps types to file extensions', () => {
      expect(extForMime('application/pdf')).toBe('pdf');
      expect(extForMime('image/jpeg')).toBe('jpg');
      expect(extForMime('application/json')).toBe('json');
      expect(extForMime('text/plain')).toBe('txt');
      expect(extForMime('text/html')).toBe('html');
      expect(extForMime('application/octet-stream')).toBe('bin');
    });

    it('produces short human labels', () => {
      expect(labelForMime('application/pdf')).toBe('PDF');
      expect(labelForMime('image/png')).toBe('PNG');
      expect(labelForMime('application/json')).toBe('JSON');
      expect(labelForMime('text/plain')).toBe('Text');
      expect(labelForMime('application/octet-stream')).toBe('Binary');
    });

    it('formats byte counts', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    });
  });
});
