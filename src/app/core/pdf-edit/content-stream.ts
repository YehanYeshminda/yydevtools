/**
 * Reading and rewriting a page's content stream — the actual instructions that
 * draw the page, rather than a picture of the result.
 *
 * Everything else on this site that "edits" a PDF adds to it: a signature on
 * top, a black box over a word, a fresh page built from a raster. This reads
 * what is already there so a word in the document can be changed into another
 * word and stay a word.
 *
 * The parse is deliberately shallow. Every operation records the byte range it
 * occupies in the original stream, and an edit is a splice of those bytes — so
 * everything nobody touched comes back out byte for byte, including the parts
 * this file does not understand. Re-emitting a whole stream from a parsed model
 * is how a PDF editor quietly corrupts shading dictionaries and inline images
 * it parsed slightly wrong.
 *
 * Operands are decoded only as far as the text machinery needs: numbers, names,
 * strings and arrays of those. A dictionary operand is recognised and skipped
 * whole, because nothing here reads one.
 */

/** A decoded operand. `other` covers dictionaries, booleans and null. */
export type Operand =
  | { kind: 'num'; value: number }
  | { kind: 'name'; value: string }
  | { kind: 'string'; bytes: Uint8Array }
  | { kind: 'array'; items: Operand[] }
  | { kind: 'other' };

/** One operator with its operands, and where it sits in the source bytes. */
export interface ContentOp {
  op: string;
  operands: Operand[];
  /** Offset of the first operand (or the operator, when it takes none). */
  start: number;
  /** Offset just past the operator. */
  end: number;
}

const enum Byte {
  Nul = 0x00,
  Tab = 0x09,
  LF = 0x0a,
  FF = 0x0c,
  CR = 0x0d,
  Space = 0x20,
  Percent = 0x25,
  ParenOpen = 0x28,
  ParenClose = 0x29,
  Plus = 0x2b,
  Minus = 0x2d,
  Dot = 0x2e,
  Slash = 0x2f,
  Zero = 0x30,
  Nine = 0x39,
  Less = 0x3c,
  Greater = 0x3e,
  BracketOpen = 0x5b,
  BracketClose = 0x5d,
  Backslash = 0x5c,
  BraceOpen = 0x7b,
  BraceClose = 0x7d,
}

function isSpace(byte: number): boolean {
  return (
    byte === Byte.Space ||
    byte === Byte.LF ||
    byte === Byte.CR ||
    byte === Byte.Tab ||
    byte === Byte.FF ||
    byte === Byte.Nul
  );
}

/**
 * Delimiters end a token without being part of it, per the PDF spec's
 * character classes. `)` and `>` are in the list so a malformed stream ends a
 * token rather than swallowing the rest of the page.
 */
function isDelimiter(byte: number): boolean {
  return (
    byte === Byte.ParenOpen ||
    byte === Byte.ParenClose ||
    byte === Byte.Less ||
    byte === Byte.Greater ||
    byte === Byte.BracketOpen ||
    byte === Byte.BracketClose ||
    byte === Byte.BraceOpen ||
    byte === Byte.BraceClose ||
    byte === Byte.Slash ||
    byte === Byte.Percent
  );
}

function isRegular(byte: number): boolean {
  return !isSpace(byte) && !isDelimiter(byte);
}

function hexValue(byte: number): number {
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x41 + 10;
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x61 + 10;
  return -1;
}

/**
 * Walks a content stream and hands back every operator in order.
 *
 * The scanner is a small state machine rather than a grammar because a content
 * stream has no nesting to speak of: operands accumulate until an operator
 * closes them. The one exception it must get right is the inline image, whose
 * bytes between `ID` and `EI` are raw image data that will happily contain
 * anything that looks like an operator.
 */
