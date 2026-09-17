import {
  LONG_BREAK_EVERY,
  MAX_MINUTES,
  MIN_MINUTES,
  addLap,
  clampMinutes,
  formatDuration,
  formatStopwatch,
  nextPhase,
  progressOf,
} from './timer';

describe('timer', () => {
  describe('nextPhase', () => {
    it('follows a focus session with a short break', () => {
      expect(nextPhase('work', 1)).toBe('short');
      expect(nextPhase('work', 2)).toBe('short');
      expect(nextPhase('work', 3)).toBe('short');
    });

    // The fourth session, not the fifth: `completed` includes the one that
    // has just ended.
    it('follows the fourth focus session with a long break', () => {
      expect(nextPhase('work', LONG_BREAK_EVERY)).toBe('long');
      expect(nextPhase('work', LONG_BREAK_EVERY * 2)).toBe('long');
    });

    it('follows any break with a focus session', () => {
      expect(nextPhase('short', 2)).toBe('work');
      expect(nextPhase('long', 4)).toBe('work');
    });

    it('honours a different long-break interval', () => {
      expect(nextPhase('work', 2, 2)).toBe('long');
      expect(nextPhase('work', 3, 2)).toBe('short');
    });

    it('does not give a long break before any session has finished', () => {
      expect(nextPhase('work', 0)).toBe('short');
    });
  });

  describe('clampMinutes', () => {
    it('keeps a sensible value', () => {
      expect(clampMinutes(25)).toBe(25);
    });

    it('rounds to whole minutes', () => {
      expect(clampMinutes(25.6)).toBe(26);
    });

    it('holds the ends', () => {
      expect(clampMinutes(0)).toBe(MIN_MINUTES);
      expect(clampMinutes(-5)).toBe(MIN_MINUTES);
      expect(clampMinutes(9999)).toBe(MAX_MINUTES);
    });

    // An emptied number field reads as NaN, which would otherwise become the
    // phase length and end the timer immediately.
    it('treats a blank field as the minimum', () => {
      expect(clampMinutes(Number.NaN)).toBe(MIN_MINUTES);
    });
  });

  describe('formatDuration', () => {
    it('writes minutes and seconds', () => {
      expect(formatDuration(25 * 60 * 1000)).toBe('25:00');
      expect(formatDuration(65 * 1000)).toBe('1:05');
      expect(formatDuration(0)).toBe('0:00');
    });

    it('adds hours once there are any', () => {
      expect(formatDuration(3600 * 1000)).toBe('1:00:00');
      expect(formatDuration(3725 * 1000)).toBe('1:02:05');
    });

    // Rounded up, so a timer shows its full length for the first moment and
    // reaches 0:00 only when it is genuinely over.
    it('rounds up', () => {
      expect(formatDuration(1500 * 60 - 1)).toBe('1:30');
      expect(formatDuration(1)).toBe('0:01');
    });

    it('never goes negative', () => {
      expect(formatDuration(-5000)).toBe('0:00');
    });
  });

  describe('formatStopwatch', () => {
    it('writes hundredths', () => {
      expect(formatStopwatch(0)).toBe('0:00.00');
      expect(formatStopwatch(1234)).toBe('0:01.23');
      expect(formatStopwatch(61_500)).toBe('1:01.50');
    });

    it('adds hours once there are any', () => {
      expect(formatStopwatch(3_661_230)).toBe('1:01:01.23');
    });
  });

  describe('addLap', () => {
    it('splits from the start for the first lap', () => {
      expect(addLap([], 5000)).toEqual([{ index: 1, at: 5000, split: 5000 }]);
    });

    it('splits from the previous lap after that', () => {
      const one = addLap([], 5000);
      const two = addLap(one, 12_000);
      expect(two[1]).toEqual({ index: 2, at: 12_000, split: 7000 });
    });

    it('leaves the existing laps alone', () => {
      const one = addLap([], 5000);
      addLap(one, 9000);
      expect(one.length).toBe(1);
    });
  });

  describe('progressOf', () => {
    it('runs from nothing to everything', () => {
      expect(progressOf(1000, 1000)).toBe(0);
      expect(progressOf(500, 1000)).toBe(0.5);
      expect(progressOf(0, 1000)).toBe(1);
    });

    it('stays in range past the end', () => {
      expect(progressOf(-500, 1000)).toBe(1);
      expect(progressOf(2000, 1000)).toBe(0);
    });

    it('is zero rather than NaN for a zero-length phase', () => {
      expect(progressOf(0, 0)).toBe(0);
    });
  });
});
