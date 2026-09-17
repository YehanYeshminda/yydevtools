import { describe, expect, it } from 'vitest';

import { applyAlpha, coverage, normaliseMask, parseHex, resampleAlpha } from './matte';

describe('normaliseMask', () => {
  it('stretches a low-contrast mask to the full range', () => {
    const out = normaliseMask(new Float32Array([0.2, 0.4, 0.6]));

    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo(0.5, 5);
    expect(out[2]).toBe(1);
  });

  it('treats a uniform mask as fully opaque rather than dividing by zero', () => {
    expect(Array.from(normaliseMask(new Float32Array([0.5, 0.5])))).toEqual([1, 1]);
  });

  it('treats an all-zero mask as empty', () => {
    expect(Array.from(normaliseMask(new Float32Array([0, 0])))).toEqual([0, 0]);
  });
});

describe('resampleAlpha', () => {
  it('returns one alpha value per pixel, scaled to 0-255', () => {
    const alpha = resampleAlpha(new Float32Array([0, 1, 1, 0]), 2, 4, 4);

    expect(alpha).toHaveLength(16);
    expect(Math.max(...alpha)).toBeLessThanOrEqual(255);
    expect(Math.min(...alpha)).toBeGreaterThanOrEqual(0);
  });

  it('keeps a constant mask constant at any size', () => {
    const alpha = resampleAlpha(new Float32Array([1, 1, 1, 1]), 2, 5, 3);

    expect(Array.from(alpha).every((value) => value === 255)).toBe(true);
  });

  it('interpolates between neighbours instead of stepping', () => {
    // A left-to-right ramp: the middle of a wide output must land between the
    // two source values, which nearest-neighbour would never produce.
    const alpha = resampleAlpha(new Float32Array([0, 1, 0, 1]), 2, 8, 1);
    const middle = alpha[4];

    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(255);
  });

  it('samples pixel centres, so the mask is not shifted', () => {
    const alpha = resampleAlpha(new Float32Array([0, 1, 0, 1]), 2, 2, 2);

    expect(Array.from(alpha)).toEqual([0, 255, 0, 255]);
  });
});

describe('applyAlpha', () => {
  it('writes the mask into the alpha channel when there is no background', () => {
    const pixels = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);

    applyAlpha(pixels, new Uint8ClampedArray([0, 128]), null);

    expect(Array.from(pixels)).toEqual([10, 20, 30, 0, 40, 50, 60, 128]);
  });

  it('composites onto a background and returns opaque pixels', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]);

    applyAlpha(pixels, new Uint8ClampedArray([0, 255]), { r: 255, g: 255, b: 255 });

    // Fully transparent becomes the background; fully opaque keeps the subject.
    expect(Array.from(pixels)).toEqual([255, 255, 255, 255, 0, 0, 0, 255]);
  });

  it('blends a half-transparent pixel with the background', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 255]);

    applyAlpha(pixels, new Uint8ClampedArray([128]), { r: 200, g: 100, b: 0 });

    expect(pixels[0]).toBeGreaterThan(90);
    expect(pixels[0]).toBeLessThan(110);
    expect(pixels[3]).toBe(255);
  });
});

describe('parseHex', () => {
  it('reads a colour with or without the hash', () => {
    expect(parseHex('#ff8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(parseHex('FF8000')).toEqual({ r: 255, g: 128, b: 0 });
  });

  it('rejects anything that is not six hex digits', () => {
    expect(parseHex('#fff')).toBeNull();
    expect(parseHex('white')).toBeNull();
    expect(parseHex('')).toBeNull();
  });
});

describe('coverage', () => {
  it('reports the share of the frame the subject kept', () => {
    expect(coverage(new Uint8ClampedArray([255, 255, 0, 0]))).toBe(50);
    expect(coverage(new Uint8ClampedArray([]))).toBe(0);
  });
});