export function parseContentStream(bytes: Uint8Array): ContentOp[] {
  const ops: ContentOp[] = [];
  let operands: Operand[] = [];
  let operandStart = -1;
  let at = 0;

  const push = (operand: Operand, from: number): void => {
    if (operandStart < 0) operandStart = from;
    // Operands never run away in valid content; a cap keeps a malformed stream
    // from growing an array until the tab dies.
    if (operands.length < 64) operands.push(operand);
  };

  while (at < bytes.length) {
    const byte = bytes[at];

    if (isSpace(byte)) {
      at++;
      continue;
    }

    if (byte === Byte.Percent) {
      while (at < bytes.length && bytes[at] !== Byte.LF && bytes[at] !== Byte.CR) at++;
      continue;
    }

    if (byte === Byte.ParenOpen) {
      const from = at;
      at = skipLiteralString(bytes, at);
      push({ kind: 'string', bytes: decodeLiteralString(bytes.subarray(from + 1, at - 1)) }, from);
      continue;
    }

    if (byte === Byte.Less) {
      const from = at;
      if (bytes[at + 1] === Byte.Less) {
        at = skipDictionary(bytes, at);
        push({ kind: 'other' }, from);
      } else {
        at = skipHexString(bytes, at);
        push({ kind: 'string', bytes: decodeHexString(bytes.subarray(from + 1, at - 1)) }, from);
      }
      continue;
    }

    if (byte === Byte.Slash) {
      const from = at;
      at++;
      while (at < bytes.length && isRegular(bytes[at])) at++;
      push({ kind: 'name', value: decodeName(bytes.subarray(from + 1, at)) }, from);
      continue;
    }

    if (byte === Byte.BracketOpen) {
      const from = at;
      const items: Operand[] = [];
      at++;
      at = readArray(bytes, at, items);
      push({ kind: 'array', items }, from);
      continue;
    }

    if (byte === Byte.BracketClose || byte === Byte.Greater || byte === Byte.ParenClose) {
      // Unbalanced closer in a stream that does not quite follow the spec.
      at++;
      continue;
    }

    if (isNumberStart(bytes, at)) {
      const from = at;
      at = skipNumber(bytes, at);
      push({ kind: 'num', value: readNumber(bytes, from, at) }, from);
      continue;
    }

    // Anything else regular is a keyword: an operator, or true/false/null.
    const from = at;
    while (at < bytes.length && isRegular(bytes[at])) at++;
    if (at === from) {
      at++;
      continue;
    }
    const word = latin1(bytes.subarray(from, at));

    if (word === 'true' || word === 'false' || word === 'null') {
      push({ kind: 'other' }, from);
      continue;
    }

    if (word === 'BI') {
      // Everything through the matching EI is one opaque operation: the image
      // data in the middle is not content-stream syntax at all.
      at = skipInlineImage(bytes, at);
      ops.push({ op: 'BI', operands: [], start: operandStart < 0 ? from : operandStart, end: at });
      operands = [];
      operandStart = -1;
      continue;
    }

    ops.push({ op: word, operands, start: operandStart < 0 ? from : operandStart, end: at });
    operands = [];
    operandStart = -1;
  }

  return ops;
}

function isNumberStart(bytes: Uint8Array, at: number): boolean {
  const byte = bytes[at];
  if (byte >= Byte.Zero && byte <= Byte.Nine) return true;
  if (byte === Byte.Dot || byte === Byte.Plus || byte === Byte.Minus) {
    const next = bytes[at + 1];
    return (
      (next >= Byte.Zero && next <= Byte.Nine) ||
      next === Byte.Dot ||
      // A lone "-" or "-." appears in the wild; treat it as the number zero
      // rather than as an operator named "-".
      next === undefined ||
      isSpace(next) ||
      isDelimiter(next)
    );
  }
  return false;
}

function skipNumber(bytes: Uint8Array, at: number): number {
  let cursor = at;
  // Regular characters, so "4.5e2" or a stray "--3" is consumed whole rather
  // than leaving a fragment that parses as an operator.
  while (cursor < bytes.length && isRegular(bytes[cursor])) cursor++;
  return cursor;
}

function readNumber(bytes: Uint8Array, from: number, to: number): number {
  const value = Number.parseFloat(latin1(bytes.subarray(from, to)));
  return Number.isFinite(value) ? value : 0;
}

