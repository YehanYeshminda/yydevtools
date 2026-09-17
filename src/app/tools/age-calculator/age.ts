/**
 * The distance between two dates, in the two ways people mean it.
 *
 * A calendar span ("25 years, 3 months and 4 days") and a set of totals
 * ("9,228 days") answer different questions, and neither is derivable from the
 * other without knowing which months were in the way. Both are computed here,
 * away from the component, because the month arithmetic is the part that is
 * easy to get subtly wrong and worth testing on its own.
 *
 * Everything works in local calendar days with no time component. Dates come
 * out of an <input type="date"> as "YYYY-MM-DD", and the one thing never to do
 * with that string is hand it to `new Date()`: it is parsed as UTC midnight,
 * which is the previous day anywhere west of Greenwich. `parseDate` below
 * builds a local date instead.
 */

export interface Span {
  years: number;
  months: number;
  days: number;
}

export interface Totals {
  days: number;
  weeks: number;
  /** Days left over after the whole weeks. */
  weekDays: number;
  months: number;
  hours: number;
  minutes: number;
  /** Whole weekdays, Monday to Friday, in the range. */
  workDays: number;
}

const MS_PER_DAY = 86_400_000;

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** Parses "YYYY-MM-DD" as a local calendar date, or null if it is not one. */
export function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  // Rejects the 31st of a 30-day month and the 29th of a common February,
  // which the constructor would otherwise roll forward into the next month.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** Formats a local date back to "YYYY-MM-DD", for an <input type="date">. */
export function formatDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Midnight today, local. */
export function today(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Adds whole months, clamping the day to one that exists.
 *
 * 31 January plus one month is 28 or 29 February, not 2 or 3 March. Every
 * calendar, payroll system and legal definition of "a month later" works this
 * way, and the Date constructor does the opposite by default.
 */
export function addMonths(date: Date, months: number): Date {
  const year = date.getFullYear();
  const month = date.getMonth() + months;
  const day = Math.min(date.getDate(), daysInMonth(year, month));
  return new Date(year, month, day);
}

/**
 * Whole days between two local midnights.
 *
 * Rounded rather than truncated because the two dates can sit on opposite
 * sides of a daylight-saving change, making the elapsed time 23 or 25 hours
 * for a difference that is still exactly one calendar day.
 */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * The calendar span from `from` to `to`.
 *
 * Counted by advancing whole months from the earlier date and measuring what
 * is left, rather than by subtracting the year, month and day fields and
 * borrowing. Field subtraction looks simpler and then gives a negative day
 * count for cases like 31 January to 1 March, because the month it borrows
 * from is shorter than the day it is borrowing for.
 */
export function calendarSpan(from: Date, to: Date): Span {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (addMonths(from, months) > to) {
    months -= 1;
  }
  const days = daysBetween(addMonths(from, months), to);
  return { years: Math.floor(months / 12), months: months % 12, days };
}

/**
 * Whole Monday-to-Friday days in [from, to).
 *
 * Counted by whole weeks plus the ragged tail, so the range length does not
 * matter — a loop over ten thousand days would work too, but not for the
 * "days since the Moon landing" sort of question this gets asked.
 */
export function workDaysBetween(from: Date, to: Date): number {
  const total = daysBetween(from, to);
  if (total <= 0) {
    return 0;
  }
  const whole = Math.floor(total / 7);
  let count = whole * 5;
  let day = from.getDay();
  for (let i = 0; i < total % 7; i += 1) {
    if (day !== 0 && day !== 6) {
      count += 1;
    }
    day = (day + 1) % 7;
  }
  return count;
}

export function totalsBetween(from: Date, to: Date): Totals {
  const days = daysBetween(from, to);
  const span = calendarSpan(from, to);
  return {
    days,
    weeks: Math.floor(days / 7),
    weekDays: days % 7,
    months: span.years * 12 + span.months,
    hours: days * 24,
    minutes: days * 24 * 60,
    workDays: workDaysBetween(from, to),
  };
}

/** The weekday a date fell on, spelled out. */
export function weekdayOf(date: Date): string {
  return WEEKDAY_NAMES[date.getDay()];
}

/**
 * The next time the month and day of `date` come round again, and how far off
 * it is. Returns 0 days when today *is* the anniversary.
 *
 * A 29 February anniversary lands on 1 March in a common year, because
 * addMonths clamps to 28 and that date has already gone by.
 */
export function nextAnniversary(date: Date, from: Date): { date: Date; daysAway: number } {
  let next = new Date(from.getFullYear(), date.getMonth(), date.getDate());
  // The constructor rolls 29 February in a common year forward to 1 March,
  // which is the answer most people expect and every other one is arguable.
  if (next < from) {
    next = new Date(from.getFullYear() + 1, date.getMonth(), date.getDate());
  }
  return { date: next, daysAway: daysBetween(from, next) };
}

/** A span written out, skipping the parts that are zero. */
export function describeSpan(span: Span): string {
  const parts: string[] = [];
  if (span.years) {
    parts.push(`${span.years} ${span.years === 1 ? 'year' : 'years'}`);
  }
  if (span.months) {
    parts.push(`${span.months} ${span.months === 1 ? 'month' : 'months'}`);
  }
  if (span.days || parts.length === 0) {
    parts.push(`${span.days} ${span.days === 1 ? 'day' : 'days'}`);
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
