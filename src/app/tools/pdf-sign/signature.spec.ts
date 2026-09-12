import { describe, expect, it } from 'vitest';

import { clamp, toPdfRect } from './signature';

const A4 = { width: 595, height: 842 };

describe('toPdfRect', () => {
  it('flips the y axis: a signature near the top of the screen lands near the top of the page', () => {
    // 30% wide, image twice as wide as tall, placed at the top-left corner.
    const rect = toPdfRect({ page: 0, x: 0, y: 0, width: 0.3 }, A4, 0.5);
    expect(rect.width).toBeCloseTo(178.5);
    expect(rect.height).toBeCloseTo(89.25);
    expect(rect.x).toBe(0);
    // pdf-lib's y is the bottom edge, measured from the page bottom.
    expect(rect.y).toBeCloseTo(842 - 89.25);
  });

  it('puts a bottom-right placement at the bottom-right in points', () => {
    const rect = toPdfRect({ page: 0, x: 0.7, y: 0.9, width: 0.3 }, A4, 0.25);
    expect(rect.x).toBeCloseTo(416.5);
    expect(rect.x + rect.width).toBeCloseTo(595);
    // Top edge at 90% down, so the bottom edge is that minus the height.
    expect(rect.y).toBeCloseTo(842 - 0.9 * 842 - rect.height);
  });
});

describe('clamp', () => {
  it('keeps the signature on the page', () => {
    const inside = clamp({ page: 0, x: 0.95, y: 1.2, width: 0.3 }, 0.1);
    expect(inside.x).toBeCloseTo(0.7);
    expect(inside.y).toBeCloseTo(0.9);
    expect(clamp({ page: 0, x: -1, y: -1, width: 0.3 }, 0.1)).toMatchObject({ x: 0, y: 0 });
  });
});
