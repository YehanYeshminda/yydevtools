/**
 * Unit conversion by way of a base unit.
 *
 * Every unit in a category declares what one of it is worth in that category's
 * base unit, so converting is two multiplications rather than a table of every
 * pair. Temperature is the exception and is handled separately: its scales are
 * affine, not linear, so a ratio cannot express them.
 */

export interface Unit {
  id: string;
  name: string;
  symbol: string;
  /** How many base units one of these is. Unused for temperature. */
  factor: number;
}

export interface Category {
  id: string;
  name: string;
  base: string;
  units: Unit[];
  /** Defaults for the two pickers, so the tool opens on a useful pair. */
  from: string;
  to: string;
}

function u(id: string, name: string, symbol: string, factor: number): Unit {
  return { id, name, symbol, factor };
}

export const CATEGORIES: Category[] = [
  {
    id: 'length',
    name: 'Length',
    base: 'm',
    from: 'cm',
    to: 'in',
    units: [
      u('mm', 'Millimetre', 'mm', 0.001),
      u('cm', 'Centimetre', 'cm', 0.01),
      u('m', 'Metre', 'm', 1),
      u('km', 'Kilometre', 'km', 1000),
      u('in', 'Inch', 'in', 0.0254),
      u('ft', 'Foot', 'ft', 0.3048),
      u('yd', 'Yard', 'yd', 0.9144),
      u('mi', 'Mile', 'mi', 1609.344),
      u('nmi', 'Nautical mile', 'nmi', 1852),
    ],
  },
  {
    id: 'mass',
    name: 'Weight',
    base: 'kg',
    from: 'kg',
    to: 'lb',
    units: [
      u('mg', 'Milligram', 'mg', 0.000001),
      u('g', 'Gram', 'g', 0.001),
      u('kg', 'Kilogram', 'kg', 1),
      u('t', 'Tonne', 't', 1000),
      u('oz', 'Ounce', 'oz', 0.028349523125),
      u('lb', 'Pound', 'lb', 0.45359237),
      u('st', 'Stone', 'st', 6.35029318),
      // The two tons differ by about 10%, which is exactly the sort of thing
      // that goes unnoticed, so both are named rather than offered as "ton".
      u('uston', 'US ton (short)', 'ton', 907.18474),
      u('ukton', 'UK ton (long)', 'ton', 1016.0469088),
    ],
  },
  {
    id: 'temperature',
    name: 'Temperature',
    base: 'c',
    from: 'c',
    to: 'f',
    units: [u('c', 'Celsius', '°C', 1), u('f', 'Fahrenheit', '°F', 1), u('k', 'Kelvin', 'K', 1)],
  },
  {
    id: 'volume',
    name: 'Volume',
    base: 'l',
    from: 'l',
    to: 'usgal',
    units: [
      u('ml', 'Millilitre', 'ml', 0.001),
      u('l', 'Litre', 'l', 1),
      u('m3', 'Cubic metre', 'm³', 1000),
      u('tsp', 'Teaspoon (US)', 'tsp', 0.00492892159375),
      u('tbsp', 'Tablespoon (US)', 'tbsp', 0.01478676478125),
      u('cup', 'Cup (US)', 'cup', 0.2365882365),
      u('usfloz', 'Fluid ounce (US)', 'fl oz', 0.0295735295625),
      u('ukfloz', 'Fluid ounce (UK)', 'fl oz', 0.0284130625),
      u('uspt', 'Pint (US)', 'pt', 0.473176473),
      u('ukpt', 'Pint (UK)', 'pt', 0.56826125),
      u('usgal', 'Gallon (US)', 'gal', 3.785411784),
      u('ukgal', 'Gallon (UK)', 'gal', 4.54609),
    ],
  },
  {
    id: 'speed',
    name: 'Speed',
    base: 'mps',
    from: 'kph',
    to: 'mph',
    units: [
      u('mps', 'Metres per second', 'm/s', 1),
      u('kph', 'Kilometres per hour', 'km/h', 1 / 3.6),
      u('mph', 'Miles per hour', 'mph', 0.44704),
      u('kn', 'Knot', 'kn', 1852 / 3600),
      u('fps', 'Feet per second', 'ft/s', 0.3048),
    ],
  },
  {
    id: 'area',
    name: 'Area',
    base: 'm2',
    from: 'm2',
    to: 'ft2',
    units: [
      u('mm2', 'Square millimetre', 'mm²', 0.000001),
      u('cm2', 'Square centimetre', 'cm²', 0.0001),
      u('m2', 'Square metre', 'm²', 1),
      u('ha', 'Hectare', 'ha', 10000),
      u('km2', 'Square kilometre', 'km²', 1000000),
      u('in2', 'Square inch', 'in²', 0.00064516),
      u('ft2', 'Square foot', 'ft²', 0.09290304),
      u('yd2', 'Square yard', 'yd²', 0.83612736),
      u('acre', 'Acre', 'acre', 4046.8564224),
      u('mi2', 'Square mile', 'mi²', 2589988.110336),
    ],
  },
  {
    id: 'data',
    name: 'Data',
    base: 'byte',
    from: 'mib',
    to: 'mb',
    units: [
      u('bit', 'Bit', 'bit', 0.125),
      u('byte', 'Byte', 'B', 1),
      u('kb', 'Kilobyte (1000)', 'kB', 1e3),
      u('mb', 'Megabyte (1000)', 'MB', 1e6),
      u('gb', 'Gigabyte (1000)', 'GB', 1e9),
      u('tb', 'Terabyte (1000)', 'TB', 1e12),
      u('kib', 'Kibibyte (1024)', 'KiB', 1024),
      u('mib', 'Mebibyte (1024)', 'MiB', 1024 ** 2),
      u('gib', 'Gibibyte (1024)', 'GiB', 1024 ** 3),
      u('tib', 'Tebibyte (1024)', 'TiB', 1024 ** 4),
    ],
  },
  {
    id: 'time',
    name: 'Time',
    base: 's',
    from: 'h',
    to: 'min',
    units: [
      u('ms', 'Millisecond', 'ms', 0.001),
      u('s', 'Second', 's', 1),
      u('min', 'Minute', 'min', 60),
      u('h', 'Hour', 'h', 3600),
      u('d', 'Day', 'd', 86400),
      u('wk', 'Week', 'wk', 604800),
      // A calendar month and year have no fixed length; these are the average
      // Gregorian ones, which is the only defensible constant to use.
      u('mo', 'Month (average)', 'mo', 2629746),
      u('yr', 'Year (average)', 'yr', 31556952),
    ],
  },
];

