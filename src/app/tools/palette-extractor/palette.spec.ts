import { extractPalette, readableOn } from './palette';

/** An RGBA buffer from a list of [r, g, b, a?] pixels. */
function pixels(...list: number[][]): Uint8ClampedArray {
  return new Uint8ClampedArray(list.flatMap(([r, g, b, a = 255]) => [r, g, b, a]));
}

/** `count` copies of one colour. */
function run(colour: number[], count: number): number[][] {
  return Array.from({ length: count }, () => colour);
}

const RED = [255, 0, 0];
const GREEN = [0, 255, 0];
const BLUE = [0, 0, 255];

describe('extractPalette', () => {
  it('finds the colours in a flat image', () => {
    const palette = extractPalette(pixels(...run(RED, 6), ...run(BLUE, 2)), 2);
    expect(palette.map((entry) => entry.rgb)).toEqual([
      { r: 255, g: 0, b: 0, a: 1 },
      { r: 0, g: 0, b: 255, a: 1 },
    ]);
  });

  it('orders by share, biggest first, and the shares sum to one', () => {
    const palette = extractPalette(pixels(...run(BLUE, 1), ...run(RED, 7), ...run(GREEN, 2)), 3);
    expect(palette.map((entry) => entry.share)).toEqual([0.7, 0.2, 0.1]);
  });

  // A two-colour logo has two colours in it. Padding the list out with repeats
  // would be a palette that lies about the picture.
  it('returns fewer than asked when the image holds fewer', () => {
    expect(extractPalette(pixels(...run(RED, 4), ...run(BLUE, 4)), 8)).toHaveLength(2);
  });

  it('returns one colour for a single flat colour', () => {
    const palette = extractPalette(pixels(...run(RED, 10)), 5);
    expect(palette).toHaveLength(1);
    expect(palette[0]).toEqual({ rgb: { r: 255, g: 0, b: 0, a: 1 }, share: 1 });
  });

  it('averages a box rather than picking one of its pixels', () => {
    const palette = extractPalette(pixels([100, 100, 100], [200, 200, 200]), 1);
    expect(palette[0].rgb).toEqual({ r: 150, g: 150, b: 150, a: 1 });
  });

  // Splitting at the median of the pixels, not the midpoint of the range: a
  // photo that is 90% sky must not keep re-splitting the same box.
  it('separates a dominant colour from a scattered minority', () => {
    const sky = run([120, 170, 220], 90);
    const sun = run([250, 210, 60], 10);
    const palette = extractPalette(pixels(...sky, ...sun), 2);
    expect(palette[0].share).toBeCloseTo(0.9);
    expect(palette[0].rgb).toEqual({ r: 120, g: 170, b: 220, a: 1 });
    expect(palette[1].rgb).toEqual({ r: 250, g: 210, b: 60, a: 1 });
  });

  it('is deterministic — the same image gives the same palette', () => {
    const data = pixels(...run(RED, 5), ...run(GREEN, 3), ...run(BLUE, 4));
    expect(extractPalette(data, 3)).toEqual(extractPalette(data, 3));
  });

  describe('transparency', () => {
    it('ignores pixels that are not really there', () => {
      const palette = extractPalette(pixels([255, 0, 0, 255], [0, 0, 255, 0]), 4);
      expect(palette).toEqual([{ rgb: { r: 255, g: 0, b: 0, a: 1 }, share: 1 }]);
    });

    it('returns nothing for a fully transparent image', () => {
      expect(extractPalette(pixels([255, 0, 0, 0], [0, 255, 0, 0]), 4)).toEqual([]);
    });
  });

  it('returns nothing for no pixels, or no colours asked for', () => {
    expect(extractPalette(new Uint8ClampedArray(0), 5)).toEqual([]);
    expect(extractPalette(pixels(RED), 0)).toEqual([]);
  });
});

describe('readableOn', () => {
  it('puts black on light colours and white on dark ones', () => {
    expect(readableOn({ r: 255, g: 255, b: 255, a: 1 })).toBe('#000000');
    expect(readableOn({ r: 0, g: 0, b: 0, a: 1 })).toBe('#ffffff');
  });

  // The case a naive channel average gets wrong: pure blue is dark to the eye,
  // pure green is light, and their averages are identical.
  it('weights the channels, so blue is dark and green is light', () => {
    expect(readableOn({ r: 0, g: 0, b: 255, a: 1 })).toBe('#ffffff');
    expect(readableOn({ r: 0, g: 255, b: 0, a: 1 })).toBe('#000000');
  });
});
