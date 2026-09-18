/**
 * What a page's fonts can say, and how wide they say it.
 *
 * Editing text inside a PDF needs three things from every font the page uses:
 * how to turn the bytes of a show-string into characters, how wide each of
 * those characters is (so the caller knows where the text sits and how far it
 * runs), and how to turn new characters back into bytes that same font
 * understands.
 *
 * The third one is where PDFs bite. Almost every font in a modern document is a
 * *subset*: the file embedded in the PDF contains only the glyphs the document
 * actually uses. A document that never says "x" has no "x" to draw, and asking
 * for one gets a blank — so `encode` answers null rather than writing something
 * that renders as nothing, and the caller decides what to do about it.
 */
import { Encodings, Font as StandardFontMetrics } from '@pdf-lib/standard-fonts';
import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFStream,
  decodePDFRawStream,
} from '@cantoo/pdf-lib';

import { latin1, parseContentStream } from './content-stream';

/** Widths in PDF text space: a thousandth of the font size. */
const EM = 1000;

export interface EditableFont {
  /** The resource name it is reached by, e.g. `F6`. */
  readonly resource: string;
  /** `/BaseFont` with any subset prefix removed, for showing to a reader. */
  readonly family: string;
  /** Codes are two bytes wide in a composite font, one in a simple one. */
  readonly twoByte: boolean;
  /** Glyph codes in a show-string. */
  decode(bytes: Uint8Array): number[];
  /** What those codes say. */
  textOf(codes: readonly number[]): string;
  /** A code's advance, in thousandths of the font size. */
  widthOf(code: number): number;
  /** Bytes this font would need to say `text`, or null if it cannot say it. */
  encode(text: string): Uint8Array | null;
  /** Which characters of `text` this font has no glyph for. */
  missing(text: string): string[];
  /** Whether a code is the single-byte space that `Tw` applies to. */
  isWordSpace(code: number): boolean;
}

/** Every font in a page's resources, by the name the content stream uses. */
export function readPageFonts(resources: PDFDict | undefined): Map<string, EditableFont> {
  const fonts = new Map<string, EditableFont>();
  const dict = resources?.lookupMaybe(PDFName.of('Font'), PDFDict);
  if (!dict) return fonts;
  for (const [key, value] of dict.entries()) {
    const font = dict.context.lookupMaybe(value, PDFDict);
    if (!font) continue;
    const name = key.asString().slice(1);
    try {
      fonts.set(name, readFont(name, font));
    } catch {
      // One unreadable font must not cost the reader the rest of the page; the
      // runs that use it simply come back uneditable.
    }
  }
  return fonts;
}

function readFont(resource: string, dict: PDFDict): EditableFont {
  const subtype = dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString();
  const base = dict.lookupMaybe(PDFName.of('BaseFont'), PDFName)?.asString().slice(1) ?? '';
  // "AAAAAA+Georgia" — six letters and a plus is the subset tag.
  const family = /^[A-Z]{6}\+/.test(base) ? base.slice(7) : base;
  const toUnicode = readToUnicode(dict);

  return subtype === '/Type0'
    ? compositeFont(resource, family, dict, toUnicode)
    : simpleFont(resource, family, base, dict, toUnicode);
}

// --- Composite (Type0) fonts ---------------------------------------------

/**
 * A Type0 font: two bytes per glyph, widths held by the descendant.
 *
 * Only Identity encodings are treated as editable. A Type0 font with a named
 * CMap (`/GBK-EUC-H` and friends) maps bytes through a table this does not
 * carry, and guessing at it would put the wrong glyph on the page — so those
 * decode for display and refuse to encode.
 */
