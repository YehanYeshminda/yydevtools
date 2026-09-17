/**
 * Filler text, generated rather than copied.
 *
 * Everything here is pure and seeded, which matters more than it sounds: the
 * component recomputes the text whenever any control changes, and without a
 * seed every keystroke on the count field would reshuffle the whole passage.
 * With one, changing the count extends or trims text that otherwise stays put,
 * and the Shuffle button is the only thing that rewrites it.
 */

/** What the count is counting. */
export type Unit = 'paragraphs' | 'sentences' | 'words' | 'list';

/** How the result is written out. */
export type Format = 'text' | 'html' | 'markdown';

export interface LoremOptions {
  unit: Unit;
  count: number;
  format: Format;
  /** Open with the traditional "Lorem ipsum dolor sit amet…". */
  classic: boolean;
  seed: number;
}

export const UNITS: { value: Unit; label: string }[] = [
  { value: 'paragraphs', label: 'Paragraphs' },
  { value: 'sentences', label: 'Sentences' },
  { value: 'words', label: 'Words' },
  { value: 'list', label: 'List items' },
];

export const FORMATS: { value: Format; label: string; hint: string }[] = [
  { value: 'text', label: 'Plain text', hint: 'Blank line between paragraphs.' },
  { value: 'html', label: 'HTML', hint: 'Wrapped in <p> tags, or <ul> for a list.' },
  { value: 'markdown', label: 'Markdown', hint: 'Paragraphs as-is, list items as - lines.' },
];

/**
 * Upper bounds per unit.
 *
 * Generation is linear and fast, but the textarea holding the result is not:
 * a million words of filler locks the tab up while the browser lays it out.
 * These are roughly where a page stops feeling instant.
 */
export const MAX_COUNT: Record<Unit, number> = {
  paragraphs: 200,
  sentences: 500,
  words: 5000,
  list: 200,
};

/**
 * The vocabulary, which is the actual Lorem Ipsum one.
 *
 * It comes from a passage of Cicero's *de Finibus Bonorum et Malorum*, garbled
 * by a 16th-century printer and used ever since. Keeping the real word list
 * matters: the point of Lorem Ipsum is a word-length distribution close to
 * Latin-alphabet prose, so that a layout filled with it breaks in the places a
 * layout filled with real copy would. "The quick brown fox" repeated does not.
 */
const WORDS = `
  a ac accumsan ad adipiscing aenean aliquam aliquet amet ante arcu at auctor augue bibendum
  blandit commodo condimentum congue consectetur consequat convallis cras cursus dapibus diam
  dictum dignissim dolor donec dui duis egestas eget eleifend elementum elit enim erat eros
  est et etiam eu euismod ex facilisis fames faucibus felis fermentum feugiat finibus
  fringilla fusce gravida habitant hendrerit iaculis id imperdiet in integer interdum ipsum
  justo lacinia lacus laoreet lectus leo libero ligula lobortis lorem luctus maecenas magna
  malesuada massa mattis mauris maximus metus mi molestie mollis morbi nam nec neque netus
  nibh nisi nisl non nulla nullam nunc odio orci ornare pellentesque pharetra phasellus
  placerat porta porttitor posuere potenti praesent pretium primis proin pulvinar purus quam
  quis quisque rhoncus risus rutrum sagittis sapien scelerisque sed sem semper senectus sit
  sodales sollicitudin suscipit suspendisse tellus tempor tempus tincidunt tortor tristique
  turpis ullamcorper ultrices ultricies urna ut varius vehicula vel velit venenatis vestibulum
  vitae vivamus viverra volutpat vulputate
`
  .trim()
  .split(/\s+/);

/**
 * The opening everyone recognises, comma included.
 *
 * The comma is part of the phrase rather than something the sentence builder
 * adds, because this is the one string on the page a reader knows by heart and
 * a comma in the wrong place reads as a bug.
 */
const OPENER = 'lorem ipsum dolor sit amet, consectetur adipiscing elit'.split(' ');