export function categoryById(id: string): Category | undefined {
  return CATEGORIES.find((category) => category.id === id);
}

export function unitById(category: Category, id: string): Unit | undefined {
  return category.units.find((unit) => unit.id === id);
}

/**
 * Celsius is the base, because it is the one the other two are defined
 * against and the offsets stay legible that way.
 */
function toCelsius(value: number, from: string): number {
  if (from === 'f') return ((value - 32) * 5) / 9;
  if (from === 'k') return value - 273.15;
  return value;
}

function fromCelsius(value: number, to: string): number {
  if (to === 'f') return (value * 9) / 5 + 32;
  if (to === 'k') return value + 273.15;
  return value;
}

/** Converts one value between two units of the same category. */
export function convert(value: number, category: Category, from: string, to: string): number {
  if (!Number.isFinite(value)) {
    return Number.NaN;
  }
  if (category.id === 'temperature') {
    return fromCelsius(toCelsius(value, from), to);
  }
  const source = unitById(category, from);
  const target = unitById(category, to);
  if (!source || !target) {
    return Number.NaN;
  }
  return (value * source.factor) / target.factor;
}

/**
 * Formats a converted number for reading.
 *
 * Significant digits rather than decimal places, because the same category
 * spans "3 mm" and "3 km in millimetres": a fixed number of decimals either
 * loses the small values entirely or pads the large ones with noise. Very
 * large and very small results fall back to exponent notation for the same
 * reason.
 */
export function format(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }
  if (value === 0) {
    return '0';
  }
  const magnitude = Math.abs(value);
  if (magnitude >= 1e15 || magnitude < 1e-6) {
    return value.toExponential(6).replace(/\.?0+e/, 'e');
  }
  // toPrecision, then strip the trailing zeros it adds — 1.50000 reads as a
  // claim about precision that the conversion has not made.
  const fixed = Number(value.toPrecision(10));
  return fixed.toLocaleString(undefined, { maximumFractionDigits: 10, useGrouping: true });
}

/** Every unit of the category, with `value` expressed in each. */
export function convertAll(
  value: number,
  category: Category,
  from: string,
): { unit: Unit; value: number; text: string }[] {
  return category.units.map((unit) => {
    const converted = convert(value, category, from, unit.id);
    return { unit, value: converted, text: format(converted) };
  });
}