function compositeFont(
  resource: string,
  family: string,
  dict: PDFDict,
  toUnicode: Map<number, string> | null,
): EditableFont {
  const encoding = dict.lookupMaybe(PDFName.of('Encoding'), PDFName)?.asString() ?? '';
  const identity = encoding === '/Identity-H' || encoding === '/Identity-V';
  const descendants = dict.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray);
  const descendant = descendants?.lookupMaybe(0, PDFDict) ?? null;
  const widths = descendant ? readCidWidths(descendant) : new Map<number, number>();
  const defaultWidth = descendant?.lookupMaybe(PDFName.of('DW'), PDFNumber)?.asNumber() ?? EM;
  const reverse = identity && toUnicode ? invert(toUnicode) : null;

  return {
    resource,
    family,
    twoByte: true,
    decode(bytes) {
      const codes: number[] = [];
      for (let at = 0; at + 1 < bytes.length; at += 2) codes.push((bytes[at] << 8) | bytes[at + 1]);
      return codes;
    },
    textOf(codes) {
      let out = '';
      for (const code of codes) out += toUnicode?.get(code) ?? '';
      return out;
    },
    widthOf(code) {
      return widths.get(code) ?? defaultWidth;
    },
    encode(text) {
      if (!reverse) return null;
      const out = new Uint8Array(text.length * 2);
      let at = 0;
      for (const char of text) {
        const code = reverse.get(char);
        if (code === undefined) return null;
        out[at++] = code >> 8;
        out[at++] = code & 0xff;
      }
      return out.subarray(0, at);
    },
    missing(text) {
      if (!reverse) return [...new Set(text)];
      return [...new Set([...text].filter((char) => !reverse.has(char)))];
    },
    isWordSpace() {
      // Word spacing applies to single-byte code 32 only, which a two-byte
      // font never produces.
      return false;
    },
  };
}

/**
 * The descendant's `/W` array, which mixes two shapes:
 * `c [w1 w2 …]` gives consecutive codes their own widths, and `cFirst cLast w`
 * gives a whole range one width.
 */
function readCidWidths(descendant: PDFDict): Map<number, number> {
  const widths = new Map<number, number>();
  const array = descendant.lookupMaybe(PDFName.of('W'), PDFArray);
  if (!array) return widths;
  // `lookup` rather than `lookupMaybe`, because the array mixes numbers and
  // arrays on purpose and `lookupMaybe` throws on the type it did not want
  // rather than answering "not that".
  const size = array.size();
  let at = 0;
  while (at < size) {
    const first = array.lookup(at);
    if (!(first instanceof PDFNumber)) break;
    const next = array.lookup(at + 1);
    if (next instanceof PDFArray) {
      const start = first.asNumber();
      for (let offset = 0; offset < next.size(); offset++) {
        const width = next.lookup(offset);
        if (width instanceof PDFNumber) widths.set(start + offset, width.asNumber());
      }
      at += 2;
      continue;
    }
    const width = array.lookup(at + 2);
    if (!(next instanceof PDFNumber) || !(width instanceof PDFNumber)) break;
    const from = first.asNumber();
    const to = next.asNumber();
    // A corrupt range must not spin: real CID ranges are small.
    if (to - from > 0xffff) break;
    for (let code = from; code <= to; code++) widths.set(code, width.asNumber());
    at += 3;
  }
  return widths;
}

// --- Simple fonts ---------------------------------------------------------

/**
 * A one-byte font: Type1, TrueType or Type3.
 *
 * Widths come from `/Widths` when it is there, and from the Standard 14
 * metrics when it is not — a plain `/Helvetica` with no `/Widths` is legal and
 * common, and without the AFM numbers every position on such a page would be
 * wrong.
 */
function simpleFont(
  resource: string,
  family: string,
  base: string,
  dict: PDFDict,
  toUnicode: Map<number, string> | null,
): EditableFont {
  const firstChar = dict.lookupMaybe(PDFName.of('FirstChar'), PDFNumber)?.asNumber() ?? 0;
  const widthArray = dict.lookupMaybe(PDFName.of('Widths'), PDFArray);
  const widths = new Map<number, number>();
  if (widthArray) {
    for (let offset = 0; offset < widthArray.size(); offset++) {
      const width = widthArray.lookup(offset);
      if (width instanceof PDFNumber) widths.set(firstChar + offset, width.asNumber());
    }
  }
  const descriptor = dict.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
  const missingWidth = descriptor?.lookupMaybe(PDFName.of('MissingWidth'), PDFNumber)?.asNumber();

  const glyphNames = readSimpleEncoding(dict);
  const metrics = widths.size === 0 ? loadStandardMetrics(family || base) : null;
  // ToUnicode wins where it exists; the encoding fills in the rest.
  const codeToText = new Map<number, string>();
  for (const [code, name] of glyphNames) {
    const unicode = unicodeOfGlyphName(name);
    if (unicode) codeToText.set(code, unicode);
  }
  if (toUnicode) for (const [code, text] of toUnicode) codeToText.set(code, text);
  const reverse = invert(codeToText);

  return {
    resource,
    family,
    twoByte: false,
    decode(bytes) {
      return [...bytes];
    },
    textOf(codes) {
      let out = '';
      for (const code of codes) out += codeToText.get(code) ?? '';
      return out;
    },
    widthOf(code) {
      const width = widths.get(code);
      if (width !== undefined) return width;
      if (metrics) {
        const name = glyphNames.get(code);
        if (name) {
          try {
            return metrics.getWidthOfGlyph(name) || 0;
          } catch {
            return missingWidth ?? 0;
          }
        }
      }
      return missingWidth ?? 0;
    },
    encode(text) {
      const out = new Uint8Array(text.length);
      let at = 0;
      for (const char of text) {
        const code = reverse.get(char);
        if (code === undefined || code > 0xff) return null;
        out[at++] = code;
      }
      return out.subarray(0, at);
    },
    missing(text) {
      return [...new Set([...text].filter((char) => !reverse.has(char)))];
    },
    isWordSpace(code) {
      return code === 32;
    },
  };
}

