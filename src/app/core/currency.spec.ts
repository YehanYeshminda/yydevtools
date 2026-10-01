import { describe, expect, it } from 'vitest';

import {
  RATE_SOURCES,
  ageInDays,
  convertAmount,
  convertMinor,
  currencyCodes,
  fetchRates,
  formatMoney,
  formatRate,
  isStale,
  parseRates,
  rateBetween,
  type Rates,
} from './currency';

/** Round numbers, so every expected value below can be checked by hand. */
const rates: Rates = {
  date: '2026-09-30',
  perUsd: { USD: 1, EUR: 0.8, GBP: 0.75, LKR: 300, JPY: 150, BHD: 0.376, KWD: 0.3 },
};

describe('rateBetween', () => {
  it('crosses through the dollar', () => {
    expect(rateBetween(rates, 'USD', 'LKR')).toBe(300);
    expect(rateBetween(rates, 'GBP', 'LKR')).toBe(400);
    expect(rateBetween(rates, 'LKR', 'USD')).toBeCloseTo(1 / 300, 15);
  });

  it('is null, never 0 or NaN, for a currency with no rate', () => {
    expect(rateBetween(rates, 'USD', 'XYZ')).toBeNull();
    expect(rateBetween(rates, 'XYZ', 'USD')).toBeNull();
  });
});

describe('convertAmount', () => {
  it('rounds to two decimals for most currencies', () => {
    expect(convertAmount(12.34, 'USD', 'LKR', rates)).toBe(3702);
    expect(convertAmount(1, 'LKR', 'USD', rates)).toBe(0);
    expect(convertAmount(100, 'LKR', 'USD', rates)).toBe(0.33);
  });

  it('has no decimals for yen', () => {
    // 1.23 * 150 = 184.5, which rounds half away from zero.
    expect(convertAmount(1.23, 'USD', 'JPY', rates)).toBe(185);
    expect(convertAmount(1000, 'JPY', 'USD', rates)).toBe(6.67);
  });

  it('has three decimals for dinars', () => {
    expect(convertAmount(1, 'USD', 'BHD', rates)).toBe(0.376);
    expect(convertAmount(10, 'USD', 'KWD', rates)).toBe(3);
    expect(convertAmount(1, 'KWD', 'BHD', rates)).toBe(1.253);
  });

  // 1.005 is 1.00499999999999989... in binary, so a naive Math.round(x * 100)
  // gives 1.00. The amount was 1.005 as typed, and half a cent rounds up.
  it('rounds the decimal that was typed, not its binary approximation', () => {
    expect(convertAmount(1.005, 'USD', 'USD', rates)).toBe(1.01);
    expect(convertAmount(8.345, 'USD', 'USD', rates)).toBe(8.35);
  });

  it('rounds a negative amount away from zero too', () => {
    expect(convertAmount(-1.23, 'USD', 'JPY', rates)).toBe(-185);
  });

  it('is null for something that is not a number', () => {
    expect(convertAmount(Number.NaN, 'USD', 'LKR', rates)).toBeNull();
    expect(convertAmount(1, 'USD', 'XYZ', rates)).toBeNull();
  });
});

describe('convertMinor', () => {
  it('moves between currencies with different decimals in one rounding', () => {
    // £2,823.00 is 282300 pence; at 400 LKR to the pound that is 1,129,200.00.
    expect(convertMinor(282300, 'GBP', 'LKR', rates)).toBe(112920000);
    // ¥ has no minor unit: 282300 pence at 200 yen to the pound is ¥564,600.
    expect(convertMinor(282300, 'GBP', 'JPY', rates)).toBe(564600);
    // Fils are thousandths: £2,823.00 at 0.501333… BHD is 1,415.264.
    expect(convertMinor(282300, 'GBP', 'BHD', rates)).toBe(1415264);
    // And back down from yen to pence.
    expect(convertMinor(564600, 'JPY', 'GBP', rates)).toBe(282300);
  });

  it('always returns a whole number of minor units', () => {
    for (const minor of [1, 7, 99, 12345, 9999999]) {
      for (const to of ['USD', 'JPY', 'BHD', 'LKR']) {
        expect(Number.isInteger(convertMinor(minor, 'GBP', to, rates))).toBe(true);
      }
    }
  });

  it('is null without a rate', () => {
    expect(convertMinor(100, 'GBP', 'XYZ', rates)).toBeNull();
  });
});

describe('formatMoney', () => {
  it('prints with a symbol or with the code', () => {
    expect(formatMoney(150, 'GBP')).toBe('£1.50');
    expect(formatMoney(112920000, 'LKR', 'code').replace(/\s/g, ' ')).toBe('LKR 1,129,200.00');
    expect(formatMoney(564600, 'JPY', 'code').replace(/\s/g, ' ')).toBe('JPY 564,600');
    expect(formatMoney(1415264, 'BHD', 'code').replace(/\s/g, ' ')).toBe('BHD 1,415.264');
  });
});

