import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal, untracked } from '@angular/core';

/**
 * Currency: how many decimals each one has, how money is printed, and the
 * daily reference rates the Unit Converter and the Invoice Generator convert
 * with.
 *
 * Rates come from fawazahmed0's currency-api, fetched by the browser straight
 * from its two mirrors rather than through our Worker. The request is the same
 * fixed file for every visitor — US-dollar rates for every currency — so it
 * carries nothing the visitor typed or chose, not even the pair they convert;
 * every cross rate is worked out here from that one file. jsDelivr is already
 * a global CDN cache, so a Worker in front would add a hop and a point of
 * failure without saving a request, and the second mirror (Cloudflare Pages)
 * keeps working when ours or jsDelivr does not.
 */

/** Primary, then the fallback the API's README names. Tried in this order. */
export const RATE_SOURCES = [
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
  'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json',
] as const;

/**
 * The API publishes once a day and jsDelivr can lag it by a day, so a file one
 * or two days old is normal. Past this it is called out as stale.
 */
export const STALE_AFTER_DAYS = 3;

const TIMEOUT_MS = 8000;

export interface Rates {
  /** yyyy-mm-dd, the day the API says these rates are for. */
  date: string;
  /** Units of each currency per one US dollar, keyed by upper-case ISO code. */
  perUsd: Readonly<Record<string, number>>;
}

/**
 * Digits after the decimal point for a currency: 2 for most, 0 for yen, 3 for
 * dinars. Asked of Intl rather than hard-coded, and 2 for a code it does not
 * recognise.
 */
export function fractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** A minor-unit amount as text: `£1.50`, or `GBP 1.50` with `display: 'code'`. */
export function formatMoney(
  minor: number,
  currency: string,
  display: 'symbol' | 'code' = 'symbol',
): string {
  const digits = fractionDigits(currency);
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      currencyDisplay: display,
    }).format(minor / 10 ** digits);
  } catch {
    return `${(minor / 10 ** digits).toFixed(digits)} ${currency}`;
  }
}

/**
 * Rounds half away from zero, after shaving off floating-point noise.
 *
 * 1.005 * 100 is 100.49999999999999 in binary, which Math.round would take
 * down a cent. Fifteen significant digits is what a double can hold exactly,
 * so cutting there first turns it back into the 100.5 it was meant to be.
 */
function roundHalfAway(value: number): number {
  const clean = Number(Math.abs(value).toPrecision(15));
  return Math.sign(value) * Math.round(clean);
}

/** How many `to` one `from` buys, or null if either has no rate. */
export function rateBetween(rates: Rates, from: string, to: string): number | null {
  const a = rates.perUsd[from];
  const b = rates.perUsd[to];
  return a > 0 && b > 0 ? b / a : null;
}

/**
 * A minor-unit amount in `from` as minor units of `to`: pence to yen, cents to
 * fils. One multiplication and one rounding, to the target's own scale, so a
 * converted total is never a sum of separately rounded pieces.
 */
export function convertMinor(minor: number, from: string, to: string, rates: Rates): number | null {
  const rate = rateBetween(rates, from, to);
  if (rate === null || !Number.isFinite(minor)) {
    return null;
  }
  const shift = fractionDigits(to) - fractionDigits(from);
  return roundHalfAway(minor * rate * 10 ** shift);
}

/**
 * A major-unit amount as typed (12.5 means twelve fifty), converted and rounded
 * to the target's decimals: 2 for most, 0 for yen, 3 for dinars.
 */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: Rates,
): number | null {
  const rate = rateBetween(rates, from, to);
  if (rate === null || !Number.isFinite(amount)) {
    return null;
  }
  const scale = 10 ** fractionDigits(to);
  return roundHalfAway(amount * rate * scale) / scale;
}

/** A rate for reading: six significant digits, so 0.00251832 and 330.832 both say enough. */
export function formatRate(rate: number): string {
  return new Intl.NumberFormat('en', { maximumSignificantDigits: 6 }).format(rate);
}

