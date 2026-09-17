/**
 * Case conversions, built on one idea: split any input into its constituent
 * words, then re-join them in the target style. Getting the split right — across
 * camelCase humps, snake/kebab separators, digits and punctuation — is the whole
 * job; every case function is a trivial join once `words()` has run.
 */

export type CaseKind =
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'constant'
  | 'kebab'
  | 'title'
  | 'sentence'
  | 'lower'
  | 'upper'
  | 'slug';

/**
 * Letters Unicode decomposition cannot take apart, because they are letters in
 * their own right rather than a base letter carrying an accent. Without this,
 * "Straße" loses its ß entirely instead of becoming "strasse".
 */
const LETTERS: Record<string, string> = {
  ß: 'ss',
  ẞ: 'ss',
  ø: 'o',
  Ø: 'o',
  æ: 'ae',
  Æ: 'ae',
  œ: 'oe',
  Œ: 'oe',
  đ: 'd',
  Đ: 'd',
  ð: 'd',
  Ð: 'd',
  ł: 'l',
  Ł: 'l',
  þ: 'th',
  Þ: 'th',
  ı: 'i',
};

/**
 * Folds accented Latin letters onto their ASCII base.
 *
 * Every case here is ASCII-only by design — an identifier, a URL slug, a column
 * name — so a café has to become a cafe. It used to become a "caf": the split
 * below treats anything outside A-Za-z0-9 as a separator, which silently threw
 * away every accented letter and left "Über Straße" as "ber stra e".
 */
function fold(input: string): string {
  return (
    input
      .replace(/[ßẞøØæÆœŒđĐðÐłŁþÞı]/g, (letter) => LETTERS[letter])
      // NFKD splits "é" into "e" plus a combining acute, which then drops out.
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
  );
}

/**
 * Break a string into lowercase word tokens.
 *
 * Splits on non-alphanumerics and on camelCase boundaries, including the
 * "HTTPServer" → ["http", "server"] acronym case and letter/number seams.
 * Accented letters are folded to ASCII first rather than dropped.
 */
export function words(input: string): string[] {
  return (
    fold(input)
      // Insert a break between an acronym run and a following TitleCase word.
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      // Break between a lowercase/digit and an uppercase letter.
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      // Break between a letter and a digit, and a digit and a letter.
      .replace(/([A-Za-z])([0-9])/g, '$1 $2')
      .replace(/([0-9])([A-Za-z])/g, '$1 $2')
      // Any run of separators becomes a single space.
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0)
      .map((word) => word.toLowerCase())
  );
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function toCamel(input: string): string {
  return words(input)
    .map((word, index) => (index === 0 ? word : capitalise(word)))
    .join('');
}

export function toPascal(input: string): string {
  return words(input).map(capitalise).join('');
}

export function toSnake(input: string): string {
  return words(input).join('_');
}

export function toConstant(input: string): string {
  return words(input).join('_').toUpperCase();
}

export function toKebab(input: string): string {
  return words(input).join('-');
}

export function toTitle(input: string): string {
  return words(input).map(capitalise).join(' ');
}

export function toSentence(input: string): string {
  const parts = words(input);
  if (parts.length === 0) {
    return '';
  }
  return [capitalise(parts[0]), ...parts.slice(1)].join(' ');
}

export function toLower(input: string): string {
  return words(input).join(' ');
}

export function toUpper(input: string): string {
  return words(input).join(' ').toUpperCase();
}

/** A URL slug: kebab-case, which is already ASCII-safe after `words()`. */
export function toSlug(input: string): string {
  return words(input).join('-');
}

const CONVERTERS: Record<CaseKind, (input: string) => string> = {
  camel: toCamel,
  pascal: toPascal,
  snake: toSnake,
  constant: toConstant,
  kebab: toKebab,
  title: toTitle,
  sentence: toSentence,
  lower: toLower,
  upper: toUpper,
  slug: toSlug,
};

export function convert(input: string, kind: CaseKind): string {
  return CONVERTERS[kind](input);
}
