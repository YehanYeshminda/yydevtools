import { describe, expect, it } from 'vitest';

import {
  guides,
  mmToPx,
  photoFilename,
  photoPixels,
  sheetLayout,
  SHEETS,
  SPECS,
  type PhotoSpec,
} from './spec';

const bySlug = (key: string): PhotoSpec => {
  const found = SPECS.find((spec) => spec.key === key);
  if (!found) {
    throw new Error(`no spec ${key}`);
  }
  return found;
};

const sheet = (key: string) => {
  const found = SHEETS.find((entry) => entry.key === key);
  if (!found) {
    throw new Error(`no sheet ${key}`);
  }
  return found;
};

describe('mmToPx', () => {
  it('converts at the requested resolution', () => {
    expect(mmToPx(25.4, 300)).toBe(300);
    expect(mmToPx(25.4, 600)).toBe(600);
  });
});

describe('photoPixels', () => {
  it('gives the printed pixel size of a 35 × 45 mm photo at 300 dpi', () => {
    // The sizes every photo shop quotes for this format.
    expect(photoPixels(bySlug('uk-eu'), 300)).toEqual({ width: 413, height: 531 });
  });

  it('gives 600 × 600 for a US 2 × 2 inch photo at 300 dpi', () => {
    expect(photoPixels(bySlug('us'), 300)).toEqual({ width: 600, height: 600 });
  });

  it('doubles at 600 dpi', () => {
    const { width, height } = photoPixels(bySlug('us'), 600);

    expect({ width, height }).toEqual({ width: 1200, height: 1200 });
  });
});

describe('guides', () => {
  it('places the head inside the published range for every spec', () => {
    for (const spec of SPECS) {
      const { crown, chin } = guides(spec);
      const head = chin - crown;

      expect(head, spec.key).toBeGreaterThanOrEqual(spec.headMin);
      expect(head, spec.key).toBeLessThanOrEqual(spec.headMax);
    }
  });

  it('keeps the whole head inside the frame, with room above and below', () => {
    for (const spec of SPECS) {
      const { crown, chin } = guides(spec);

      expect(crown, spec.key).toBeGreaterThan(0);
      expect(chin, spec.key).toBeLessThan(1);
    }
  });

  it('leaves more room below the chin than above the crown', () => {
    // Room for shoulders: a head centred in the frame reads as a mugshot.
    for (const spec of SPECS) {
      const { crown, chin } = guides(spec);

      expect(1 - chin, spec.key).toBeGreaterThan(crown);
    }
  });

  it('puts the eyes where the US spec requires them', () => {
    // 1⅛ to 1⅜ inches from the bottom of a 2 inch photo.
    const { eyes } = guides(bySlug('us'));
    const fromBottom = 1 - eyes;

    expect(fromBottom).toBeGreaterThanOrEqual(1.125 / 2);
    expect(fromBottom).toBeLessThanOrEqual(1.375 / 2);
  });

  it('matches the UK crown position photo shops use', () => {
    // The UK example photo puts the crown about 5 mm below the top of 45 mm.
    const { crown } = guides(bySlug('uk-eu'));

    expect(crown * 45).toBeGreaterThan(4);
    expect(crown * 45).toBeLessThan(7);
  });
});

describe('sheetLayout', () => {
  it('fits eight 35 × 45 photos on a 6 × 4 print', () => {
    const layout = sheetLayout(bySlug('uk-eu'), sheet('6x4'), 300);

    // Four across the 152 mm edge and two down the 102 mm one. Photo shops
    // often print six, but that is their margin, not what the paper holds.
    expect(layout.count).toBe(8);
    expect(layout.columns).toBe(4);
    expect(layout.rows).toBe(2);
  });

  it('turns the sheet around when that fits more', () => {
    const layout = sheetLayout(bySlug('canada'), sheet('6x4'), 300);

    // 50 × 70 mm only fits the 152 mm edge horizontally, so the sheet is used
    // landscape — the arithmetic, not the caller, works that out.
    expect(layout.width).toBeGreaterThan(layout.height);
    expect(layout.count).toBeGreaterThan(0);
  });

  it('keeps the block of photos inside the sheet', () => {
    for (const spec of SPECS) {
      for (const paper of SHEETS) {
        const layout = sheetLayout(spec, paper, 300);
        const right =
          layout.offsetX + layout.columns * (layout.cellWidth + layout.gap) - layout.gap;
        const bottom = layout.offsetY + layout.rows * (layout.cellHeight + layout.gap) - layout.gap;

        expect(layout.offsetX, `${spec.key}/${paper.key}`).toBeGreaterThanOrEqual(0);
        expect(right, `${spec.key}/${paper.key}`).toBeLessThanOrEqual(layout.width);
        expect(bottom, `${spec.key}/${paper.key}`).toBeLessThanOrEqual(layout.height);
      }
    }
  });

  it('fits more on A4 than on a 6 × 4', () => {
    const small = sheetLayout(bySlug('uk-eu'), sheet('6x4'), 300);
    const large = sheetLayout(bySlug('uk-eu'), sheet('a4'), 300);

    expect(large.count).toBeGreaterThan(small.count);
  });

  it('scales the pixel numbers with the resolution but not the count', () => {
    const at300 = sheetLayout(bySlug('uk-eu'), sheet('6x4'), 300);
    const at600 = sheetLayout(bySlug('uk-eu'), sheet('6x4'), 600);

    expect(at600.count).toBe(at300.count);
    // Not exactly double: each is rounded to a whole pixel from the same
    // millimetres, so 413 at 300 dpi becomes 827 rather than 826 at 600.
    expect(Math.abs(at600.cellWidth - at300.cellWidth * 2)).toBeLessThanOrEqual(1);
  });
});

describe('photoFilename', () => {
  it('names a single photo by its size and resolution', () => {
    expect(photoFilename(bySlug('uk-eu'), 300, null)).toBe('passport-photo-35x45mm-300dpi.jpg');
  });

  it('names a sheet by the paper it is for', () => {
    expect(photoFilename(bySlug('uk-eu'), 600, sheet('6x4'))).toBe(
      'passport-photo-35x45mm-sheet-6x4-600dpi.jpg',
    );
  });
});
