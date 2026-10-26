/**
 * Styled Unicode text: the same letters drawn from other parts of Unicode.
 *
 * Most styles come from the Mathematical Alphanumeric Symbols block
 * (U+1D400-U+1D7FF), where each alphabet is a run of 26 capitals then 26
 * small letters, and some styles have a run of ten digits. A handful of
 * letters were already encoded years earlier in the Letterlike Symbols block
 * (U+2100-U+214F), so the mathematical block leaves a reserved hole in their
 * place: italic small h is U+210E, not U+1D455, and script capital B is
 * U+212C. Writing the run as base + offset without those exceptions puts an
 * unassigned code point (a box or nothing) in the middle of a word. HOLES
 * below is that list, as published in the Unicode code charts.
 *
 * Everything is written as code point numbers rather than escapes or pasted
 * characters, so the source cannot be silently re-encoded. Anything a style
 * has no form for (punctuation, other scripts, emoji, and digits in the
 * styles without them) is passed through unchanged.
 */

export interface FancyStyle {
  key: string;
  name: string;
  /** Where it tends to work, or what to know about it. */
  note: string;
}

/** A run of 26 capitals, 26 small letters and optionally 10 digits. */
interface Alphabet {
  upper: number;
  lower: number;
  digits?: number;
  /** Letters encoded elsewhere: letter -> code point. */
  holes?: Record<string, number>;
}

/**
 * The Letterlike Symbols the mathematical alphabets point to instead of
 * their own reserved slots (Unicode code chart U+1D400, "reserved" notes).
 */
const HOLES = {
  italic: { h: 0x210e },
  script: {
    B: 0x212c, E: 0x2130, F: 0x2131, H: 0x210b, I: 0x2110, L: 0x2112, M: 0x2133, R: 0x211b,
    e: 0x212f, g: 0x210a, o: 0x2134,
  },
  fraktur: { C: 0x212d, H: 0x210c, I: 0x2111, R: 0x211c, Z: 0x2128 },
  doubleStruck: { C: 0x2102, H: 0x210d, N: 0x2115, P: 0x2119, Q: 0x211a, R: 0x211d, Z: 0x2124 },
} satisfies Record<string, Record<string, number>>;

const ALPHABETS: Record<string, Alphabet> = {
  bold: { upper: 0x1d400, lower: 0x1d41a, digits: 0x1d7ce },
  italic: { upper: 0x1d434, lower: 0x1d44e, holes: HOLES.italic },
  boldItalic: { upper: 0x1d468, lower: 0x1d482 },
  sansBold: { upper: 0x1d5d4, lower: 0x1d5ee, digits: 0x1d7ec },
  sansItalic: { upper: 0x1d608, lower: 0x1d622 },
  script: { upper: 0x1d49c, lower: 0x1d4b6, holes: HOLES.script },
  boldScript: { upper: 0x1d4d0, lower: 0x1d4ea },
  fraktur: { upper: 0x1d504, lower: 0x1d51e, holes: HOLES.fraktur },
  boldFraktur: { upper: 0x1d56c, lower: 0x1d586 },
  doubleStruck: { upper: 0x1d538, lower: 0x1d552, digits: 0x1d7d8, holes: HOLES.doubleStruck },
  monospace: { upper: 0x1d670, lower: 0x1d68a, digits: 0x1d7f6 },
  // Enclosed Alphanumerics: circled capitals, small letters and 1-9, with 0 apart.
  circled: { upper: 0x24b6, lower: 0x24d0, digits: 0x2460 },
  // Enclosed Alphanumeric Supplement has squared capitals only; small letters use them too.
  squared: { upper: 0x1f130, lower: 0x1f130 },
  // Halfwidth and Fullwidth Forms: the wide letters of East Asian typesetting.
  fullwidth: { upper: 0xff21, lower: 0xff41, digits: 0xff10 },
};

/**
 * Small capitals: lower-case letters drawn as small capitals, mostly from
 * the IPA and Phonetic Extensions blocks. There is no small capital X in
 * Unicode, so x is left as it is.
 */
const SMALL_CAPS: Record<string, number> = {
  a: 0x1d00, b: 0x0299, c: 0x1d04, d: 0x1d05, e: 0x1d07, f: 0xa730, g: 0x0262, h: 0x029c,
  i: 0x026a, j: 0x1d0a, k: 0x1d0b, l: 0x029f, m: 0x1d0d, n: 0x0274, o: 0x1d0f, p: 0x1d18,
  q: 0xa7af, r: 0x0280, s: 0xa731, t: 0x1d1b, u: 0x1d1c, v: 0x1d20, w: 0x1d21, y: 0x028f,
  z: 0x1d22,
};

/** Combining marks drawn through or under the character before them. */
const STRIKE = 0x0336; // COMBINING LONG STROKE OVERLAY
const UNDERLINE = 0x0332; // COMBINING LOW LINE

