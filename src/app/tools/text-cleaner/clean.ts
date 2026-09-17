/**
 * Tidying pasted text.
 *
 * Every operation is a pure string-to-string step, and the order they run in is
 * fixed and deliberate rather than the order the buttons happen to sit in. It
 * matters: trimming before dropping blank lines means a line of three spaces
 * counts as blank, and de-duplicating before sorting keeps the first occurrence
 * of each line rather than an arbitrary one.
 */

export type SortOrder = 'none' | 'asc' | 'desc';

export interface CleanOptions {
  stripInvisible: boolean;
  straightenQuotes: boolean;
  normaliseSpaces: boolean;
  trim: boolean;
  dropBlank: boolean;
  dedupe: boolean;
  sort: SortOrder;
  reverse: boolean;
}

export const NO_OPTIONS: CleanOptions = {
  stripInvisible: false,
  straightenQuotes: false,
  normaliseSpaces: false,
  trim: false,
  dropBlank: false,
  dedupe: false,
  sort: 'none',
  reverse: false,
};

/**
 * Characters with no width that survive a copy and paste and then break things
 * quietly: zero-width spaces and joiners, the bidirectional overrides, the word
 * joiner, and a byte-order mark that wandered into the middle of a file. They
 * are the reason a string that looks identical to another one is not equal to
 * it, and the reason a "clean" CSV header does not match the column name.
 */
const INVISIBLE = /[\u00ad\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

/** Unicode spaces that are not the ordinary one, including the non-breaking space. */
const ODD_SPACES = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;

const QUOTES: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201a': "'",
  '\u201b': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u201e': '"',
  '\u201f': '"',
  '\u2032': "'",
  '\u2033': '"',
  '\u2026': '...',
};

const CURLY = /[\u2018\u2019\u201a\u201b\u201c\u201d\u201e\u201f\u2032\u2033\u2026]/g;

/** Splits on any line ending, so CRLF input does not leave stray carriage returns. */
export function toLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

export function clean(text: string, options: CleanOptions): string {
  let working = text;

  if (options.stripInvisible) {
    working = working.replace(INVISIBLE, '');
  }
  if (options.straightenQuotes) {
    working = working.replace(CURLY, (character) => QUOTES[character]);
  }
  if (options.normaliseSpaces) {
    // Fold the exotic spaces first, then collapse runs — otherwise a space
    // followed by a non-breaking space survives as two.
    working = working.replace(ODD_SPACES, ' ').replace(/[ \t]{2,}/g, ' ');
  }

  let lines = toLines(working);

  if (options.trim) {
    lines = lines.map((line) => line.trim());
  }
  if (options.dropBlank) {
    lines = lines.filter((line) => line.trim() !== '');
  }
  if (options.dedupe) {
    const seen = new Set<string>();
    lines = lines.filter((line) => {
      if (seen.has(line)) {
        return false;
      }
      seen.add(line);
      return true;
    });
  }
  if (options.sort !== 'none') {
    // localeCompare with numeric collation, so "item2" sorts before "item10"
    // the way a person reading the list expects.
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    lines = [...lines].sort((a, b) => collator.compare(a, b));
    if (options.sort === 'desc') {
      lines.reverse();
    }
  }
  if (options.reverse) {
    lines = [...lines].reverse();
  }

  return lines.join('\n');
}

export interface CleanStats {
  linesBefore: number;
  linesAfter: number;
  charsBefore: number;
  charsAfter: number;
  /** Invisible characters found in the input, whether or not they were removed. */
  invisible: number;
}

export function stats(before: string, after: string): CleanStats {
  return {
    linesBefore: before === '' ? 0 : toLines(before).length,
    linesAfter: after === '' ? 0 : toLines(after).length,
    charsBefore: [...before].length,
    charsAfter: [...after].length,
    invisible: (before.match(INVISIBLE) ?? []).length,
  };
}
