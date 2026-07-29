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
 * Break a string into lowercase word tokens.
 *
 * Splits on non-alphanumerics and on camelCase boundaries, including the
 * "HTTPServer" → ["http", "server"] acronym case and letter/number seams.
 */
export function words(input: string): string[] {
  return (
    input
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
