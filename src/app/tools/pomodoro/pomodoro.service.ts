import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

import {
  PHASES,
  addLap,
  clampMinutes,
  formatDuration,
  formatStopwatch,
  nextPhase,
  progressOf,
  type Lap,
  type Phase,
} from './timer';

export type PomodoroMode = 'pomodoro' | 'stopwatch';

/**
 * How often the display is recomputed while something is running.
 *
 * The stopwatch shows hundredths, so it needs a frame-ish interval. Nothing
 * about the timing depends on this: elapsed time is always measured against
 * Date.now(), because setInterval drifts and browsers throttle it hard in a
 * background tab — a timer that counted ticks would finish minutes late.
 */
const TICK_MS = 50;

/**
 * The running timer, held outside the component that draws it.
 *
 * A Pomodoro whose state lives in the tool component stops the moment you
 * navigate away, which is the one thing a 25-minute timer must not do — you
 * start it precisely so you can go and use something else. Root-provided, it
 * outlives the route, and the header can show it from anywhere.
 *
 * The ticker only exists while something is actually running, so a visitor who
 * never opens the timer pays nothing for it.
 */
@Injectable({ providedIn: 'root' })
export class PomodoroService {
  readonly mode = signal<PomodoroMode>('pomodoro');
  readonly running = signal(false);

  /** Redrawn on every tick; the source of every elapsed calculation. */
  private readonly now = signal(Date.now());

  /** When the current run began. Null while paused or reset. */
  private startedAt: number | null = null;

  /** Time already banked from previous runs of this phase or stopwatch. */
  private readonly banked = signal(0);

  readonly phase = signal<Phase>('work');
  readonly completed = signal(0);
  readonly lengths = signal<Record<Phase, number>>({
    work: PHASES.work.minutes,
    short: PHASES.short.minutes,
    long: PHASES.long.minutes,
  });

  readonly laps = signal<readonly Lap[]>([]);

  private interval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopTicking());
  }

  /** Milliseconds run so far, banked plus whatever the current run has added. */
  readonly elapsed = computed(() => {
    const banked = this.banked();
    if (!this.running() || this.startedAt === null) {
      return banked;
    }
    return banked + Math.max(0, this.now() - this.startedAt);
  });

  readonly phaseMs = computed(() => this.lengths()[this.phase()] * 60_000);
  readonly remaining = computed(() => Math.max(0, this.phaseMs() - this.elapsed()));

  readonly display = computed(() =>
    this.mode() === 'stopwatch'
      ? formatStopwatch(this.elapsed())
      : formatDuration(this.remaining()),
  );

  /**
   * The same clock at a glance, for the header.
   *
   * Whole seconds even in stopwatch mode: hundredths flickering in the corner
   * of every other page is movement nobody asked for, and the digits change
   * far too fast to read anyway.
   */
  readonly shortDisplay = computed(() =>
    formatDuration(this.mode() === 'stopwatch' ? this.elapsed() : this.remaining()),
  );

  readonly progress = computed(() =>
    this.mode() === 'stopwatch' ? 0 : progressOf(this.remaining(), this.phaseMs()),
  );

  readonly phaseInfo = computed(() => PHASES[this.phase()]);
  readonly isBreak = computed(() => this.phase() !== 'work');
  readonly canLap = computed(() => this.mode() === 'stopwatch' && this.running());
  readonly lapList = computed(() => [...this.laps()].reverse());

  /**
   * Whether there is anything worth showing in the header.
   *
   * Paused counts: a timer you stepped away from mid-session is exactly the one
   * you need a way back to.
   */
  readonly active = computed(() => this.running() || this.elapsed() > 0);

  readonly label = computed(() =>
    this.mode() === 'stopwatch'
      ? `Stopwatch at ${this.shortDisplay()}`
      : `${this.phaseInfo().name}, ${this.shortDisplay()} left`,
  );

  // --- Controls ---------------------------------------------------------
  setMode(mode: PomodoroMode): void {
    if (mode === this.mode()) {
      return;
    }
    this.mode.set(mode);
    this.reset();
  }

  toggle(): void {
    if (this.running()) {
      // Bank what this run added, then stop counting from the wall clock.
      this.banked.set(this.elapsed());
      this.startedAt = null;
      this.running.set(false);
      this.stopTicking();
      return;
    }
    this.startedAt = Date.now();
    this.now.set(this.startedAt);
    this.running.set(true);
    this.startTicking();
  }

  reset(): void {
    this.running.set(false);
    this.startedAt = null;
    this.banked.set(0);
    this.laps.set([]);
    this.stopTicking();
  }

  lap(): void {
    if (this.canLap()) {
      this.laps.update((laps) => addLap(laps, this.elapsed()));
    }
  }

  setLength(phase: Phase, value: string): void {
    const minutes = clampMinutes(Number(value));
    this.lengths.update((lengths) => ({ ...lengths, [phase]: minutes }));
    if (phase === this.phase()) {
      // Changing the phase you are in restarts it rather than leaving a
      // countdown that is already past its new end.
      this.reset();
    }
  }

  /**
   * Jumps to a phase by hand, for when the plan changes.
   *
   * Picking the phase you are already in does nothing, rather than quietly
   * restarting it. The tabs stay clickable when pressed, so without this the
   * button that looks like a no-op is the one that throws a session away — and
   * Reset is right there for anyone who meant it.
   */
  choosePhase(phase: Phase): void {
    if (phase === this.phase()) {
      return;
    }
    this.phase.set(phase);
    this.reset();
  }

  resetCycle(): void {
    this.completed.set(0);
    this.phase.set('work');
    this.reset();
  }

  // --- Ticking ----------------------------------------------------------
  private startTicking(): void {
    if (this.interval !== null || typeof setInterval !== 'function') {
      return;
    }
    this.interval = setInterval(() => {
      this.now.set(Date.now());
      this.checkFinished();
    }, TICK_MS);
  }

  private stopTicking(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  // --- Finishing --------------------------------------------------------
  private checkFinished(): void {
    if (this.mode() !== 'pomodoro' || this.remaining() > 0) {
      return;
    }
    const finished = this.phase();
    const completed = finished === 'work' ? this.completed() + 1 : this.completed();
    this.completed.set(completed);
    this.phase.set(nextPhase(finished, completed));
    this.reset();
    this.chime();
  }

  /**
   * A two-note chime, synthesised rather than fetched.
   *
   * An audio file would be a request and a licence question for half a second
   * of sound. Two oscillators cost neither. It stays silent if the browser has
   * not been interacted with — which is fine, because starting the timer is an
   * interaction, so by the time this can fire the context is unlocked.
   */
  private chime(): void {
    try {
      const audio = new AudioContext();
      const at = audio.currentTime;
      for (const [index, frequency] of [880, 1320].entries()) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.frequency.value = frequency;
        osc.type = 'sine';
        // Shaped rather than switched: a square edge on a gain node is an
        // audible click, which is worse than no sound at all.
        gain.gain.setValueAtTime(0, at + index * 0.18);
        gain.gain.linearRampToValueAtTime(0.2, at + index * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, at + index * 0.18 + 0.25);
        osc.connect(gain).connect(audio.destination);
        osc.start(at + index * 0.18);
        osc.stop(at + index * 0.18 + 0.3);
      }
      setTimeout(() => void audio.close(), 1000);
    } catch {
      // No audio available. The phase still changed, which is the part that
      // matters.
    }
  }
}
