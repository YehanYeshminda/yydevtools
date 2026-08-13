/**
 * Counting words is less obvious than it looks.
 *
 * Splitting on whitespace — what most counters do — gets English roughly right
 * and Chinese, Japanese and Thai completely wrong, because those scripts do not
 * put spaces between words: a 500-word Japanese article counts as 1. Where the
 * platform provides `Intl.Segmenter` we use it, so word and sentence boundaries
 * follow the Unicode segmentation rules for the text's own script. The
 * whitespace fallback is kept for platforms without it, and is documented in
 * the UI rather than hidden.
 */

/** Words per minute for silent reading of ordinary prose. */
export const READING_WPM = 238;

/** Words per minute for reading aloud at a comfortable pace. */
export const SPEAKING_WPM = 140;

export interface TextStats {
  /** Unicode code points, so most emoji count as one rather than two. */
  characters: number;
  charactersNoSpaces: number;
  words: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  readingSeconds: number;
  speakingSeconds: number;
  /** Mean characters per word, to one decimal place. 0 when there are no words. */
  averageWordLength: number;
  longestWord: string;
}

export interface Keyword {
  word: string;
  count: number;
  /** Share of all counted words, 0–1. */
  density: number;
}

/**
 * Words too common to be interesting in a density table. Deliberately short:
 * it covers the closed-class words that would otherwise take every top slot,
 * without editorialising about content words.
 */
const STOP_WORDS = new Set([
  'a', 'about', 'after', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'down', 'each',
  'for', 'from', 'get', 'had', 'has', 'have', 'he', 'her', 'here', 'hers', 'him', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just',
  'me', 'more', 'most', 'my', 'no', 'not', 'now', 'of', 'off', 'on', 'one', 'only', 'or',
  'other', 'our', 'out', 'over', 'own',
  'said', 'same', 'she', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too', 'under', 'up', 'us',
  'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'why',
  'will', 'with', 'would', 'you', 'your', 'yours',
]);

/** Cached because constructing a Segmenter is far from free. */
let wordSegmenter: Intl.Segmenter | null | undefined;
let sentenceSegmenter: Intl.Segmenter | null | undefined;

function segmenterFor(granularity: 'word' | 'sentence'): Intl.Segmenter | null {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') {
    return null;
  }
  try {
    return new Intl.Segmenter(undefined, { granularity });
  } catch {
    return null;
  }
}

function words(text: string): string[] {
  if (text.trim() === '') {
    return [];
  }
  if (wordSegmenter === undefined) {
    wordSegmenter = segmenterFor('word');
  }
  if (wordSegmenter) {
    const found: string[] = [];
    for (const segment of wordSegmenter.segment(text)) {
      if (segment.isWordLike) {
        found.push(segment.segment);
      }
    }
    return found;
  }
  return text.trim().split(/\s+/u);
}

/** The word list, exposed so the density table and the stats agree on what a word is. */
export function tokenize(text: string): string[] {
  return words(text);
}

function countSentences(text: string): number {
  if (text.trim() === '') {
    return 0;
  }
  if (sentenceSegmenter === undefined) {
    sentenceSegmenter = segmenterFor('sentence');
  }
  if (sentenceSegmenter) {
    let count = 0;
    for (const segment of sentenceSegmenter.segment(text)) {
      if (segment.segment.trim() !== '') {
        count++;
      }
    }
    return count;
  }
  // Fallback: a run of terminators ends one sentence, and trailing text that
  // never terminates still counts as one.
  return text.split(/[.!?…]+(?:\s|$)/u).filter((part) => part.trim() !== '').length;
}

export function analyse(text: string): TextStats {
  const list = words(text);
  const wordCount = list.length;

  let longestWord = '';
  let totalWordLength = 0;
  for (const word of list) {
    totalWordLength += [...word].length;
    if ([...word].length > [...longestWord].length) {
      longestWord = word;
    }
  }

  return {
    characters: [...text].length,
    charactersNoSpaces: [...text.replace(/\s/gu, '')].length,
    words: wordCount,
    sentences: countSentences(text),
    paragraphs: text
      .split(/\n\s*\n/u)
      .filter((block) => block.trim() !== '').length,
    lines: text === '' ? 0 : text.split(/\r\n|\r|\n/u).length,
    readingSeconds: (wordCount / READING_WPM) * 60,
    speakingSeconds: (wordCount / SPEAKING_WPM) * 60,
    averageWordLength: wordCount === 0 ? 0 : Math.round((totalWordLength / wordCount) * 10) / 10,
    longestWord,
  };
}

/**
 * The most frequent words, most common first.
 *
 * Ties are broken alphabetically so the table is stable between runs rather
 * than reflecting whatever order the text happened to introduce them in.
 */
export function keywordDensity(
  text: string,
  { limit = 10, ignoreCommon = true }: { limit?: number; ignoreCommon?: boolean } = {},
): Keyword[] {
  const list = words(text).map((word) => word.toLocaleLowerCase());
  const counted = ignoreCommon ? list.filter((word) => !STOP_WORDS.has(word)) : list;
  if (counted.length === 0) {
    return [];
  }

  const counts = new Map<string, number>();
  for (const word of counted) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([word, count]) => ({ word, count, density: count / counted.length }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}

/**
 * A duration as a person would say it: "about 4 min", "1 min 30 sec", "12 sec".
 * Anything under a second reads as "under 1 sec" rather than "0 sec".
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) {
    return '0 sec';
  }
  if (seconds < 1) {
    return 'under 1 sec';
  }
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  if (minutes === 0) {
    return `${rest} sec`;
  }
  if (rest === 0) {
    return `${minutes} min`;
  }
  return `${minutes} min ${rest} sec`;
}
