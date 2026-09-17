import { DEFAULT_OPTIONS, slugLines, slugify, type SlugOptions } from './slug';

const options = (overrides: Partial<SlugOptions> = {}): SlugOptions => ({
  ...DEFAULT_OPTIONS,
  ...overrides,
});

describe('slugify', () => {
  it('lowercases and joins on the separator', () => {
    expect(slugify('The Complete Guide', options())).toBe('the-complete-guide');
    expect(slugify('The Complete Guide', options({ separator: '_' }))).toBe('the_complete_guide');
  });

  // The bug that made the Case Converter's slug row wrong for two years.
  it('folds accented letters rather than dropping them', () => {
    expect(slugify('Café Münchén über Straße', options())).toBe('cafe-munchen-uber-strasse');
  });

  it('splits camelCase and letter/number seams, like the case converter', () => {
    expect(slugify('HTTPServer2Config', options())).toBe('http-server-2-config');
  });

  it('collapses punctuation instead of encoding it', () => {
    expect(slugify('  What?! Really... yes  ', options())).toBe('what-really-yes');
  });

  describe('stop words', () => {
    it('drops them when asked', () => {
      expect(
        slugify('The Rise and Fall of the Roman Empire', options({ dropStopWords: true })),
      ).toBe('rise-fall-roman-empire');
    });

    it('leaves them alone by default', () => {
      expect(slugify('The Rise and Fall', options())).toBe('the-rise-and-fall');
    });

    // Dropping every word would leave an empty slug, which is worse than one
    // that reads oddly.
    it('keeps them when they are the whole title', () => {
      expect(slugify('Of The And', options({ dropStopWords: true }))).toBe('of-the-and');
    });

    // What opting in costs, on a title built mostly of short function words.
    // The switch is off by default for this reason.
    it('will mangle a title that needs its stop words', () => {
      expect(slugify('To Be or Not To Be', options({ dropStopWords: true }))).toBe('be-not-be');
    });
  });

  describe('maxLength', () => {
    it('cuts on a word boundary, not mid-word', () => {
      expect(slugify('the complete guide to documentation', options({ maxLength: 20 }))).toBe(
        'the-complete-guide',
      );
    });

    it('never exceeds the limit', () => {
      const slug = slugify('one two three four five six seven', options({ maxLength: 15 }));
      expect(slug.length).toBeLessThanOrEqual(15);
    });

    it('cuts a single over-long word, because there is nothing to drop', () => {
      expect(slugify('supercalifragilistic', options({ maxLength: 10 }))).toBe('supercalif');
    });

    it('is off at zero', () => {
      expect(slugify('one two three four', options({ maxLength: 0 }))).toBe('one-two-three-four');
    });
  });
});

describe('slugLines', () => {
  it('slugs one line at a time and skips blanks', () => {
    const rows = slugLines('First Post\n\n  \nSecond Post', options());
    expect(rows.map((row) => row.slug)).toEqual(['first-post', 'second-post']);
  });

  // Two pages cannot share a URL, so the collision has to be resolved and seen.
  it('suffixes a repeated slug and flags it', () => {
    const rows = slugLines('The 2024 Report\nThe 2024 report!\nThe 2024 Report', options());
    expect(rows.map((row) => row.slug)).toEqual([
      'the-2024-report',
      'the-2024-report-2',
      'the-2024-report-3',
    ]);
    expect(rows.map((row) => row.deduped)).toEqual([false, true, true]);
  });

  it('suffixes with the chosen separator', () => {
    const rows = slugLines('Post\nPost', options({ separator: '_' }));
    expect(rows[1].slug).toBe('post_2');
  });

  it('keeps a line that slugs to nothing, so the counts match', () => {
    const rows = slugLines('Real Title\n!!!\nAnother', options());
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual({ source: '!!!', slug: '', deduped: false });
  });

  it('keeps the source line for each row', () => {
    const rows = slugLines('Hello World', options());
    expect(rows[0].source).toBe('Hello World');
  });
});
