/**
 * The arithmetic on an invoice, kept away from the browser and pinned by tests.
 *
 * Money is the one thing on this page that must not be approximated, and the
 * way it goes wrong is famous: 0.1 + 0.2 is 0.30000000000000004, so an invoice
 * summed in floating point can print a total that is a penny off the sum of
 * its own lines. Every amount here is therefore an integer number of *minor
 * units* — pence, cents, sen — converted at the edges and never in between.
 *
 * How many minor units a currency has is not two for everyone: yen has none,
 * Bahraini dinar has three. Intl knows, so it is asked rather than assumed.
 */

export interface LineItem {
  description: string;
  /** Hours, items, days. Fractional, because 2.5 hours is a real line. */
  quantity: number;
  /** In major units, as typed: 12.5 means twelve fifty. */
  unitPrice: number;
}

export interface Totals {
  subtotal: number;
  tax: number;
  total: number;
}

export const CURRENCIES = [
  { code: 'USD', label: 'USD — US dollar' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'GBP', label: 'GBP — Pound sterling' },
  { code: 'AUD', label: 'AUD — Australian dollar' },
  { code: 'CAD', label: 'CAD — Canadian dollar' },
  { code: 'INR', label: 'INR — Indian rupee' },
  { code: 'LKR', label: 'LKR — Sri Lankan rupee' },
  { code: 'SGD', label: 'SGD — Singapore dollar' },
  { code: 'JPY', label: 'JPY — Japanese yen' },
  { code: 'CHF', label: 'CHF — Swiss franc' },
] as const;

/**
 * Digits after the decimal point for a currency: 2 for most, 0 for yen, 3 for
 * dinars. Asked of Intl rather than hard-coded, and defaulting to 2 if a code
 * is one it does not recognise.
 */
export function fractionDigits(currency: string): number {
  try {
    const options = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions();
    return options.maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

function scaleOf(currency: string): number {
  return 10 ** fractionDigits(currency);
}

/** A major-unit amount as minor units, at the currency's own scale. */
export function toMinor(amount: number, currency: string): number {
  const scaled = amount * scaleOf(currency);
  return Number.isFinite(scaled) ? Math.round(scaled) : 0;
}

/**
 * One line's amount, in minor units.
 *
 * Rounded once, at the end. Rounding the unit price first and multiplying
 * after would turn 3 × 0.005 into 0 instead of 2 — small, but it is exactly
 * the sort of penny that makes a client query an invoice.
 */
export function lineTotal(item: LineItem, currency: string): number {
  const amount = item.unitPrice * item.quantity * scaleOf(currency);
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

/** Subtotal, tax and total, all in minor units. */
export function totalsFor(items: readonly LineItem[], taxRate: number, currency: string): Totals {
  const subtotal = items.reduce((sum, item) => sum + lineTotal(item, currency), 0);
  const rate = Number.isFinite(taxRate) ? taxRate : 0;
  const tax = Math.round((subtotal * rate) / 100);
  return { subtotal, tax, total: subtotal + tax };
}

/** A minor-unit amount as text, with the currency's own symbol and grouping. */
export function formatMoney(minor: number, currency: string): string {
  const digits = fractionDigits(currency);
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(
      minor / 10 ** digits,
    );
  } catch {
    return `${(minor / 10 ** digits).toFixed(digits)} ${currency}`;
  }
}

/**
 * A date `days` after `from`, as a yyyy-mm-dd string for a date input.
 *
 * Built out of the local year, month and day rather than by adding
 * milliseconds: `toISOString` reports UTC, so west of Greenwich an evening
 * date comes back as the day before.
 */
export function addDays(from: string, days: number): string {
  const date = parseDate(from);
  if (!date) {
    return from;
  }
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

/** yyyy-mm-dd for a local date, with none of toISOString's timezone shift. */
export function isoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A yyyy-mm-dd string as a local date, or null if it is not one. */
export function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  // Rejects 2025-02-30, which the constructor would roll forward to March.
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** "12 March 2026" — spelled out, because 03/04 means two different days. */
export function formatDate(value: string): string {
  const date = parseDate(value);
  return date
    ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : value;
}

/**
 * The next number in a series: INV-0007 becomes INV-0008.
 *
 * Increments the trailing run of digits and keeps its width, so a padded
 * series stays padded. Anything with no trailing number is handed back
 * unchanged rather than guessed at.
 */
export function nextNumber(current: string): string {
  const match = /^(.*?)(\d+)(\D*)$/.exec(current);
  if (!match) {
    return current;
  }
  const [, prefix, digits, suffix] = match;
  const next = `${Number(digits) + 1}`;
  return `${prefix}${next.padStart(digits.length, '0')}${suffix}`;
}

/** A filename stem for the download: invoice-INV-0007. */
export function fileStemFor(kind: string, number: string): string {
  const cleaned = number
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${kind}-${cleaned || 'document'}`.slice(0, 60);
}
