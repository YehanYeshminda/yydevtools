/**
 * Hex and binary dumps of decoded bytes, for reading what a payload really is
 * when the text view cannot show it — a magic number, a BOM, a stray NUL.
 *
 * Both are capped: a dump is several times larger than the bytes it shows, so
 * the whole of a big file would only freeze the page. The Decode file tab
 * exists for saving all of it.
 */

/** Bytes shown before a dump is cut off. */
export const DUMP_LIMIT = 64 * 1024;

const HEX_PER_LINE = 16;
const BITS_PER_LINE = 6;

export type ByteView = 'text' | 'hex' | 'binary';

/** xxd-style: offset, sixteen hex pairs in two groups, and the printable ASCII. */
export function hexDump(bytes: Uint8Array, limit = DUMP_LIMIT): string {
  const shown = bytes.subarray(0, limit);
  const lines: string[] = [];
  for (let start = 0; start < shown.length; start += HEX_PER_LINE) {
    const row = shown.subarray(start, start + HEX_PER_LINE);
    let hex = '';
    let ascii = '';
    for (let i = 0; i < HEX_PER_LINE; i++) {
      if (i === 8) {
        hex += ' ';
      }
      if (i < row.length) {
        const byte = row[i];
        hex += byte.toString(16).padStart(2, '0') + ' ';
        ascii += byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.';
      } else {
        hex += '   ';
      }
    }
    lines.push(`${offset(start)}  ${hex} |${ascii}|`);
  }
  return lines.join('\n');
}

/** Offset, then each byte as eight bits, six to a line so it stays readable. */
export function binaryDump(bytes: Uint8Array, limit = DUMP_LIMIT): string {
  const shown = bytes.subarray(0, limit);
  const lines: string[] = [];
  for (let start = 0; start < shown.length; start += BITS_PER_LINE) {
    const row = shown.subarray(start, start + BITS_PER_LINE);
    const bits = Array.from(row, (byte) => byte.toString(2).padStart(8, '0')).join(' ');
    lines.push(`${offset(start)}  ${bits}`);
  }
  return lines.join('\n');
}

function offset(n: number): string {
  return n.toString(16).padStart(8, '0');
}
