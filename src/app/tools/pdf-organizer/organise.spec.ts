import { describe, expect, it } from 'vitest';

import {
  A4,
  addTurns,
  countByDocument,
  insertBlankAfter,
  movePage,
  pagesForDocument,
  removePages,
  reversePages,
  rotatePages,
  type Page,
} from './organise';

const size = { width: 600, height: 800 };

/** Three pages from document 0, ids p0..p2. */
function threePages(): Page[] {
  return pagesForDocument(0, [size, size, size], 0);
}

const ids = (pages: readonly Page[]) => pages.map((page) => page.id);

describe('pagesForDocument', () => {
  it('numbers pages from zero and keeps their size', () => {
    const pages = pagesForDocument(2, [{ width: 10, height: 20 }], 7);
    expect(pages).toEqual([
      { kind: 'source', id: 'p7', doc: 2, index: 0, rotation: 0, width: 10, height: 20 },
    ]);
  });

  it('offsets ids so two documents do not collide', () => {
    const first = pagesForDocument(0, [size, size], 0);
    const second = pagesForDocument(1, [size], first.length);
    expect([...ids(first), ...ids(second)]).toEqual(['p0', 'p1', 'p2']);
  });
});

describe('movePage', () => {
  it('moves a page forwards', () => {
    expect(ids(movePage(threePages(), 0, 2))).toEqual(['p1', 'p2', 'p0']);
  });

  it('moves a page backwards', () => {
    expect(ids(movePage(threePages(), 2, 0))).toEqual(['p2', 'p0', 'p1']);
  });

  it('treats the target as a position in the list after the page is lifted out', () => {
    // Dragging the first page to the last slot must put it last.
    const pages = threePages();
    expect(ids(movePage(pages, 0, pages.length - 1))).toEqual(['p1', 'p2', 'p0']);
  });

  it('clamps a target past the end', () => {
    expect(ids(movePage(threePages(), 0, 99))).toEqual(['p1', 'p2', 'p0']);
  });

  it('is a no-op for an unchanged position or an index out of range', () => {
    const pages = threePages();
    expect(movePage(pages, 1, 1)).toBe(pages);
    expect(movePage(pages, 5, 0)).toBe(pages);
    expect(movePage(pages, -1, 0)).toBe(pages);
  });
});

describe('addTurns', () => {
  it('wraps clockwise', () => {
    expect(addTurns(270, 1)).toBe(0);
    expect(addTurns(0, 1)).toBe(90);
  });

  it('wraps anticlockwise', () => {
    expect(addTurns(0, -1)).toBe(270);
    expect(addTurns(90, -1)).toBe(0);
  });

  it('normalises many turns', () => {
    expect(addTurns(90, 8)).toBe(90);
    expect(addTurns(90, -8)).toBe(90);
    expect(addTurns(0, 6)).toBe(180);
  });
});

describe('rotatePages', () => {
  const rotate = (pages: Page[], selected: string[], turns: number) =>
    rotatePages(pages, new Set(selected), turns);

  it('rotates only the selected pages', () => {
    const next = rotate(threePages(), ['p1'], 1);
    expect(next.map((page) => page.rotation)).toEqual([0, 90, 0]);
  });

  it('accumulates across calls', () => {
    let pages = threePages();
    pages = rotate(pages, ['p0'], 1);
    pages = rotate(pages, ['p0'], 1);
    expect(pages[0].rotation).toBe(180);
  });

  it('is a no-op with an empty selection', () => {
    const pages = threePages();
    expect(rotate(pages, [], 1)).toBe(pages);
  });
});

describe('removePages', () => {
  it('drops the selected pages', () => {
    expect(ids(removePages(threePages(), new Set(['p0', 'p2'])))).toEqual(['p1']);
  });

  it('is a no-op with an empty selection', () => {
    const pages = threePages();
    expect(removePages(pages, new Set())).toBe(pages);
  });

  it('can empty the list', () => {
    expect(removePages(threePages(), new Set(['p0', 'p1', 'p2']))).toEqual([]);
  });
});

describe('insertBlankAfter', () => {
  it('inserts after the given page', () => {
    expect(ids(insertBlankAfter(threePages(), 0, 'b1'))).toEqual(['p0', 'b1', 'p1', 'p2']);
  });

  it('inserts at the very start for -1', () => {
    expect(ids(insertBlankAfter(threePages(), -1, 'b1'))).toEqual(['b1', 'p0', 'p1', 'p2']);
  });

  it('takes the size of the page it follows', () => {
    const pages = pagesForDocument(0, [{ width: 1000, height: 500 }], 0);
    const next = insertBlankAfter(pages, 0, 'b1');
    expect(next[1]).toMatchObject({ kind: 'blank', width: 1000, height: 500, rotation: 0 });
  });

  it('falls back to A4 when there is nothing to copy from', () => {
    expect(insertBlankAfter([], -1, 'b1')[0]).toMatchObject({
      width: A4.width,
      height: A4.height,
    });
  });
});

describe('reversePages', () => {
  it('reverses without mutating the input', () => {
    const pages = threePages();
    expect(ids(reversePages(pages))).toEqual(['p2', 'p1', 'p0']);
    expect(ids(pages)).toEqual(['p0', 'p1', 'p2']);
  });
});

describe('countByDocument', () => {
  it('counts source pages per document and ignores blanks', () => {
    const pages = [
      ...pagesForDocument(0, [size, size], 0),
      ...pagesForDocument(1, [size], 2),
    ];
    const withBlank = insertBlankAfter(pages, 0, 'b1');
    expect([...countByDocument(withBlank).entries()].sort()).toEqual([
      [0, 2],
      [1, 1],
    ]);
  });
});