/**
 * mulberry32 — 32 bits of state, uniform enough for choosing words.
 *
 * Math.random cannot be used here: the same options have to give the same text
 * every time the component recomputes, or the passage would rewrite itself on
 * every keystroke.
 */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(next: () => number, min: number, max: number): number {
  return min + Math.floor(next() * (max - min + 1));
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * One sentence: 5 to 15 words, with a comma somewhere in the longer ones.
 *
 * The comma is not decoration. Real prose has punctuation inside a line, and a
 * layout that only ever sees unbroken runs of words will not show you what
 * happens to line-height or justification when it does not.
 */
function sentence(next: () => number, words: string[]): string {
  const built = words.map((word, index) => (index === 0 ? capitalise(word) : word));
  if (built.length > 7 && !built.some((word) => word.endsWith(','))) {
    const at = pick(next, 2, built.length - 3);
    built[at] = `${built[at]},`;
  }
  return `${built.join(' ')}.`;
}

/** Pulls `count` words, starting from the traditional opener if asked. */
function wordsFrom(next: () => number, count: number, classic: boolean): string[] {
  const out: string[] = classic ? OPENER.slice(0, count) : [];
  while (out.length < count) {
    out.push(WORDS[Math.floor(next() * WORDS.length)]);
  }
  return out;
}

/** Splits a flat run of words into sentences of 5 to 15. */
function sentencesFrom(next: () => number, count: number, classic: boolean): string[] {
  const out: string[] = [];
  let first = classic;
  while (out.length < count) {
    const length = pick(next, 5, 15);
    // The opening sentence is never shorter than the phrase itself. A random
    // five would cut it to "Lorem ipsum dolor sit amet," which reads as a
    // truncation bug rather than as filler.
    const room = first ? Math.max(OPENER.length, length) : length;
    out.push(sentence(next, wordsFrom(next, room, first)));
    first = false;
  }
  return out;
}

export function clampCount(unit: Unit, value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(MAX_COUNT[unit], Math.max(1, Math.floor(value)));
}

/**
 * Builds the passage.
 *
 * Returns the blocks rather than one string so the caller can wrap them: the
 * three formats differ only in how blocks are joined, not in what they say.
 */
export function generate(options: LoremOptions): string[] {
  const { unit, classic, seed } = options;
  const count = clampCount(unit, options.count);
  const next = rng(seed);

  if (unit === 'words') {
    return [wordsFrom(next, count, classic).join(' ')];
  }
  if (unit === 'sentences') {
    return [sentencesFrom(next, count, classic).join(' ')];
  }
  if (unit === 'list') {
    // A list item is one sentence without the full stop — that is how list
    // items are written, and leaving the stop on makes filler look like prose
    // that has been chopped up.
    return sentencesFrom(next, count, classic).map((line) => line.slice(0, -1));
  }

  // Paragraphs: 3 to 6 sentences each, which is where English prose sits.
  const out: string[] = [];
  let first = classic;
  for (let i = 0; i < count; i += 1) {
    out.push(sentencesFrom(next, pick(next, 3, 6), first).join(' '));
    first = false;
  }
  return out;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};

/**
 * The vocabulary has no markup in it, so this can never fire today. It is here
 * because the output is offered as HTML for someone to paste into a page, and
 * an HTML generator that would emit whatever it was handed is the wrong shape
 * to leave lying around.
 */
function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (char) => HTML_ESCAPES[char]);
}

/** Joins the blocks for the chosen format. */
export function render(blocks: string[], unit: Unit, format: Format): string {
  if (format === 'html') {
    if (unit === 'list') {
      const items = blocks.map((line) => `  <li>${escapeHtml(line)}</li>`).join('\n');
      return `<ul>\n${items}\n</ul>`;
    }
    return blocks.map((block) => `<p>${escapeHtml(block)}</p>`).join('\n');
  }
  if (format === 'markdown' && unit === 'list') {
    return blocks.map((line) => `- ${line}`).join('\n');
  }
  return blocks.join(unit === 'list' ? '\n' : '\n\n');
}

/** Word and character totals for the generated text, for the counter line. */
export function measure(text: string): { words: number; characters: number } {
  const trimmed = text.trim();
  return {
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    characters: text.length,
  };
}