/** Whole days between the rates' date and `now`, counted in UTC. */
export function ageInDays(date: string, now: Date): number {
  const then = Date.parse(`${date}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - then) / 86_400_000);
}

export function isStale(rates: Rates, now: Date): boolean {
  return ageInDays(rates.date, now) > STALE_AFTER_DAYS;
}

/** "30 September 2026" — spelled out, because 09/10 is two different days. */
export function rateDateText(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
}

let names: Intl.DisplayNames | null = null;

/** "Sri Lankan Rupee", or the code itself where Intl has no name for it. */
export function currencyName(code: string): string {
  try {
    names ??= new Intl.DisplayNames(['en'], { type: 'currency' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * The currencies with a rate that are real ISO 4217 money, by name.
 *
 * The API also carries ~180 crypto tokens and commodities; anything Intl does
 * not know as a currency is one of those, and is left out.
 */
export function currencyCodes(rates: Rates): string[] {
  const iso = new Set(Intl.supportedValuesOf('currency'));
  return Object.keys(rates.perUsd)
    .filter((code) => iso.has(code))
    .sort((a, b) => currencyName(a).localeCompare(currencyName(b)));
}

/**
 * The API's body as Rates, or null if it is not the shape we know: a date and
 * a `usd` table of positive numbers. Anything else in the table is dropped
 * rather than trusted, so a bad entry is "no rate", never NaN or 0.
 */
export function parseRates(body: unknown): Rates | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const { date, usd } = body as Record<string, unknown>;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  if (typeof usd !== 'object' || usd === null) {
    return null;
  }
  const perUsd: Record<string, number> = {};
  for (const [code, rate] of Object.entries(usd)) {
    if (/^[a-z]{3}$/.test(code) && typeof rate === 'number' && rate > 0 && Number.isFinite(rate)) {
      perUsd[code.toUpperCase()] = rate;
    }
  }
  return perUsd['USD'] === 1 ? { date, perUsd } : null;
}

/**
 * Fetches the rates, from the fallback mirror if the primary fails in any way
 * — unreachable, an error status, a body that is not the rates. Throws only
 * when both have failed.
 *
 * `no-cache` because jsDelivr marks the file fresh for a week: without it a
 * returning visitor could be handed last week's rates from their own cache. It
 * revalidates instead, which costs a 304 when nothing has changed.
 */
export async function fetchRates(fetchFn: typeof fetch = fetch): Promise<Rates> {
  for (const url of RATE_SOURCES) {
    try {
      const response = await fetchFn(url, {
        cache: 'no-cache',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const rates = response.ok ? parseRates(await response.json()) : null;
      if (rates) {
        return rates;
      }
    } catch {
      // Next mirror.
    }
  }
  throw new Error('Neither currency-api mirror answered with rates.');
}

export type RatesState = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * One fetch per page session, shared by every tool that asks. Nothing is
 * fetched until a tool calls `load()` — which the tools do only once the
 * visitor has asked for a currency.
 */
@Injectable({ providedIn: 'root' })
export class CurrencyRates {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly current = signal<Rates | null>(null);
  private readonly phase = signal<RatesState>('idle');

  readonly rates = this.current.asReadonly();
  readonly state = this.phase.asReadonly();

  /**
   * Starts the fetch unless it is running or done. A failed one is retried.
   *
   * The tools call this from an effect, and reading `phase` there would make
   * the effect depend on it: every failure would re-run the effect, which would
   * retry, fail and re-run it again, forever. Hence `untracked`.
   */
  load(): void {
    const phase = untracked(this.phase);
    if (!this.browser || phase === 'loading' || phase === 'ready') {
      return;
    }
    this.phase.set('loading');
    fetchRates().then(
      (rates) => {
        this.current.set(rates);
        this.phase.set('ready');
      },
      () => this.phase.set('failed'),
    );
  }
}
