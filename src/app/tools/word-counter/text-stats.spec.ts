import { describe, expect, it } from 'vitest';

import {
  READING_WPM,
  analyse,
  formatDuration,
  keywordDensity,
  tokenize,
} from './text-stats';

describe('analyse', () => {
  it('reports zeroes for empty text', () => {
    const stats = analyse('');

    expect(stats).toMatchObject({
      characters: 0,
      charactersNoSpaces: 0,
      words: 0,
      sentences: 0,
      paragraphs: 0,
      lines: 0,
      averageWordLength: 0,
      longestWord: '',
    });
  });

  it('counts words, characters and characters without spaces', () => {
    const stats = analyse('Hello there world');

    expect(stats.words).toBe(3);
    expect(stats.characters).toBe(17);
    expect(stats.charactersNoSpaces).toBe(15);
  });

  it('does not count whitespace-only text as a word', () => {
    expect(analyse('   \n\t  ').words).toBe(0);
  });

  it('counts a hyphenated word and a contraction the way a reader would', () => {
    // "well-known" is two word-like segments either side of the hyphen; the
    // apostrophe in "don't" does not split it.
    expect(analyse("don't").words).toBe(1);
    expect(analyse('well-known').words).toBeGreaterThanOrEqual(1);
  });

  it('counts sentences across the three terminators', () => {
    expect(analyse('One. Two! Three?').sentences).toBe(3);
  });

  it('counts an unterminated trailing sentence', () => {
    expect(analyse('First one. And this trails off').sentences).toBe(2);
  });

  it('separates paragraphs on blank lines, not on single newlines', () => {
    const text = 'First line\nstill the first paragraph\n\nSecond paragraph';

    const stats = analyse(text);

    expect(stats.paragraphs).toBe(2);
    expect(stats.lines).toBe(4);
  });

  it('ignores trailing blank lines when counting paragraphs', () => {
    expect(analyse('Only one\n\n\n').paragraphs).toBe(1);
  });

  it('counts an emoji as a single character', () => {
    expect(analyse('hi 🚀').characters).toBe(4);
  });

  it('derives reading time from the word count', () => {
    const text = Array.from({ length: READING_WPM }, () => 'word').join(' ');

    expect(analyse(text).readingSeconds).toBeCloseTo(60, 5);
  });

  it('reports the longest word and the mean word length', () => {
    const stats = analyse('a bb cccc');

    expect(stats.longestWord).toBe('cccc');
    expect(stats.averageWordLength).toBe(2.3);
  });

  it('counts CJK text that contains no spaces at all', () => {
    // The whole point of segmentation: a whitespace split would return 1.
    expect(analyse('今日は良い天気ですね').words).toBeGreaterThan(1);
  });
});

describe('tokenize', () => {
  it('drops punctuation and whitespace, keeping only words', () => {
    expect(tokenize('Hi, there! Ok.')).toEqual(['Hi', 'there', 'Ok']);
  });
});

describe('keywordDensity', () => {
  it('returns nothing for empty text', () => {
    expect(keywordDensity('')).toEqual([]);
  });

  it('counts repeats and orders by frequency', () => {
    const [top] = keywordDensity('apple banana apple cherry apple banana');

    expect(top).toMatchObject({ word: 'apple', count: 3 });
  });

  it('is case insensitive', () => {
    const [top] = keywordDensity('Signal signal SIGNAL');

    expect(top).toMatchObject({ word: 'signal', count: 3 });
  });

  it('omits common words by default', () => {
    const found = keywordDensity('the cat and the hat and the bat');

    expect(found.map((entry) => entry.word)).not.toContain('the');
    expect(found.map((entry) => entry.word)).toContain('cat');
  });

  it('includes common words when asked', () => {
    const found = keywordDensity('the cat and the hat', { ignoreCommon: false });

    expect(found[0]).toMatchObject({ word: 'the', count: 2 });
  });

  it('reports density as a share of the counted words', () => {
    const [top] = keywordDensity('alpha alpha beta gamma', { ignoreCommon: false });

    expect(top.density).toBeCloseTo(0.5, 5);
  });

  it('honours the limit', () => {
    expect(keywordDensity('one two three four five', { limit: 2 })).toHaveLength(2);
  });

  it('breaks ties alphabetically so the table is stable', () => {
    const found = keywordDensity('zebra apple', { ignoreCommon: false });

    expect(found.map((entry) => entry.word)).toEqual(['apple', 'zebra']);
  });
});

describe('formatDuration', () => {
  it('reads zero as zero', () => {
    expect(formatDuration(0)).toBe('0 sec');
  });

  it('avoids saying "0 sec" for a very short but non-zero time', () => {
    expect(formatDuration(0.4)).toBe('under 1 sec');
  });

  it('gives seconds under a minute', () => {
    expect(formatDuration(42)).toBe('42 sec');
  });

  it('drops the seconds when they are zero', () => {
    expect(formatDuration(120)).toBe('2 min');
  });

  it('gives minutes and seconds together', () => {
    expect(formatDuration(90)).toBe('1 min 30 sec');
  });
});