/** Past the closing `)`, honouring escapes and nested parentheses. */
function skipLiteralString(bytes: Uint8Array, at: number): number {
  let cursor = at + 1;
  let depth = 1;
  while (cursor < bytes.length) {
    const byte = bytes[cursor];
    if (byte === Byte.Backslash) {
      cursor += 2;
      continue;
    }
    if (byte === Byte.ParenOpen) depth++;
    if (byte === Byte.ParenClose && --depth === 0) return cursor + 1;
    cursor++;
  }
  return cursor;
}

function skipHexString(bytes: Uint8Array, at: number): number {
  let cursor = at + 1;
  while (cursor < bytes.length && bytes[cursor] !== Byte.Greater) cursor++;
  return Math.min(cursor + 1, bytes.length);
}

function skipDictionary(bytes: Uint8Array, at: number): number {
  let cursor = at + 2;
  let depth = 1;
  while (cursor < bytes.length && depth > 0) {
    const byte = bytes[cursor];
    if (byte === Byte.Less && bytes[cursor + 1] === Byte.Less) {
      depth++;
      cursor += 2;
      continue;
    }
    if (byte === Byte.Greater && bytes[cursor + 1] === Byte.Greater) {
      depth--;
      cursor += 2;
      continue;
    }
    if (byte === Byte.ParenOpen) {
      cursor = skipLiteralString(bytes, cursor);
      continue;
    }
    cursor++;
  }
  return cursor;
}

/** Fills `items` and returns the offset past the closing `]`. */
function readArray(bytes: Uint8Array, at: number, items: Operand[]): number {
  let cursor = at;
  while (cursor < bytes.length) {
    const byte = bytes[cursor];
    if (isSpace(byte)) {
      cursor++;
      continue;
    }
    if (byte === Byte.BracketClose) return cursor + 1;
    if (byte === Byte.ParenOpen) {
      const from = cursor;
      cursor = skipLiteralString(bytes, cursor);
      items.push({
        kind: 'string',
        bytes: decodeLiteralString(bytes.subarray(from + 1, cursor - 1)),
      });
      continue;
    }
    if (byte === Byte.Less && bytes[cursor + 1] !== Byte.Less) {
      const from = cursor;
      cursor = skipHexString(bytes, cursor);
      items.push({ kind: 'string', bytes: decodeHexString(bytes.subarray(from + 1, cursor - 1)) });
      continue;
    }
    if (isNumberStart(bytes, cursor)) {
      const from = cursor;
      cursor = skipNumber(bytes, cursor);
      items.push({ kind: 'num', value: readNumber(bytes, from, cursor) });
      continue;
    }
    if (byte === Byte.BracketOpen) {
      const nested: Operand[] = [];
      cursor = readArray(bytes, cursor + 1, nested);
      items.push({ kind: 'array', items: nested });
      continue;
    }
    if (byte === Byte.Slash) {
      const from = cursor;
      cursor++;
      while (cursor < bytes.length && isRegular(bytes[cursor])) cursor++;
      items.push({ kind: 'name', value: decodeName(bytes.subarray(from + 1, cursor)) });
      continue;
    }
    // Anything else: consume one token so a malformed array still terminates.
    if (isRegular(byte)) {
      while (cursor < bytes.length && isRegular(bytes[cursor])) cursor++;
      items.push({ kind: 'other' });
      continue;
    }
    cursor++;
  }
  return cursor;
}

/**
 * Past the `EI` that ends an inline image.
 *
 * The data between `ID` and `EI` is not tokenisable, so the end is found by
 * looking for `EI` surrounded by whitespace — the same heuristic pdf.js uses,
 * for the same reason: the length is not declared anywhere.
 */
function skipInlineImage(bytes: Uint8Array, at: number): number {
  let cursor = at;
  while (cursor < bytes.length - 1) {
    if (bytes[cursor] === 0x49 && bytes[cursor + 1] === 0x44) {
      // "ID" — one whitespace byte follows, then the data.
      cursor += 3;
      break;
    }
    if (bytes[cursor] === Byte.ParenOpen) {
      cursor = skipLiteralString(bytes, cursor);
      continue;
    }
    cursor++;
  }
  while (cursor < bytes.length - 1) {
    if (
      bytes[cursor] === 0x45 &&
      bytes[cursor + 1] === 0x49 &&
      isSpace(bytes[cursor - 1]) &&
      (cursor + 2 >= bytes.length || isSpace(bytes[cursor + 2]) || isDelimiter(bytes[cursor + 2]))
    ) {
      return cursor + 2;
    }
    cursor++;
  }
  return bytes.length;
}

