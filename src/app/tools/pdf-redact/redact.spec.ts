import { describe, expect, it } from 'vitest';

import { dragBox, findBoxes } from './redact';

const A4 = { width: 600, height: 800 };

describe('findBoxes', () => {
  it('covers a whole run when the query is the run', () => {
    const [box] = findBoxes(
      0,
      [{ str: 'secret', x: 100, y: 700, width: 60, height: 10 }],
      'SECRET',
      A4,
    );
    // 1.5 pt of padding on each side.
    expect(box.x * A4.width).toBeCloseTo(98.5);
    expect(box.width * A4.width).toBeCloseTo(63);
    // Top edge: page top minus (baseline 700 + height 10 + pad 1.5) → 800 - 711.5.
    expect(box.y * A4.height).toBeCloseTo(88.5);
    expect(box.height * A4.height).toBeCloseTo(13);
  });

  it('places a substring by its share of the run, and finds every occurrence', () => {
    // "aa bb aa": each char is 10 pt wide, so the second "aa" starts at 60.
    const boxes = findBoxes(2, [{ str: 'aa bb aa', x: 0, y: 0, width: 80, height: 10 }], 'aa', A4);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].x * A4.width).toBeCloseTo(-1.5);
    expect(boxes[1].x * A4.width).toBeCloseTo(58.5);
    expect(boxes[1].width * A4.width).toBeCloseTo(23);
    expect(boxes.every((b) => b.page === 2)).toBe(true);
  });

  it('returns nothing for a blank query', () => {
    expect(findBoxes(0, [{ str: 'x', x: 0, y: 0, width: 1, height: 1 }], '  ', A4)).toEqual([]);
  });
});

describe('dragBox', () => {
  it('normalises the corners and clamps to the page', () => {
    expect(dragBox(1, { x: 0.8, y: 0.9 }, { x: 0.2, y: 1.4 })).toEqual({
      page: 1,
      x: 0.2,
      y: 0.9,
      width: 0.6000000000000001,
      height: 0.09999999999999998,
    });
  });
});
