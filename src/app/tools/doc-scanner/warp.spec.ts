import { describe, expect, it } from 'vitest';

import { applyFilter, defaultQuad, outputSize, rectToQuad, warp, type Quad } from './warp';

// vitest runs in Node, which has no ImageData; a minimal stand-in is enough.
class FakeImageData {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}
(globalThis as { ImageData?: unknown }).ImageData = FakeImageData;

describe('defaultQuad', () => {
  it('shaves a small border off the photo', () => {
    const [tl, , br] = defaultQuad(1000, 500);
    expect(tl).toEqual({ x: 40, y: 20 });
    expect(br).toEqual({ x: 960, y: 480 });
  });
});

describe('outputSize', () => {
  it('uses the longer of each pair of opposite edges, capped at maxSide', () => {
    const quad: Quad = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 300, y: 200 },
      { x: 0, y: 200 },
    ];
    expect(outputSize(quad, 10_000)).toEqual({ width: 400, height: 224 });
    expect(outputSize(quad, 200)).toEqual({ width: 200, height: 112 });
  });
});

describe('rectToQuad', () => {
  it('maps the output corners exactly onto the quad', () => {
    const quad: Quad = [
      { x: 10, y: 20 },
      { x: 90, y: 15 },
      { x: 95, y: 80 },
      { x: 5, y: 70 },
    ];
    const [a, b, c, d, e, f, g, h] = rectToQuad(quad, 100, 60);
    const map = (x: number, y: number) => {
      const w = g * x + h * y + 1;
      return { x: (a * x + b * y + c) / w, y: (d * x + e * y + f) / w };
    };
    for (const [x, y, expected] of [
      [0, 0, quad[0]],
      [100, 0, quad[1]],
      [100, 60, quad[2]],
      [0, 60, quad[3]],
    ] as const) {
      const got = map(x, y);
      expect(got.x).toBeCloseTo(expected.x, 6);
      expect(got.y).toBeCloseTo(expected.y, 6);
    }
  });
});

describe('warp', () => {
  it('copies pixels straight through when the quad is the whole image', () => {
    const src = new FakeImageData(4, 4) as unknown as ImageData;
    for (let i = 0; i < 16; i++) {
      src.data.set([i * 16, 0, 0, 255], i * 4);
    }
    const out = warp(
      src,
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ],
      4,
      4,
    );
    // Sampling at integer positions inside the image reproduces the source.
    expect(out.data[0]).toBe(0);
    expect(out.data[4]).toBe(16);
    expect(out.data[4 * 4]).toBe(64);
  });
});

describe('applyFilter', () => {
  it('turns a dark mark on a light page into pure black on white', () => {
    const img = new FakeImageData(40, 40) as unknown as ImageData;
    img.data.fill(200);
    // A 4×4 blot in the middle.
    for (let y = 18; y < 22; y++) {
      for (let x = 18; x < 22; x++) {
        img.data.set([40, 40, 40, 255], (y * 40 + x) * 4);
      }
    }
    applyFilter(img, 'bw');
    expect(img.data[(20 * 40 + 20) * 4]).toBe(0);
    expect(img.data[(2 * 40 + 2) * 4]).toBe(255);
  });

  it('leaves colour alone', () => {
    const img = new FakeImageData(1, 1) as unknown as ImageData;
    img.data.set([10, 20, 30, 255]);
    applyFilter(img, 'colour');
    expect([...img.data]).toEqual([10, 20, 30, 255]);
  });
});