// --- Values in and out ---------------------------------------------------

/** Bytes as characters, one for one. Content streams are not UTF-8. */
export function latin1(bytes: Uint8Array): string {
  let out = '';
  // Chunked, because spreading a long page into String.fromCharCode overflows
  // the argument limit.
  for (let at = 0; at < bytes.length; at += 4096) {
    out += String.fromCharCode(...bytes.subarray(at, at + 4096));
  }
  return out;
}

function decodeName(bytes: Uint8Array): string {
  let out = '';
  for (let at = 0; at < bytes.length; at++) {
    if (bytes[at] === 0x23 && at + 2 < bytes.length) {
      const high = hexValue(bytes[at + 1]);
      const low = hexValue(bytes[at + 2]);
      if (high >= 0 && low >= 0) {
        out += String.fromCharCode(high * 16 + low);
        at += 2;
        continue;
      }
    }
    out += String.fromCharCode(bytes[at]);
  }
  return out;
}

function decodeHexString(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let high = -1;
  for (const byte of bytes) {
    const value = hexValue(byte);
    if (value < 0) continue;
    if (high < 0) {
      high = value;
    } else {
      out.push(high * 16 + value);
      high = -1;
    }
  }
  // An odd number of digits means the last one is padded with zero.
  if (high >= 0) out.push(high * 16);
  return Uint8Array.from(out);
}

const ESCAPES: Record<number, number> = {
  0x6e: 0x0a, // n
  0x72: 0x0d, // r
  0x74: 0x09, // t
  0x62: 0x08, // b
  0x66: 0x0c, // f
};

function decodeLiteralString(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let at = 0; at < bytes.length; at++) {
    const byte = bytes[at];
    if (byte !== Byte.Backslash) {
      out.push(byte);
      continue;
    }
    const next = bytes[++at];
    if (next === undefined) break;
    if (next >= Byte.Zero && next <= 0x37) {
      let code = next - Byte.Zero;
      for (let digit = 0; digit < 2; digit++) {
        const following = bytes[at + 1];
        if (following === undefined || following < Byte.Zero || following > 0x37) break;
        code = code * 8 + (following - Byte.Zero);
        at++;
      }
      out.push(code & 0xff);
      continue;
    }
    if (next === Byte.LF) continue; // Line continuation.
    if (next === Byte.CR) {
      if (bytes[at + 1] === Byte.LF) at++;
      continue;
    }
    out.push(ESCAPES[next] ?? next);
  }
  return Uint8Array.from(out);
}

/** A string operand written back out, always in hex so no byte needs escaping. */
export function toHexString(bytes: Uint8Array): string {
  let out = '<';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out + '>';
}

/**
 * The stream with each range replaced by its new text.
 *
 * Splices are applied from the end so earlier offsets stay valid, and they may
 * not overlap — an overlap means two edits claimed the same operator, which is
 * a bug in the caller rather than something to resolve here.
 */
export function spliceStream(
  bytes: Uint8Array,
  edits: Array<{ start: number; end: number; text: string }>,
): Uint8Array {
  const ordered = [...edits].sort((a, b) => a.start - b.start);
  for (let at = 1; at < ordered.length; at++) {
    if (ordered[at].start < ordered[at - 1].end) {
      throw new Error('Two edits cover the same part of the page.');
    }
  }
  const pieces: Uint8Array[] = [];
  let cursor = 0;
  for (const edit of ordered) {
    pieces.push(bytes.subarray(cursor, edit.start));
    pieces.push(Uint8Array.from(edit.text, (char) => char.charCodeAt(0) & 0xff));
    cursor = edit.end;
  }
  pieces.push(bytes.subarray(cursor));

  const total = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const piece of pieces) {
    out.set(piece, offset);
    offset += piece.length;
  }
  return out;
}