/** Code to glyph name, from the base encoding and any `/Differences`. */
function readSimpleEncoding(dict: PDFDict): Map<number, string> {
  const names = new Map<number, string>();
  const encoding = dict.lookup(PDFName.of('Encoding'));
  // WinAnsi stands in for every base encoding. The three Latin ones agree
  // across ASCII, which is where all but a handful of characters live, and
  // `/Differences` overrides whatever a producer actually meant above it.
  for (const [code, glyph] of winAnsiByCode()) {
    if (!names.has(code)) names.set(code, glyph);
  }

  if (encoding instanceof PDFDict) {
    const differences = encoding.lookupMaybe(PDFName.of('Differences'), PDFArray);
    if (differences) {
      let code = 0;
      for (let at = 0; at < differences.size(); at++) {
        const value = differences.lookup(at);
        if (value instanceof PDFNumber) {
          code = value.asNumber();
        } else if (value instanceof PDFName) {
          names.set(code++, value.asString().slice(1));
        }
      }
    }
  }
  return names;
}

/** Unicode for a glyph name, covering the conventions that appear in the wild. */
function unicodeOfGlyphName(name: string): string | null {
  const known = GLYPH_UNICODE.get(name);
  if (known) return known;
  const uni = /^uni([0-9A-Fa-f]{4})$/.exec(name);
  if (uni) return String.fromCodePoint(Number.parseInt(uni[1], 16));
  const u = /^u([0-9A-Fa-f]{4,6})$/.exec(name);
  if (u) return String.fromCodePoint(Number.parseInt(u[1], 16));
  return null;
}

/** WinAnsi as code-to-glyph-name, built once through the public encoding API. */
function winAnsiByCode(): Map<number, string> {
  WIN_ANSI ??= new Map(
    Encodings.WinAnsi.supportedCodePoints.map((point) => {
      const { code, name } = Encodings.WinAnsi.encodeUnicodeCodePoint(point);
      return [code, name] as const;
    }),
  );
  return WIN_ANSI;
}
let WIN_ANSI: Map<number, string> | null = null;

/** Glyph name to character, inverted from the encoding tables once. */
const GLYPH_UNICODE: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const table of [Encodings.WinAnsi, Encodings.Symbol, Encodings.ZapfDingbats]) {
    for (const point of table.supportedCodePoints) {
      const { name } = table.encodeUnicodeCodePoint(point);
      if (!map.has(name)) map.set(name, String.fromCodePoint(point));
    }
  }
  return map;
})();

/**
 * The Standard 14 face that best stands in for a font, matched by its name.
 *
 * Used twice: for the metrics of a `/Helvetica` that shipped no `/Widths`, and
 * for re-setting a line whose own font turns out to have no glyph for what the
 * reader typed. Arial to Helvetica is all but exact; Georgia to Times is a
 * substitution the reader can see, which is why they are told about it.
 */
export function standardFaceFor(name: string): string {
  const cleaned = name.replace(/[^A-Za-z]/g, '').toLowerCase();
  const bold = cleaned.includes('bold') || cleaned.includes('black') || cleaned.includes('heavy');
  const italic = cleaned.includes('italic') || cleaned.includes('oblique');
  if (cleaned.includes('symbol')) return 'Symbol';
  if (cleaned.includes('zapf') || cleaned.includes('dingbat')) return 'ZapfDingbats';
  if (cleaned.includes('courier') || cleaned.includes('mono')) {
    return (
      'Courier' + (bold && italic ? '-BoldOblique' : bold ? '-Bold' : italic ? '-Oblique' : '')
    );
  }
  if (cleaned.includes('times') || cleaned.includes('serif') || cleaned.includes('georgia')) {
    return (
      'Times' + (bold && italic ? '-BoldItalic' : bold ? '-Bold' : italic ? '-Italic' : '-Roman')
    );
  }
  return (
    'Helvetica' + (bold && italic ? '-BoldOblique' : bold ? '-Bold' : italic ? '-Oblique' : '')
  );
}

