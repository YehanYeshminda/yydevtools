import { describe, expect, it } from 'vitest';

import { STYLES, stylize, unstyle } from './fancy';

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const ALL = UPPER + LOWER + DIGITS;

/** Code points as U+XXXX, so a failure names the character instead of drawing it. */
const cps = (text: string) => Array.from(text, (c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`);

/** The styles built from Unicode alphabets, which NFKC folds back to plain letters. */
const ALPHABET_STYLES = STYLES.map((s) => s.key).filter((k) => !['smallCaps', 'strike', 'underline'].includes(k));

describe('stylize', () => {
  it('never produces an unassigned code point (the reserved holes in the mathematical block)', () => {
    for (const style of ALPHABET_STYLES) {
      const unassigned = Array.from(stylize(ALL, style).text).filter((c) => /\p{Cn}/u.test(c));
      expect(cps(unassigned.join('')), style).toEqual([]);
    }
  });

  it('maps every letter and digit to a character Unicode itself folds back to that letter', () => {
    // NFKC is the oracle: the compatibility decomposition of MATHEMATICAL BOLD
    // CAPITAL A is A, so a wrong offset or a wrong hole cannot pass.
    for (const style of ALPHABET_STYLES) {
      const { text, unmapped } = stylize(ALL, style);
      const expected = style === 'squared' ? (UPPER + UPPER + DIGITS) : ALL;
      expect(text.normalize('NFKC'), style).toBe(expected);
      // Every letter changed, and digits changed where the style has them.
      const changed = Array.from(text).filter((c, i) => c !== ALL[i]).length;
      expect(changed + unmapped.length, style).toBe(ALL.length);
    }
  });

  it('takes the Letterlike Symbols for the known holes', () => {
    expect(cps(stylize('h', 'italic').text)).toEqual(['U+210E']); // PLANCK CONSTANT
    expect(cps(stylize('BEFHILMR', 'script').text)).toEqual(
      ['U+212C', 'U+2130', 'U+2131', 'U+210B', 'U+2110', 'U+2112', 'U+2133', 'U+211B'],
    );
    expect(cps(stylize('ego', 'script').text)).toEqual(['U+212F', 'U+210A', 'U+2134']);
    expect(cps(stylize('CHIRZ', 'fraktur').text)).toEqual(['U+212D', 'U+210C', 'U+2111', 'U+211C', 'U+2128']);
    expect(cps(stylize('CHNPQRZ', 'doubleStruck').text)).toEqual(
      ['U+2102', 'U+210D', 'U+2115', 'U+2119', 'U+211A', 'U+211D', 'U+2124'],
    );
    // The bold alphabets have no holes.
    expect(cps(stylize('hB', 'boldItalic').text)).toEqual(['U+1D489', 'U+1D469']);
  });

  it('starts each alphabet where the code chart does', () => {
    expect(cps(stylize('Aa0', 'bold').text)).toEqual(['U+1D400', 'U+1D41A', 'U+1D7CE']);
    expect(cps(stylize('Aa0', 'monospace').text)).toEqual(['U+1D670', 'U+1D68A', 'U+1D7F6']);
    expect(cps(stylize('Aa0', 'doubleStruck').text)).toEqual(['U+1D538', 'U+1D552', 'U+1D7D8']);
    expect(cps(stylize('Aa', 'sansBold').text)).toEqual(['U+1D5D4', 'U+1D5EE']);
    expect(cps(stylize('Aa', 'fraktur').text)).toEqual(['U+1D504', 'U+1D51E']);
    expect(cps(stylize('A 0', 'fullwidth').text)).toEqual(['U+FF21', 'U+3000', 'U+FF10']);
  });

  it('circles 1-9 from U+2460 and 0 from U+24EA', () => {
    expect(cps(stylize('109', 'circled').text)).toEqual(['U+2460', 'U+24EA', 'U+2468']);
  });

  it('passes through what a style cannot map, and reports the letters and digits it left', () => {
    expect(stylize('Hi, 2026! 😀', 'italic')).toEqual({
      text: `${String.fromCodePoint(0x1d43b)}${String.fromCodePoint(0x1d456)}, 2026! 😀`,
      unmapped: ['2', '0', '6'],
    });
    expect(stylize('Привет', 'bold').unmapped).toEqual(['П', 'р', 'и', 'в', 'е', 'т']);
  });

  it('keeps accents on styled letters', () => {
    const cafe = stylize('café', 'bold').text;
    expect(cps(cafe)).toEqual(['U+1D41C', 'U+1D41A', 'U+1D41F', 'U+1D41E', 'U+0301']);
    expect(cafe.normalize('NFKC')).toBe('café');
  });

  it('turns lower-case into small capitals, has none for x, and keeps capitals', () => {
    const { text, unmapped } = stylize('Max', 'smallCaps');
    expect(cps(text)).toEqual(['U+004D', 'U+1D00', 'U+0078']);
    expect(unmapped).toEqual(['x']);
  });

  it('strikes or underlines every character but line breaks', () => {
    expect(cps(stylize('a b\nc', 'strike').text)).toEqual([
      'U+0061', 'U+0336', 'U+0020', 'U+0336', 'U+0062', 'U+0336', 'U+000A', 'U+0063', 'U+0336',
    ]);
    expect(cps(stylize('ok', 'underline').text)).toEqual(['U+006F', 'U+0332', 'U+006B', 'U+0332']);
  });
});

describe('unstyle', () => {
  it('turns every style back into the plain text', () => {
    const plain = 'Hello World 2026, café!';
    for (const { key } of STYLES) {
      const back = unstyle(stylize(plain, key).text);
      expect(back, key).toBe(key === 'squared' ? plain.toUpperCase() : plain);
    }
  });
});
