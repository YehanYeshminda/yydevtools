/**
 * The parts of a timer that do not need a clock.
 *
 * Phase sequencing and formatting are pure, so they can be tested without
 * waiting twenty-five minutes for a Pomodoro to end. The component owns the
 * one thing that genuinely needs time: a ticker that reads Date.now().
 */

export type Phase = 'work' | 'short' | 'long';

export interface PhaseInfo {
  id: Phase;
  name: string;
  /** Default length in minutes. */
  minutes: number;
  /** What the page says while it is running. */
  caption: string;
}

export const PHASES: Record<Phase, PhaseInfo> = {
  work: { id: 'work', name: 'Focus', minutes: 25, caption: 'Work on one thing.' },
  short: { id: 'short', name: 'Short break', minutes: 5, caption: 'Stand up. Look away.' },
  long: { id: 'long', name: 'Long break', minutes: 15, caption: 'Properly away from the desk.' },
};

export const PHASE_ORDER: Phase[] = ['work', 'short', 'long'];

/** How many focus sessions before the long break, in the usual technique. */
export const LONG_BREAK_EVERY = 4;

export const MIN_MINUTES = 1;
export const MAX_MINUTES = 180;

/**
 * What follows the phase that just ended.
 *
 * `completed` counts finished focus sessions *including* the one that has just
 * ended, so the fourth one leads to the long break rather than the fifth.
 */
export function nextPhase(
  current: Phase,
  completed: number,
  longBreakEvery = LONG_BREAK_EVERY,
): Phase {
  if (current !== 'work') {
    return 'work';
  }
  return completed > 0 && completed % longBreakEvery === 0 ? 'long' : 'short';
}

export function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_MINUTES;
  }
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(value)));
}

/**
 * Milliseconds as mm:ss, or h:mm:ss once there is an hour to show.
 *
 * Rounded up rather than down, so a timer started at 25:00 reads 25:00 for the
 * first moment rather than flicking straight to 24:59, and reaches 0:00 only
 * when it is actually over.
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * Milliseconds as mm:ss.hh, for the stopwatch.
 *
 * Hundredths rather than thousandths: a stopwatch reading changes 100 times a
 * second either way, and three digits of a number nobody can react to just
 * makes the display twitch.
 */
export function formatStopwatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const hundredths = Math.floor((total % 1000) / 10);
  const pad = (n: number) => `${n}`.padStart(2, '0');
  const head = hours > 0 ? `${hours}:${pad(minutes)}` : `${minutes}`;
  return `${head}:${pad(seconds)}.${pad(hundredths)}`;
}

/** A lap and the split since the one before it. */
export interface Lap {
  index: number;
  at: number;
  split: number;
}

/** Appends a lap at `elapsed`, with the gap since the previous one. */
export function addLap(laps: readonly Lap[], elapsed: number): Lap[] {
  const previous = laps.length > 0 ? laps[laps.length - 1].at : 0;
  return [...laps, { index: laps.length + 1, at: elapsed, split: elapsed - previous }];
}

/** 0 to 1, for the ring. Returns 0 for a zero-length phase rather than NaN. */
export function progressOf(remaining: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, 1 - remaining / total));
}
