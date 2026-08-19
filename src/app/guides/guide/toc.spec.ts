import { describe, expect, it } from 'vitest';

import { activeHeadingId, type TocEntry } from './toc';

const OFFSET = 96;

const entries: TocEntry[] = [
  { id: 'one', text: 'One', sub: false },
  { id: 'two', text: 'Two', sub: false },
  { id: 'three', text: 'Three', sub: true },
  { id: 'four', text: 'Four', sub: false },
];

/** Builds a `topOf` from a map of id → viewport-relative top. */
const tops = (map: Record<string, number | null>) => (id: string) => map[id] ?? null;

describe('activeHeadingId', () => {
  it('returns null at the top of the article, before any heading is reached', () => {
    const at = tops({ one: 400, two: 1200, three: 1800, four: 2400 });
    expect(activeHeadingId(entries, at, OFFSET)).toBeNull();
  });

  it('selects the heading once it passes the offset', () => {
    const at = tops({ one: 90, two: 900, three: 1500, four: 2100 });
    expect(activeHeadingId(entries, at, OFFSET)).toBe('one');
  });

  it('keeps the section selected while reading well past its heading', () => {
    // The heading is far above the viewport and the next is far below it —
    // the case a band-based test gets wrong by highlighting nothing.
    const at = tops({ one: -1800, two: -830, three: 640, four: 1400 });
    expect(activeHeadingId(entries, at, OFFSET)).toBe('two');
  });

  it('selects the last heading scrolled past, not the first', () => {
    const at = tops({ one: -3000, two: -2000, three: -1000, four: -50 });
    expect(activeHeadingId(entries, at, OFFSET)).toBe('four');
  });

  it('moves back up when the reader scrolls back', () => {
    const down = tops({ one: -2000, two: -900, three: -100, four: 500 });
    const up = tops({ one: -400, two: 700, three: 1500, four: 2100 });
    expect(activeHeadingId(entries, down, OFFSET)).toBe('three');
    expect(activeHeadingId(entries, up, OFFSET)).toBe('one');
  });

  it('treats a heading exactly on the offset as reached', () => {
    const at = tops({ one: OFFSET, two: 500, three: 900, four: 1300 });
    expect(activeHeadingId(entries, at, OFFSET)).toBe('one');
  });

  it('skips headings whose element is missing', () => {
    // A heading that has not rendered must not swallow the selection from the
    // one before it.
    const at = tops({ one: -500, two: null, three: null, four: 900 });
    expect(activeHeadingId(entries, at, OFFSET)).toBe('one');
  });

  it('handles an article with no headings', () => {
    expect(activeHeadingId([], () => null, OFFSET)).toBeNull();
  });
});