/** The characters of `text` the Standard 14 encoding has no place for. */
export function notInStandardFonts(text: string): string[] {
  return [
    ...new Set(
      [...text].filter(
        (char) => !Encodings.WinAnsi.canEncodeUnicodeCodePoint(char.codePointAt(0) ?? -1),
      ),
    ),
  ];
}

/** AFM metrics for one of the Standard 14, matched loosely by name. */
function loadStandardMetrics(name: string): ReturnType<typeof StandardFontMetrics.load> | null {
  try {
    return StandardFontMetrics.load(
      standardFaceFor(name) as Parameters<typeof StandardFontMetrics.load>[0],
    );
  } catch {
    return null;
  }
}

// --- ToUnicode ------------------------------------------------------------

/**
 * The `/ToUnicode` CMap, which is a PostScript program that only ever does two
 * things: `beginbfchar` lists code-to-text pairs, and `beginbfrange` gives a
 * run of codes either consecutive text or a list of it.
 *
 * It is tokenised with the content-stream parser rather than a second one —
 * the syntax is the same, and `endbfchar` and friends are just operators with
 * their operands sitting in front of them.
 */
function readToUnicode(dict: PDFDict): Map<number, string> | null {
  const stream = dict.lookup(PDFName.of('ToUnicode'));
  if (!(stream instanceof PDFStream)) return null;
  let bytes: Uint8Array;
  try {
    bytes =
      stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents();
  } catch {
    return null;
  }

  const map = new Map<number, string>();
  const ops = parseContentStream(bytes);
  for (const op of ops) {
    if (op.op === 'endbfchar') {
      for (let at = 0; at + 1 < op.operands.length; at += 2) {
        const from = op.operands[at];
        const to = op.operands[at + 1];
        if (from.kind !== 'string' || to.kind !== 'string') continue;
        map.set(codeOf(from.bytes), utf16(to.bytes));
      }
      continue;
    }
    if (op.op !== 'endbfrange') continue;
    for (let at = 0; at + 2 < op.operands.length; at += 3) {
      const low = op.operands[at];
      const high = op.operands[at + 1];
      const value = op.operands[at + 2];
      if (low.kind !== 'string' || high.kind !== 'string') continue;
      const from = codeOf(low.bytes);
      const to = codeOf(high.bytes);
      if (to < from || to - from > 0xffff) continue;
      if (value.kind === 'string') {
        // Consecutive codes get consecutive characters from the start value.
        const start = utf16(value.bytes);
        const head = start.slice(0, start.length - 1);
        const tail = start.codePointAt(start.length - 1) ?? 0;
        for (let code = from; code <= to; code++) {
          map.set(code, head + String.fromCodePoint(tail + (code - from)));
        }
        continue;
      }
      if (value.kind === 'array') {
        value.items.forEach((item, offset) => {
          if (item.kind === 'string' && from + offset <= to) {
            map.set(from + offset, utf16(item.bytes));
          }
        });
      }
    }
  }
  return map.size > 0 ? map : null;
}

/** A CMap code, which is one or two bytes big-endian. */
function codeOf(bytes: Uint8Array): number {
  let code = 0;
  for (const byte of bytes) code = (code << 8) | byte;
  return code;
}

/** CMap destination text: UTF-16BE, and sometimes several characters. */
function utf16(bytes: Uint8Array): string {
  let out = '';
  for (let at = 0; at + 1 < bytes.length; at += 2) {
    out += String.fromCharCode((bytes[at] << 8) | bytes[at + 1]);
  }
  if (bytes.length === 1) out += String.fromCharCode(bytes[0]);
  return out;
}

/**
 * Code-to-text turned around, for writing.
 *
 * Only single-character entries can be reversed — a code that stands for "ffi"
 * cannot be asked for by typing "f". The lowest code wins when two map to the
 * same character, which keeps the choice stable between runs.
 */
function invert(map: Map<number, string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [code, text] of map) {
    if ([...text].length !== 1) continue;
    const existing = out.get(text);
    if (existing === undefined || code < existing) out.set(text, code);
  }
  return out;
}
