import { describe, expect, it } from 'vitest';

import { centeredOrigin, displaySize, numberLabel, numberOrigin, toPageFrame } from './layout';

describe('toPageFrame', () => {
  // A 595×842 portrait page stored with /Rotate 90 displays as 842×595 landscape.
  const W = 595;
  const H = 842;

  it('is the identity for an unrotated page', () => {
    expect(toPageFrame({ x: 10, y: 20 }, 0, W, H)).toEqual({ x: 10, y: 20 });
  });

  it('maps the displayed corners of a /Rotate 90 page onto the stored corners', () => {
    // Display bottom-left is the stored bottom-right (the right edge became the bottom).
    expect(toPageFrame({ x: 0, y: 0 }, 90, W, H)).toEqual({ x: W, y: 0 });
    // Display top-left is the stored bottom-left.
    expect(toPageFrame({ x: 0, y: W }, 90, W, H)).toEqual({ x: 0, y: 0 });
    // Display top-right is the stored top-left.
    expect(toPageFrame({ x: H, y: W }, 90, W, H)).toEqual({ x: 0, y: H });
  });

  it('maps /Rotate 180 and 270 as well', () => {
    expect(toPageFrame({ x: 0, y: 0 }, 180, W, H)).toEqual({ x: W, y: H });
    expect(toPageFrame({ x: 0, y: 0 }, 270, W, H)).toEqual({ x: 0, y: H });
    expect(toPageFrame({ x: 0, y: 0 }, -90, W, H)).toEqual(toPageFrame({ x: 0, y: 0 }, 270, W, H));
  });
});

describe('displaySize', () => {
  it('swaps the axes for a sideways page', () => {
    expect(displaySize(90, 595, 842)).toEqual({ width: 842, height: 595 });
    expect(displaySize(180, 595, 842)).toEqual({ width: 595, height: 842 });
  });
});

describe('centeredOrigin', () => {
  it('centres unrotated text by half its box', () => {
    expect(centeredOrigin({ x: 100, y: 100 }, 40, 10, 0)).toEqual({ x: 80, y: 95 });
  });

  it('centres text rotated a quarter turn: the box now stands upright', () => {
    const origin = centeredOrigin({ x: 100, y: 100 }, 40, 10, 90);
    // Baseline runs upward from the origin, so the origin sits below the centre
    // and to its right by half the text height.
    expect(origin.x).toBeCloseTo(105);
    expect(origin.y).toBeCloseTo(80);
  });
});

describe('numberOrigin', () => {
  const page = { width: 600, height: 800 };

  it('places each position with the margin honoured', () => {
    expect(numberOrigin('bottom-center', page, 50, 10, 30)).toEqual({ x: 275, y: 30 });
    expect(numberOrigin('bottom-right', page, 50, 10, 30)).toEqual({ x: 520, y: 30 });
    expect(numberOrigin('bottom-left', page, 50, 10, 30)).toEqual({ x: 30, y: 30 });
    expect(numberOrigin('top-center', page, 50, 10, 30)).toEqual({ x: 275, y: 760 });
    expect(numberOrigin('top-right', page, 50, 10, 30)).toEqual({ x: 520, y: 760 });
  });
});

describe('numberLabel', () => {
  it('formats every style', () => {
    expect(numberLabel('n', 3, 9)).toBe('3');
    expect(numberLabel('page-n', 3, 9)).toBe('Page 3');
    expect(numberLabel('page-n-of-total', 3, 9)).toBe('Page 3 of 9');
    expect(numberLabel('n-of-total', 3, 9)).toBe('3 / 9');
  });
});
