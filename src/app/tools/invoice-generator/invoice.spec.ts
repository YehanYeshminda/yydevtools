import {
  addDays,
  fileStemFor,
  formatDate,
  formatMoney,
  fractionDigits,
  isoDate,
  lineTotal,
  nextNumber,
  parseDate,
  toMinor,
  totalsFor,
  type LineItem,
} from './invoice';

const item = (quantity: number, unitPrice: number): LineItem => ({
  description: 'Work',
  quantity,
  unitPrice,
});

describe('fractionDigits', () => {
  it('is two for most currencies, none for yen, three for dinars', () => {
    expect(fractionDigits('USD')).toBe(2);
    expect(fractionDigits('GBP')).toBe(2);
    expect(fractionDigits('JPY')).toBe(0);
    expect(fractionDigits('BHD')).toBe(3);
  });

  it('falls back to two for a code it does not know', () => {
    expect(fractionDigits('ZZZ')).toBe(2);
  });
});

describe('toMinor', () => {
  it('scales by the currency, not by a hard-coded hundred', () => {
    expect(toMinor(12.5, 'USD')).toBe(1250);
    expect(toMinor(1500, 'JPY')).toBe(1500);
    expect(toMinor(1.234, 'BHD')).toBe(1234);
  });

  it('is zero for something that is not a number', () => {
    expect(toMinor(Number.NaN, 'USD')).toBe(0);
  });
});

describe('lineTotal', () => {
  it('multiplies quantity by price, in minor units', () => {
    expect(lineTotal(item(3, 12.5), 'USD')).toBe(3750);
  });

  it('handles a fractional quantity', () => {
    expect(lineTotal(item(2.5, 80), 'USD')).toBe(20000);
  });

  // The whole reason this module exists: 0.1 + 0.2 is not 0.3, so three lines
  // of 0.1 summed as floats do not make 0.3.
  it('does not accumulate floating-point error', () => {
    const lines = [item(1, 0.1), item(1, 0.2), item(1, 0.1)];
    expect(lines.reduce((sum, line) => sum + lineTotal(line, 'USD'), 0)).toBe(40);
  });

  // Rounding the unit price first would make this 0 rather than 2.
  it('rounds once, at the end', () => {
    expect(lineTotal(item(3, 0.005), 'USD')).toBe(2);
  });

  it('uses the currency’s own scale', () => {
    expect(lineTotal(item(2, 1500), 'JPY')).toBe(3000);
  });

  it('is zero for a line that is not a number', () => {
    expect(lineTotal(item(Number.NaN, 10), 'USD')).toBe(0);
  });
});

describe('totalsFor', () => {
  it('sums the lines and applies the tax rate', () => {
    const totals = totalsFor([item(2, 100), item(1, 50)], 20, 'USD');
    expect(totals).toEqual({ subtotal: 25000, tax: 5000, total: 30000 });
  });

  it('handles a fractional tax rate', () => {
    expect(totalsFor([item(1, 100)], 7.5, 'USD').tax).toBe(750);
  });

  it('is all zeroes with no lines', () => {
    expect(totalsFor([], 20, 'USD')).toEqual({ subtotal: 0, tax: 0, total: 0 });
  });

  it('treats a missing tax rate as none', () => {
    expect(totalsFor([item(1, 100)], Number.NaN, 'USD').total).toBe(10000);
  });
});

describe('formatMoney', () => {
  it('uses the currency’s symbol and its number of decimals', () => {
    expect(formatMoney(123456, 'USD')).toBe('$1,234.56');
    expect(formatMoney(3000, 'JPY')).toBe('¥3,000');
  });

  it('falls back rather than throwing on an unknown code', () => {
    expect(formatMoney(1050, 'ZZZ')).toContain('ZZZ');
  });
});

describe('dates', () => {
  // new Date('2026-03-01') is UTC midnight, which is the 28th of February west
  // of Greenwich. These are built from local parts instead.
  it('parses a date without a timezone shift', () => {
    const date = parseDate('2026-03-01');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2);
    expect(date?.getDate()).toBe(1);
  });

  it('rejects a date that does not exist', () => {
    expect(parseDate('2026-02-30')).toBeNull();
    expect(parseDate('not a date')).toBeNull();
  });

  it('adds days across a month end', () => {
    expect(addDays('2026-01-20', 30)).toBe('2026-02-19');
    expect(addDays('2026-02-20', 30)).toBe('2026-03-22');
  });

  it('adds days across a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('leaves an unparseable date alone', () => {
    expect(addDays('whenever', 30)).toBe('whenever');
  });

  it('round-trips through isoDate', () => {
    expect(isoDate(new Date(2026, 8, 7))).toBe('2026-09-07');
  });

  // 03/04 is two different days depending on which side of the Atlantic reads
  // it, so the month is spelled out.
  it('spells the month out', () => {
    expect(formatDate('2026-04-03')).toBe('3 April 2026');
  });
});

describe('nextNumber', () => {
  it('increments and keeps the padding', () => {
    expect(nextNumber('INV-0007')).toBe('INV-0008');
    expect(nextNumber('INV-0099')).toBe('INV-0100');
  });

  it('grows past the padding rather than truncating', () => {
    expect(nextNumber('INV-999')).toBe('INV-1000');
  });

  it('increments the last number, not the first', () => {
    expect(nextNumber('2026-INV-041')).toBe('2026-INV-042');
  });

  it('leaves something with no number alone', () => {
    expect(nextNumber('DRAFT')).toBe('DRAFT');
  });
});

describe('fileStemFor', () => {
  it('builds a name from the number', () => {
    expect(fileStemFor('invoice', 'INV-0007')).toBe('invoice-inv-0007');
  });

  it('falls back when nothing survives', () => {
    expect(fileStemFor('receipt', '###')).toBe('receipt-document');
  });
});
