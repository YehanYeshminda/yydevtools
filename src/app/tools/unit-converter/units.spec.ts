import { CATEGORIES, categoryById, convert, convertAll, format, unitById } from './units';

function c(id: string) {
  const category = categoryById(id);
  if (!category) {
    throw new Error(`no category ${id}`);
  }
  return category;
}

describe('units', () => {
  describe('the tables themselves', () => {
    it('gives every category a base unit that exists and is 1', () => {
      for (const category of CATEGORIES) {
        const base = unitById(category, category.base);
        expect(base, `${category.id} base`).toBeDefined();
        expect(base!.factor, `${category.id} base factor`).toBe(1);
      }
    });

    it('gives every category defaults that exist', () => {
      for (const category of CATEGORIES) {
        expect(unitById(category, category.from), `${category.id} from`).toBeDefined();
        expect(unitById(category, category.to), `${category.id} to`).toBeDefined();
      }
    });

    it('uses a unique id for every unit', () => {
      for (const category of CATEGORIES) {
        const ids = category.units.map((unit) => unit.id);
        expect(new Set(ids).size, `${category.id} ids`).toBe(ids.length);
      }
    });
  });

  describe('length', () => {
    it('converts metric to imperial', () => {
      expect(convert(1, c('length'), 'm', 'ft')).toBeCloseTo(3.280839895, 8);
      expect(convert(1, c('length'), 'in', 'cm')).toBeCloseTo(2.54, 10);
      expect(convert(1, c('length'), 'mi', 'km')).toBeCloseTo(1.609344, 10);
    });

    it('round-trips', () => {
      const there = convert(12.5, c('length'), 'yd', 'mm');
      expect(convert(there, c('length'), 'mm', 'yd')).toBeCloseTo(12.5, 10);
    });
  });

  // The one category that is not a ratio: the scales have different zeros, so
  // a factor table cannot express them.
  describe('temperature', () => {
    it('converts the fixed points', () => {
      expect(convert(0, c('temperature'), 'c', 'f')).toBe(32);
      expect(convert(100, c('temperature'), 'c', 'f')).toBe(212);
      expect(convert(0, c('temperature'), 'c', 'k')).toBeCloseTo(273.15, 10);
      expect(convert(-40, c('temperature'), 'c', 'f')).toBeCloseTo(-40, 10);
    });

    it('converts back', () => {
      expect(convert(98.6, c('temperature'), 'f', 'c')).toBeCloseTo(37, 10);
      expect(convert(300, c('temperature'), 'k', 'c')).toBeCloseTo(26.85, 10);
      expect(convert(212, c('temperature'), 'f', 'k')).toBeCloseTo(373.15, 10);
    });

    it('leaves a unit alone when converting to itself', () => {
      expect(convert(21.5, c('temperature'), 'f', 'f')).toBeCloseTo(21.5, 10);
    });
  });

  describe('data', () => {
    // The distinction the whole category exists for.
    it('keeps the 1000 and 1024 families apart', () => {
      expect(convert(1, c('data'), 'mib', 'byte')).toBe(1048576);
      expect(convert(1, c('data'), 'mb', 'byte')).toBe(1000000);
      expect(convert(1, c('data'), 'gib', 'gb')).toBeCloseTo(1.073741824, 9);
    });

    it('converts bits to bytes', () => {
      expect(convert(8, c('data'), 'bit', 'byte')).toBe(1);
    });
  });

  describe('mass', () => {
    it('keeps the two tons apart', () => {
      expect(convert(1, c('mass'), 'uston', 'kg')).toBeCloseTo(907.18474, 6);
      expect(convert(1, c('mass'), 'ukton', 'kg')).toBeCloseTo(1016.0469088, 6);
    });

    it('converts stones to pounds', () => {
      expect(convert(1, c('mass'), 'st', 'lb')).toBeCloseTo(14, 8);
    });
  });

  describe('volume', () => {
    it('keeps the US and UK gallons apart', () => {
      expect(convert(1, c('volume'), 'usgal', 'l')).toBeCloseTo(3.785411784, 9);
      expect(convert(1, c('volume'), 'ukgal', 'l')).toBeCloseTo(4.54609, 9);
    });
  });

  describe('speed', () => {
    it('converts the everyday pairs', () => {
      expect(convert(100, c('speed'), 'kph', 'mph')).toBeCloseTo(62.13711922, 6);
      expect(convert(1, c('speed'), 'kn', 'kph')).toBeCloseTo(1.852, 9);
    });
  });

  describe('convert', () => {
    it('returns NaN rather than a number for a missing unit', () => {
      expect(convert(1, c('length'), 'm', 'furlong')).toBeNaN();
    });

    it('returns NaN for input that is not a number', () => {
      expect(convert(Number.NaN, c('length'), 'm', 'ft')).toBeNaN();
      expect(convert(Number.POSITIVE_INFINITY, c('length'), 'm', 'ft')).toBeNaN();
    });
  });

  describe('format', () => {
    it('keeps a plain number plain', () => {
      expect(format(42)).toBe('42');
      expect(format(0)).toBe('0');
    });

    // toPrecision pads with zeros that claim a precision the conversion never had.
    it('strips trailing zeros', () => {
      expect(format(1.5)).toBe('1.5');
      expect(format(2.54)).toBe('2.54');
    });

    it('falls back to exponents at the extremes', () => {
      expect(format(1e20)).toContain('e+');
      expect(format(1e-9)).toContain('e-');
    });

    it('says nothing for a non-number', () => {
      expect(format(Number.NaN)).toBe('');
    });
  });

  describe('convertAll', () => {
    it('covers every unit of the category', () => {
      const rows = convertAll(1, c('length'), 'm');
      expect(rows.length).toBe(c('length').units.length);
      expect(rows.find((row) => row.unit.id === 'cm')?.value).toBeCloseTo(100, 10);
      expect(rows.find((row) => row.unit.id === 'm')?.value).toBe(1);
    });
  });
});
