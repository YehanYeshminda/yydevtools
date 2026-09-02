import { describe, expect, it } from 'vitest';

import { ZOOM_STEPS, fitScale, resolveScale, stepZoom } from './page-fit';

describe('fitScale', () => {
  it('shrinks a page that is wider than the space for it', () => {
    // An A4 page in a 600px column.
    expect(fitScale(794, 600)).toBeCloseTo(0.7557, 4);
  });

  it('never enlarges a page that already fits', () => {
    expect(fitScale(794, 1200)).toBe(1);
  });

  it('goes below the smallest step rather than failing to fit', () => {
    // A landscape A3 on a phone. Tiny, but "fit width" has to mean it.
    expect(fitScale(1587, 320)).toBeLessThan(ZOOM_STEPS[0]);
  });

  it('falls back to 1 before anything has been measured', () => {
    expect(fitScale(0, 600)).toBe(1);
    expect(fitScale(794, 0)).toBe(1);
  });
});

describe('resolveScale', () => {
  it('measures the space when asked to fit', () => {
    expect(resolveScale('fit', 800, 400)).toBe(0.5);
  });

  it('uses an explicit scale as given', () => {
    expect(resolveScale(1.5, 800, 400)).toBe(1.5);
  });

  it('clamps an explicit scale to the offered range', () => {
    expect(resolveScale(99, 800, 400)).toBe(3);
    expect(resolveScale(0.01, 800, 400)).toBe(0.25);
  });
});

describe('stepZoom', () => {
  it('moves between the offered steps', () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
  });

  it('moves to the nearest step from an arbitrary fit scale', () => {
    // 0.7557 is what an A4 page in a 600px column works out at.
    expect(stepZoom(0.7557, 1)).toBe(1);
    expect(stepZoom(0.7557, -1)).toBe(0.75);
  });

  it('stops at each end, which is how the buttons know to disable', () => {
    expect(stepZoom(3, 1)).toBe(3);
    expect(stepZoom(0.25, -1)).toBe(0.25);
  });

  it('does not stall on a value that is already a step', () => {
    // Guards the float comparison: 0.75 must step to 0.5, not back to itself.
    expect(stepZoom(0.75, -1)).toBe(0.5);
    expect(stepZoom(0.75, 1)).toBe(1);
  });
});
