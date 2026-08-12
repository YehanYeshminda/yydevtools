import { describe, expect, it } from 'vitest';

import { dpiScale, MARGINS, PAGE_SIZES, placeImage } from './layout';

describe('placeImage — fit mode', () => {
  it('sizes the page to the image with no margin', () => {
    const p = placeImage({ width: 800, height: 600 }, 'fit', 'auto', 0);
    expect(p.page).toEqual({ width: 800, height: 600 });
    expect(p).toMatchObject({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('adds the margin as a uniform border and never scales the image', () => {
    const p = placeImage({ width: 800, height: 600 }, 'fit', 'auto', 18);
    expect(p.page).toEqual({ width: 836, height: 636 });
    expect(p).toMatchObject({ x: 18, y: 18, width: 800, height: 600 });
  });
});

describe('placeImage — fixed page, auto orientation', () => {
  it('uses a portrait page for a tall image', () => {
    const p = placeImage({ width: 600, height: 900 }, 'a4', 'auto', 0);
    expect(p.page).toEqual(PAGE_SIZES.a4);
  });

  it('uses a landscape page for a wide image', () => {
    const p = placeImage({ width: 900, height: 600 }, 'a4', 'auto', 0);
    expect(p.page).toEqual({ width: PAGE_SIZES.a4.height, height: PAGE_SIZES.a4.width });
  });

  it('preserves aspect ratio and centres the image', () => {
    const p = placeImage({ width: 1000, height: 500 }, 'letter', 'landscape', 0);
    // Aspect ratio is kept: width/height of the drawn box equals the source's.
    expect(p.width / p.height).toBeCloseTo(2, 5);
    // Centred: equal gaps on opposing edges.
    expect(p.x).toBeCloseTo((p.page.width - p.width) / 2, 5);
    expect(p.y).toBeCloseTo((p.page.height - p.height) / 2, 5);
    // Fits within the page.
    expect(p.width).toBeLessThanOrEqual(p.page.width + 1e-6);
    expect(p.height).toBeLessThanOrEqual(p.page.height + 1e-6);
  });

  it('leaves the requested margin on the constraining edge', () => {
    // A square image on portrait A4 is constrained by width.
    const p = placeImage({ width: 500, height: 500 }, 'a4', 'portrait', MARGINS.large);
    expect(p.x).toBeCloseTo(MARGINS.large, 4);
    expect(p.width).toBeCloseTo(PAGE_SIZES.a4.width - MARGINS.large * 2, 4);
  });
});

describe('placeImage — forced orientation overrides the image shape', () => {
  it('keeps a portrait page even for a wide image when asked', () => {
    const p = placeImage({ width: 1200, height: 300 }, 'a4', 'portrait', 0);
    expect(p.page).toEqual(PAGE_SIZES.a4);
    // A very wide image on a portrait page is limited by width, so it is short.
    expect(p.width).toBeCloseTo(PAGE_SIZES.a4.width, 4);
  });
});

describe('placeImage — degenerate input', () => {
  it('does not divide by zero on a zero-sized image', () => {
    const p = placeImage({ width: 0, height: 0 }, 'a4', 'auto', 0);
    expect(Number.isFinite(p.width)).toBe(true);
    expect(Number.isFinite(p.height)).toBe(true);
    expect(p.width).toBeGreaterThan(0);
  });

  it('clamps a margin wider than the page', () => {
    const p = placeImage({ width: 100, height: 100 }, 'a4', 'portrait', 100_000);
    expect(p.width).toBeGreaterThan(0);
    expect(p.height).toBeGreaterThan(0);
    expect(p.x).toBeGreaterThanOrEqual(0);
  });
});

describe('dpiScale', () => {
  it('is 1 at 72 DPI and scales linearly', () => {
    expect(dpiScale(72)).toBe(1);
    expect(dpiScale(144)).toBe(2);
    expect(dpiScale(150)).toBeCloseTo(2.0833, 3);
  });
});
