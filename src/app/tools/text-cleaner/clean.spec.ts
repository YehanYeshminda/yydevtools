import { describe, expect, it } from 'vitest';

import { clean, NO_OPTIONS, stats, toLines, type CleanOptions } from './clean';

const with_ = (changes: Partial<CleanOptions>): CleanOptions => ({ ...NO_OPTIONS, ...changes });

describe('clean', () => {
  it('changes nothing when no option is on, beyond normalising line endings', () => {
    expect(clean('a\r\nb\rc\n', NO_OPTIONS)).toBe('a\nb\nc\n');
  });

  it('removes zero-width characters and a stray byte-order mark', () => {
    const dirty = 'in\u200bvisible\ufeff';

    expect(clean(dirty, with_({ stripInvisible: true }))).toBe('invisible');
  });

  it('straightens curly quotes and an ellipsis', () => {
    const dirty = '\u201cIt\u2019s fine\u201d\u2026';

    expect(clean(dirty, with_({ straightenQuotes: true }))).toBe('"It\'s fine"...');
  });

  it('folds non-breaking spaces and collapses runs', () => {
    expect(clean('a\u00a0\u00a0b   c', with_({ normaliseSpaces: true }))).toBe('a b c');
  });

  it('trims each line, which then lets a whitespace-only line count as blank', () => {
    expect(clean('  a  \n   \nb', with_({ trim: true, dropBlank: true }))).toBe('a\nb');
  });

  it('keeps the first of each duplicate, in place', () => {
    expect(clean('b\na\nb\nc\na', with_({ dedupe: true }))).toBe('b\na\nc');
  });

  it('sorts naturally, so item2 comes before item10', () => {
    const sorted = clean('item10\nitem2\nitem1', with_({ sort: 'asc' }));

    expect(toLines(sorted)).toEqual(['item1', 'item2', 'item10']);
  });

  it('sorts descending', () => {
    expect(toLines(clean('a\nc\nb', with_({ sort: 'desc' })))).toEqual(['c', 'b', 'a']);
  });

  it('reverses after sorting, so both together are a no-op on order', () => {
    expect(toLines(clean('a\nb\nc', with_({ sort: 'asc', reverse: true })))).toEqual([
      'c',
      'b',
      'a',
    ]);
  });

  it('de-duplicates before sorting, so the surviving line is the first one', () => {
    // Both copies are identical text, so this only proves the count, but the
    // order of the two steps is what stops a sort from picking arbitrarily.
    expect(toLines(clean('b\na\nb', with_({ dedupe: true, sort: 'asc' })))).toEqual(['a', 'b']);
  });

  it('runs a realistic paste through every step at once', () => {
    const messy = '  \u201cBeta\u201d  \n\u200bAlpha\n\n  \u201cBeta\u201d  \n';
    const tidy = clean(
      messy,
      with_({
        stripInvisible: true,
        straightenQuotes: true,
        normaliseSpaces: true,
        trim: true,
        dropBlank: true,
        dedupe: true,
        sort: 'asc',
      }),
    );

    // The straightened quote is still a leading character, and collation puts
    // punctuation before letters — so the quoted line sorts first.
    expect(toLines(tidy)).toEqual(['"Beta"', 'Alpha']);
  });
});

describe('stats', () => {
  it('counts lines and characters on both sides', () => {
    const result = stats('a\nb\n', 'a\nb');

    expect(result.linesBefore).toBe(3);
    expect(result.linesAfter).toBe(2);
    expect(result.charsBefore).toBe(4);
    expect(result.charsAfter).toBe(3);
  });

  it('counts the invisible characters that were in the input', () => {
    expect(stats('a\u200bb\ufeff', 'ab').invisible).toBe(2);
    expect(stats('clean', 'clean').invisible).toBe(0);
  });

  it('reports an empty input as no lines rather than one', () => {
    expect(stats('', '').linesBefore).toBe(0);
  });
});