export const STYLES: readonly FancyStyle[] = [
  { key: 'bold', name: 'Bold', note: 'The most widely supported; works in most bios and posts.' },
  { key: 'italic', name: 'Italic', note: 'Letters only; digits stay plain.' },
  { key: 'boldItalic', name: 'Bold italic', note: 'Letters only.' },
  { key: 'sansBold', name: 'Sans-serif bold', note: 'Looks like the bold of most apps.' },
  { key: 'sansItalic', name: 'Sans-serif italic', note: 'Letters only.' },
  { key: 'script', name: 'Script', note: 'Eleven letters come from an older block and can look different.' },
  { key: 'boldScript', name: 'Bold script', note: 'Letters only.' },
  { key: 'fraktur', name: 'Fraktur', note: 'Blackletter; five capitals come from an older block.' },
  { key: 'boldFraktur', name: 'Bold fraktur', note: 'Letters only.' },
  { key: 'doubleStruck', name: 'Double-struck', note: 'Outline letters, with digits.' },
  { key: 'monospace', name: 'Monospace', note: 'Typewriter letters and digits.' },
  { key: 'smallCaps', name: 'Small caps', note: 'Not every font has these; there is no small capital X.' },
  { key: 'circled', name: 'Circled', note: 'Letters and digits in circles.' },
  { key: 'squared', name: 'Squared', note: 'Capitals only, so everything comes out upper-case.' },
  { key: 'fullwidth', name: 'Fullwidth', note: 'Wide letters, digits and spaces.' },
  { key: 'strike', name: 'Strikethrough', note: 'A combining line through each character; rendering varies.' },
  { key: 'underline', name: 'Underline', note: 'A combining line under each character; rendering varies.' },
];

function fromAlphabet(char: string, alphabet: Alphabet, style: string): string | null {
  const hole = alphabet.holes?.[char];
  if (hole !== undefined) return String.fromCodePoint(hole);
  const code = char.charCodeAt(0);
  if (char >= 'A' && char <= 'Z') return String.fromCodePoint(alphabet.upper + code - 65);
  // Squared has capitals only, so its lower run points at them too.
  if (char >= 'a' && char <= 'z') return String.fromCodePoint(alphabet.lower + code - 97);
  if (char >= '0' && char <= '9' && alphabet.digits !== undefined) {
    // Circled digits run 1-9 from U+2460; circled zero sits apart at U+24EA.
    if (style === 'circled') return String.fromCodePoint(char === '0' ? 0x24ea : alphabet.digits + code - 49);
    return String.fromCodePoint(alphabet.digits + code - 48);
  }
  if (char === ' ' && style === 'fullwidth') return String.fromCodePoint(0x3000);
  return null;
}

/** One character (a code point plus any accents on it) in one style, or null if it has no form there. */
function styleChar(char: string, style: string): string | null {
  if (style === 'smallCaps') {
    // Small caps keeps capitals as they are; only lower-case letters change.
    if (char >= 'A' && char <= 'Z') return char;
    const code = SMALL_CAPS[char];
    return code === undefined ? null : String.fromCodePoint(code);
  }
  const alphabet = ALPHABETS[style];
  return alphabet ? fromAlphabet(char, alphabet, style) : null;
}

export interface Styled {
  text: string;
  /** Letters and digits in the input this style has no form for, each listed once. */
  unmapped: string[];
}

/**
 * `text` in `style`. Accented letters are split into letter and accent
 * (NFD), the letter is styled and the accent kept, so "café" keeps its
 * accent in bold. Anything without a form is passed through as it is.
 */
export function stylize(text: string, style: string): Styled {
  if (style === 'strike' || style === 'underline') {
    const mark = String.fromCodePoint(style === 'strike' ? STRIKE : UNDERLINE);
    // Every character except line breaks, including spaces, so the line is continuous.
    return { text: Array.from(text, (c) => (c === '\n' || c === '\r' ? c : c + mark)).join(''), unmapped: [] };
  }
  const unmapped = new Set<string>();
  let out = '';
  for (const char of text) {
    const parts = char.normalize('NFD');
    const base = String.fromCodePoint(parts.codePointAt(0)!);
    const styled = styleChar(base, style);
    if (styled !== null) {
      out += styled + parts.slice(base.length);
    } else {
      if (/[\p{L}\p{N}]/u.test(char)) unmapped.add(char);
      out += char;
    }
  }
  return { text: out, unmapped: [...unmapped] };
}

/** Small capital -> its plain letter, for turning styled text back into plain. */
const FROM_SMALL_CAPS = new Map(
  Object.entries(SMALL_CAPS).map(([letter, code]) => [String.fromCodePoint(code), letter]),
);

/**
 * Styled text back to plain: drops the strike and underline marks, maps small
 * capitals back, then lets Unicode's compatibility normalisation (NFKC) fold
 * every mathematical, circled, squared and fullwidth letter to its plain
 * form. NFKC is what makes these letters searchable at all where a search
 * engine applies it. NFKC also folds other compatibility characters, so a
 * ligature such as U+FB01 becomes f and i, and a superscript 2 becomes 2.
 */
export function unstyle(text: string): string {
  const marks = new RegExp(`[${String.fromCodePoint(STRIKE)}${String.fromCodePoint(UNDERLINE)}]`, 'g');
  return Array.from(text.replace(marks, ''), (c) => FROM_SMALL_CAPS.get(c) ?? c)
    .join('')
    .normalize('NFKC');
}
