/**
 * Integer base conversion, on BigInt throughout.
 *
 * Number cannot be used here. A 64-bit value — a hash, a snowflake ID, a mask
 * — is exactly the kind of thing someone converts to hex, and anything above
 * 2^53 loses its low bits in a double silently, giving an answer that is the
 * right length and wrong. BigInt has no such ceiling and `toString(radix)`
 * does the arithmetic for free.
 */

/** The four bases everyone wants, in the order they are shown. */
export const BASES = [2, 8, 10, 16] as const;

export const BASE_LABELS: Record<number, string> = {
  2: 'Binary',
  8: 'Octal',
  10: 'Decimal',
  16: 'Hexadecimal',
};

/** Two's-complement widths offered for the bit view. */
export const WIDTHS = [8, 16, 32, 64] as const;
export type Width = (typeof WIDTHS)[number];

export const MIN_BASE = 2;
export const MAX_BASE = 36;

/** Prefixes that name their own base, as every C-family language writes them. */
const PREFIXES: { prefix: string; base: number }[] = [
  { prefix: '0x', base: 16 },
  { prefix: '0b', base: 2 },
  { prefix: '0o', base: 8 },
];

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

/** What a value written in `base` is allowed to contain. */
function digitsFor(base: number): Set<string> {
  return new Set(DIGITS.slice(0, base));
}

export interface Parsed {
  value: bigint;
  /** The base it was read in, which may have come from a prefix. */
  base: number;
  /** True when a 0x/0b/0o prefix chose the base rather than the selector. */
  fromPrefix: boolean;
}

/**
 * Reads a written number.
 *
 * Underscores and spaces are dropped before anything else: people paste
 * `1_000_000` and `1010 1010`, and refusing them would be pedantry. A prefix
 * wins over the selected base, because someone who typed `0xff` has said what
 * they meant more clearly than a dropdown has.
 */
export function parseValue(text: string, base: number): Parsed | null {
  const cleaned = text.trim().replace(/[_\s]/g, '').toLowerCase();
  if (!cleaned) {
    return null;
  }

  const negative = cleaned.startsWith('-');
  let body = negative ? cleaned.slice(1) : cleaned;
  let actual = base;
  let fromPrefix = false;

  for (const { prefix, base: prefixBase } of PREFIXES) {
    if (body.startsWith(prefix) && body.length > prefix.length) {
      body = body.slice(prefix.length);
      actual = prefixBase;
      fromPrefix = true;
      break;
    }
  }

  const allowed = digitsFor(actual);
  if (![...body].every((char) => allowed.has(char))) {
    return null;
  }

  let value = 0n;
  const radix = BigInt(actual);
  for (const char of body) {
    value = value * radix + BigInt(DIGITS.indexOf(char));
  }
  return { value: negative ? -value : value, base: actual, fromPrefix };
}

/** Writes a value in `base`, lower case, with the sign kept separate. */
export function toBase(value: bigint, base: number): string {
  return value.toString(base);
}

/**
 * Groups a written number for reading: binary in fours, everything else in
 * threes, counted from the right so the grouping survives an odd length.
 */
export function group(text: string, base: number): string {
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const size = base === 2 ? 4 : base === 16 ? 4 : 3;
  const parts: string[] = [];
  for (let end = body.length; end > 0; end -= size) {
    parts.unshift(body.slice(Math.max(0, end - size), end));
  }
  return (negative ? '-' : '') + parts.join(' ');
}

/** The smallest offered width that can hold `value` as two's complement. */
export function fittingWidth(value: bigint): Width | null {
  return WIDTHS.find((width) => fitsIn(value, width)) ?? null;
}

/**
 * Whether `width` bits can hold `value` under *either* reading.
 *
 * Not the signed range alone. A bit view exists to look at a pattern, and
 * 11111111 is both 255 and -1 depending on how you read it — so 0xff has to
 * be a byte here, not a byte that has overflowed into sixteen bits because
 * signed eight stops at 127.
 */
export function fitsIn(value: bigint, width: number): boolean {
  const bits = BigInt(width);
  return value >= -(2n ** (bits - 1n)) && value < 2n ** bits;
}

/**
 * The two's-complement bits of `value` at `width`, most significant first.
 *
 * Negative values are represented the way hardware does it, by adding 2^width,
 * so -1 at eight bits is 11111111 rather than a sign bit and a magnitude.
 */
export function toBits(value: bigint, width: number): boolean[] {
  const size = BigInt(width);
  const wrapped = value < 0n ? value + 2n ** size : value;
  const bits: boolean[] = [];
  for (let i = size - 1n; i >= 0n; i -= 1n) {
    bits.push(((wrapped >> i) & 1n) === 1n);
  }
  return bits;
}

/**
 * Reverses `toBits`.
 *
 * `signed` says which reading to take, because the pattern alone cannot: with
 * the top bit set, 11111111 is 255 unsigned and -1 signed. The caller keeps
 * whichever reading the value already had, so flipping a bit of 255 gives 254
 * rather than throwing it across zero.
 */
export function fromBits(bits: readonly boolean[], signed: boolean): bigint {
  let value = 0n;
  for (const bit of bits) {
    value = value * 2n + (bit ? 1n : 0n);
  }
  // A negative value sits 2^width below where the unsigned reading put it.
  return signed && bits[0] ? value - 2n ** BigInt(bits.length) : value;
}

/** Flips one bit, keeping the value on the side of zero it was already on. */
export function toggleBit(value: bigint, width: number, index: number): bigint {
  const bits = toBits(value, width);
  bits[index] = !bits[index];
  return fromBits(bits, value < 0n);
}

/** Number of set bits, which is the thing a mask is usually being checked for. */
export function popCount(value: bigint, width: number): number {
  return toBits(value, width).filter(Boolean).length;
}
