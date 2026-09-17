import {
  addMonths,
  calendarSpan,
  daysBetween,
  describeSpan,
  formatDate,
  nextAnniversary,
  parseDate,
  totalsBetween,
  weekdayOf,
  workDaysBetween,
} from './age';

/** Local midnight, the way every date in this tool is built. */
function d(text: string): Date {
  const date = parseDate(text);
  if (!date) {
    throw new Error(`not a date: ${text}`);
  }
  return date;
}

describe('age', () => {
  describe('parseDate', () => {
    it('reads a date as local midnight, not UTC', () => {
      const date = d('2024-03-01');
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(2);
      expect(date.getDate()).toBe(1);
      // The whole point: new Date('2024-03-01') is UTC midnight, which is
      // 29 February anywhere west of Greenwich.
      expect(date.getHours()).toBe(0);
    });

    it('rejects a day that does not exist', () => {
      expect(parseDate('2023-02-29')).toBeNull();
      expect(parseDate('2024-04-31')).toBeNull();
    });

    it('accepts a real leap day', () => {
      expect(parseDate('2024-02-29')).not.toBeNull();
    });

    it('rejects anything that is not YYYY-MM-DD', () => {
      expect(parseDate('')).toBeNull();
      expect(parseDate('01/03/2024')).toBeNull();
      expect(parseDate('2024-3-1')).toBeNull();
    });

    it('round-trips through formatDate', () => {
      expect(formatDate(d('2024-02-29'))).toBe('2024-02-29');
      expect(formatDate(d('1999-12-31'))).toBe('1999-12-31');
    });
  });

  describe('addMonths', () => {
    // The reason calendarSpan does not just subtract the date fields.
    it('clamps to the last day of a shorter month', () => {
      expect(formatDate(addMonths(d('2024-01-31'), 1))).toBe('2024-02-29');
      expect(formatDate(addMonths(d('2023-01-31'), 1))).toBe('2023-02-28');
      expect(formatDate(addMonths(d('2024-03-31'), 1))).toBe('2024-04-30');
    });

    it('crosses a year boundary', () => {
      expect(formatDate(addMonths(d('2024-11-15'), 3))).toBe('2025-02-15');
    });

    it('goes backwards', () => {
      expect(formatDate(addMonths(d('2024-03-31'), -1))).toBe('2024-02-29');
    });
  });

  describe('calendarSpan', () => {
    it('measures a plain span', () => {
      expect(calendarSpan(d('2000-01-15'), d('2024-04-20'))).toEqual({
        years: 24,
        months: 3,
        days: 5,
      });
    });

    // Field subtraction gives -1 days here and has to borrow twice.
    it('handles the end of a long month into a short one', () => {
      expect(calendarSpan(d('2024-01-31'), d('2024-03-01'))).toEqual({
        years: 0,
        months: 1,
        days: 1,
      });
    });

    it('is zero for the same day', () => {
      expect(calendarSpan(d('2024-06-01'), d('2024-06-01'))).toEqual({
        years: 0,
        months: 0,
        days: 0,
      });
    });

    it('counts a birthday as arriving on the day', () => {
      expect(calendarSpan(d('1990-05-10'), d('2024-05-10'))).toEqual({
        years: 34,
        months: 0,
        days: 0,
      });
      // 29, not 30: the last whole month lands on 10 April, and April has
      // 30 days, so the 10th to the 9th of May is 29 of them.
      expect(calendarSpan(d('1990-05-10'), d('2024-05-09'))).toEqual({
        years: 33,
        months: 11,
        days: 29,
      });
    });

    // A leap-day birthday turns in February in a common year, which is the
    // convention in most places and the one a clamping month-add produces.
    it('ages a leap-day birthday on 28 February in a common year', () => {
      expect(calendarSpan(d('2000-02-29'), d('2025-02-28')).years).toBe(25);
      expect(calendarSpan(d('2000-02-29'), d('2025-02-27')).years).toBe(24);
    });

    it('spans a leap day without losing it', () => {
      expect(daysBetween(d('2024-02-28'), d('2024-03-01'))).toBe(2);
      expect(daysBetween(d('2023-02-28'), d('2023-03-01'))).toBe(1);
    });
  });

  describe('workDaysBetween', () => {
    it('counts a plain working week', () => {
      // Monday to the following Monday: five weekdays in between.
      expect(workDaysBetween(d('2024-04-01'), d('2024-04-08'))).toBe(5);
    });

    it('skips the weekend', () => {
      // Friday to Monday is one weekday, the Friday itself.
      expect(workDaysBetween(d('2024-04-05'), d('2024-04-08'))).toBe(1);
    });

    it('is zero for the same day', () => {
      expect(workDaysBetween(d('2024-04-01'), d('2024-04-01'))).toBe(0);
    });

    it('counts a long range by whole weeks plus the tail', () => {
      // 2024 had 262 weekdays.
      expect(workDaysBetween(d('2024-01-01'), d('2025-01-01'))).toBe(262);
    });
  });

  describe('totalsBetween', () => {
    it('gives every unit for a year', () => {
      const totals = totalsBetween(d('2023-01-01'), d('2024-01-01'));
      expect(totals.days).toBe(365);
      expect(totals.weeks).toBe(52);
      expect(totals.weekDays).toBe(1);
      expect(totals.months).toBe(12);
      expect(totals.hours).toBe(8760);
      expect(totals.minutes).toBe(525600);
    });
  });

  describe('weekdayOf', () => {
    it('names the day', () => {
      // The Moon landing was a Sunday.
      expect(weekdayOf(d('1969-07-20'))).toBe('Sunday');
      expect(weekdayOf(d('2000-01-01'))).toBe('Saturday');
    });
  });

  describe('nextAnniversary', () => {
    it('finds it later this year', () => {
      const next = nextAnniversary(d('1990-12-25'), d('2024-06-01'));
      expect(formatDate(next.date)).toBe('2024-12-25');
      expect(next.daysAway).toBe(207);
    });

    it('rolls into next year once it has gone by', () => {
      const next = nextAnniversary(d('1990-01-10'), d('2024-06-01'));
      expect(formatDate(next.date)).toBe('2025-01-10');
    });

    it('is today when today is the day', () => {
      const next = nextAnniversary(d('1990-06-01'), d('2024-06-01'));
      expect(next.daysAway).toBe(0);
    });

    it('moves a leap-day anniversary to 1 March in a common year', () => {
      const next = nextAnniversary(d('2000-02-29'), d('2025-01-01'));
      expect(formatDate(next.date)).toBe('2025-03-01');
    });
  });

  describe('describeSpan', () => {
    it('writes all three parts', () => {
      expect(describeSpan({ years: 2, months: 3, days: 4 })).toBe('2 years, 3 months and 4 days');
    });

    it('drops the parts that are zero', () => {
      expect(describeSpan({ years: 1, months: 0, days: 5 })).toBe('1 year and 5 days');
      expect(describeSpan({ years: 0, months: 1, days: 0 })).toBe('1 month');
    });

    it('says zero days rather than nothing at all', () => {
      expect(describeSpan({ years: 0, months: 0, days: 0 })).toBe('0 days');
    });
  });
});
