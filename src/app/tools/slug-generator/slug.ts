/**
 * URL slugs, one per line.
 *
 * The hard part — splitting a string into words across camelCase humps,
 * punctuation and accented letters — already exists as `words()` in the Case
 * Converter, and is reused rather than written twice. What is added here is the
 * batch: stop-word removal, a length limit that cuts on a word boundary, and
 * de-duplication across the whole list, which is the reason a list of post
 * titles needs a tool at all rather than one conversion repeated by hand.
 */

import { words } from '../case-converter/case';

export type Separator = '-' | '_';

export interface SlugOptions {
  separator: Separator;
  /** 0 means no limit. Counted in characters of the finished slug. */
  maxLength: number;
  dropStopWords: boolean;
}

export const DEFAULT_OPTIONS: SlugOptions = {
  separator: '-',
  maxLength: 0,
  dropStopWords: false,
};

/**
 * The short function words that carry no meaning in a URL.
 *
 * Deliberately short. A long list starts removing words that matter — "how to
 * be" is a real title, and a list containing "be" would slug it to "how".
 */
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

/** One line in, one slug out. */
export function slugify(line: string, options: SlugOptions): string {
  let tokens = words(line);

  if (options.dropStopWords) {
    const kept = tokens.filter((word) => !STOP_WORDS.has(word));
    // "The Ins and Outs of It" is all stop words bar two; a title that is
    // nothing but stop words would become an empty slug, which is worse than
    // one that reads oddly, so the filter is skipped rather than applied.
    tokens = kept.length > 0 ? kept : tokens;
  }

  if (options.maxLength > 0) {
    tokens = withinLength(tokens, options.separator, options.maxLength);
  }

  return tokens.join(options.separator);
}

/**
 * Drops whole words off the end until the joined slug fits.
 *
 * Cutting mid-word instead would produce "the-complete-guide-to-doc", which
 * reads as a broken link rather than a shortened one. A single first word that
 * is over the limit is the exception: there is nothing to drop, so it is cut.
 */
function withinLength(tokens: string[], separator: Separator, max: number): string[] {
  const kept: string[] = [];
  let length = 0;
  for (const token of tokens) {
    const next = length === 0 ? token.length : length + separator.length + token.length;
    if (next > max) {
      break;
    }
    kept.push(token);
    length = next;
  }
  return kept.length > 0 ? kept : [tokens[0]?.slice(0, max) ?? ''];
}

export interface SlugRow {
  source: string;
  slug: string;
  /** Set when an earlier line produced the same slug and this one was suffixed. */
  deduped: boolean;
}

/**
 * Every non-blank line, slugged, with collisions resolved.
 *
 * Two different titles routinely reduce to the same slug — "The 2024 Report"
 * and "The 2024 report!" both give the-2024-report — and two pages cannot share
 * a URL. The second and later ones get a numeric suffix, the way every CMS
 * does it, and are flagged so the collision is visible rather than silent.
 */
export function slugLines(text: string, options: SlugOptions): SlugRow[] {
  const seen = new Map<string, number>();
  const rows: SlugRow[] = [];

  for (const line of text.split('\n')) {
    if (line.trim().length === 0) {
      continue;
    }
    const slug = slugify(line, options);
    if (slug.length === 0) {
      // Nothing survived — a line of punctuation, or of a script this cannot
      // transliterate. Shown as it is rather than dropped, so the count of
      // lines in still matches the count of rows out.
      rows.push({ source: line, slug: '', deduped: false });
      continue;
    }

    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    rows.push({
      source: line,
      slug: count === 0 ? slug : `${slug}${options.separator}${count + 1}`,
      deduped: count > 0,
    });
  }

  return rows;
}