describe('formatRate', () => {
  it('keeps six significant digits', () => {
    expect(formatRate(330.83233813)).toBe('330.832');
    expect(formatRate(0.00302268)).toBe('0.00302268');
  });
});

describe('staleness', () => {
  const at = (iso: string) => new Date(iso);

  it('counts whole UTC days', () => {
    expect(ageInDays('2026-09-30', at('2026-10-01T00:30:00Z'))).toBe(1);
    expect(ageInDays('2026-09-30', at('2026-09-30T23:59:00Z'))).toBe(0);
  });

  it('allows the usual day or two of lag, then calls it stale', () => {
    expect(isStale(rates, at('2026-10-03T12:00:00Z'))).toBe(false);
    expect(isStale(rates, at('2026-10-04T12:00:00Z'))).toBe(true);
  });
});

describe('parseRates', () => {
  it('keeps the three-letter rates, upper-cased', () => {
    const parsed = parseRates({ date: '2026-09-30', usd: { usd: 1, lkr: 300, '1inch': 9.8 } });
    expect(parsed).toEqual({ date: '2026-09-30', perUsd: { USD: 1, LKR: 300 } });
  });

  it('drops a rate that is zero, negative or not a number, rather than converting with it', () => {
    const parsed = parseRates({
      date: '2026-09-30',
      usd: { usd: 1, aaa: 0, bbb: -2, ccc: 'x', ddd: null },
    });
    expect(parsed?.perUsd).toEqual({ USD: 1 });
  });

  it('refuses a body that is not the rates', () => {
    expect(parseRates(null)).toBeNull();
    expect(parseRates('<html>')).toBeNull();
    expect(parseRates({ date: 'yesterday', usd: { usd: 1 } })).toBeNull();
    expect(parseRates({ date: '2026-09-30', eur: { eur: 1 } })).toBeNull();
    // A table keyed on something other than the dollar would be wrong everywhere.
    expect(parseRates({ date: '2026-09-30', usd: { usd: 0.9 } })).toBeNull();
  });
});

describe('currencyCodes', () => {
  it('lists real currencies and leaves out crypto tokens', () => {
    const parsed = parseRates({
      date: '2026-09-30',
      usd: { usd: 1, lkr: 300, jpy: 150, btc: 0.00001, ada: 4 },
    })!;
    const codes = currencyCodes(parsed);
    expect(codes).toEqual(expect.arrayContaining(['USD', 'LKR', 'JPY']));
    expect(codes).not.toContain('BTC');
    expect(codes).not.toContain('ADA');
  });
});

describe('fetchRates', () => {
  const body = { date: '2026-09-30', usd: { usd: 1, lkr: 300 } };
  const ok = () => new Response(JSON.stringify(body), { status: 200 });

  function fake(answers: Array<() => Response>) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return answers[calls.length - 1]();
    }) as unknown as typeof fetch;
    return { fn, calls };
  }

  it('uses the primary when it answers', async () => {
    const { fn, calls } = fake([ok]);
    expect((await fetchRates(fn)).perUsd['LKR']).toBe(300);
    expect(calls.map((call) => call.url)).toEqual([RATE_SOURCES[0]]);
  });

  it('falls back when the primary is unreachable', async () => {
    const { fn, calls } = fake([
      () => {
        throw new TypeError('Failed to fetch');
      },
      ok,
    ]);
    expect((await fetchRates(fn)).perUsd['LKR']).toBe(300);
    expect(calls.map((call) => call.url)).toEqual([...RATE_SOURCES]);
  });

  it('falls back when the primary answers with an error or not the rates', async () => {
    for (const bad of [
      () => new Response('down', { status: 503 }),
      () => new Response('<html>', { status: 200 }),
    ]) {
      const { fn, calls } = fake([bad, ok]);
      expect((await fetchRates(fn)).date).toBe('2026-09-30');
      expect(calls).toHaveLength(2);
    }
  });

  it('throws when both mirrors fail, so the page says so instead of showing 0', async () => {
    const down = () => new Response('', { status: 502 });
    await expect(fetchRates(fake([down, down]).fn)).rejects.toThrow();
  });

  it('sends nothing but the fixed file request', async () => {
    const { fn, calls } = fake([ok]);
    await fetchRates(fn);
    expect(calls[0].init?.method ?? 'GET').toBe('GET');
    expect(calls[0].init?.body).toBeUndefined();
    expect(calls[0].init?.referrerPolicy).toBe('no-referrer');
    expect(calls[0].init?.credentials).toBe('omit');
  });
});
