import {
  diffFrames,
  formatRatio,
  planPages,
  statusFor,
  summarise,
  type Frame,
  type PageStatus,
} from './diff';

/** A frame of one repeated colour. */
function flat(width: number, height: number, [r, g, b]: number[]): Frame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let at = 0; at < data.length; at += 4) {
    data.set([r, g, b, 255], at);
  }
  return { width, height, data };
}

/** Paints one pixel of an existing frame. */
function paint(frame: Frame, x: number, y: number, [r, g, b]: number[]): Frame {
  const at = (y * frame.width + x) * 4;
  frame.data.set([r, g, b, 255], at);
  return frame;
}

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

describe('diffFrames', () => {
  it('finds nothing between two identical frames', () => {
    const result = diffFrames(flat(4, 4, WHITE), flat(4, 4, WHITE));
    expect(result.changed).toBe(0);
    expect(result.ratio).toBe(0);
    expect(result.compared).toBe(16);
  });

  it('finds the one pixel that moved', () => {
    const result = diffFrames(flat(4, 4, WHITE), paint(flat(4, 4, WHITE), 2, 1, BLACK));
    expect(result.changed).toBe(1);
    expect(result.ratio).toBe(1 / 16);
  });

  // The same renderer at the same scale is deterministic, but a file that has
  // been through another tool can come back with slightly different edges. A
  // page glowing red over that would be worse than useless.
  it('ignores a difference too small to see', () => {
    const almost = flat(2, 2, [250, 250, 250]);
    expect(diffFrames(flat(2, 2, WHITE), almost).changed).toBe(0);
  });

  it('does not ignore a difference that is visible', () => {
    expect(diffFrames(flat(2, 2, WHITE), flat(2, 2, [230, 230, 230])).changed).toBe(4);
  });

  // Cropping to the smaller page would call a longer page identical.
  it('compares the union of two different page sizes', () => {
    const result = diffFrames(flat(2, 2, WHITE), flat(2, 4, WHITE));
    expect(result.width).toBe(2);
    expect(result.height).toBe(4);
    expect(result.compared).toBe(8);
    // The strip that exists in only one of them is a difference.
    expect(result.changed).toBe(4);
  });

  describe('the overlay', () => {
    it('is the size of the union, in RGBA', () => {
      const result = diffFrames(flat(3, 2, WHITE), flat(2, 5, WHITE));
      expect(result.overlay.length).toBe(3 * 5 * 4);
    });

    it('marks a changed pixel red and leaves it opaque', () => {
      const result = diffFrames(flat(1, 1, WHITE), flat(1, 1, BLACK));
      expect(Array.from(result.overlay)).toEqual([214, 40, 40, 255]);
    });

    it('ghosts an unchanged pixel rather than dropping it', () => {
      const result = diffFrames(flat(1, 1, BLACK), flat(1, 1, BLACK));
      const [r, g, b, a] = result.overlay;
      // Black at 12% over white: visible, but clearly background.
      expect(r).toBe(224);
      expect(g).toBe(224);
      expect(b).toBe(224);
      expect(a).toBe(255);
    });
  });

  it('handles an empty frame without dividing by zero', () => {
    const empty: Frame = { width: 0, height: 0, data: new Uint8ClampedArray(0) };
    expect(diffFrames(empty, empty)).toMatchObject({ changed: 0, compared: 0, ratio: 0 });
  });
});

describe('planPages', () => {
  it('pairs pages by position', () => {
    expect(planPages(2, 2)).toEqual([
      { index: 0, inA: true, inB: true },
      { index: 1, inA: true, inB: true },
    ]);
  });

  it('covers the longer document', () => {
    expect(planPages(1, 3)).toHaveLength(3);
    expect(planPages(1, 3)[2]).toEqual({ index: 2, inA: false, inB: true });
  });

  it('copes with one side being empty', () => {
    expect(planPages(0, 2).every((plan) => !plan.inA)).toBe(true);
    expect(planPages(0, 0)).toEqual([]);
  });
});

describe('statusFor', () => {
  it('reports a page missing from one side', () => {
    expect(statusFor({ index: 0, inA: true, inB: false }, 0)).toBe('only-a');
    expect(statusFor({ index: 0, inA: false, inB: true }, 0)).toBe('only-b');
  });

  it('reports same or changed on the strength of the ratio', () => {
    const both = { index: 0, inA: true, inB: true };
    expect(statusFor(both, 0)).toBe('same');
    expect(statusFor(both, 0.0001)).toBe('changed');
  });
});

describe('summarise', () => {
  const statuses = (...list: PageStatus[]): PageStatus[] => list;

  it('says so when everything matches', () => {
    expect(summarise(statuses('same', 'same'))).toBe('All 2 pages are identical.');
    expect(summarise(statuses('same'))).toBe('The page is identical.');
  });

  it('counts the pages that differ', () => {
    expect(summarise(statuses('same', 'changed', 'only-b'))).toBe('2 of 3 pages differ.');
    expect(summarise(statuses('changed', 'same'))).toBe('1 of 2 pages differs.');
  });

  it('has something to say about nothing', () => {
    expect(summarise([])).toBe('Nothing to compare.');
  });
});

describe('formatRatio', () => {
  it('never rounds a real difference down to nothing', () => {
    expect(formatRatio(0)).toBe('0%');
    expect(formatRatio(0.00001)).toBe('<0.1%');
  });

  it('gets more precise as the number gets smaller', () => {
    expect(formatRatio(0.0042)).toBe('0.42%');
    expect(formatRatio(0.35)).toBe('35.0%');
  });
});
