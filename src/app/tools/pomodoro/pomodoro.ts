import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import {
  LONG_BREAK_EVERY,
  MAX_MINUTES,
  MIN_MINUTES,
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

type Mode = 'pomodoro' | 'stopwatch';

/**
 * How often the display is recomputed.
 *
 * The stopwatch shows hundredths, so it needs a frame-ish interval. Nothing
 * about the timing depends on this: elapsed time is always measured against
 * Date.now(), because setInterval drifts and browsers throttle it hard in a
 * background tab — a timer that counted ticks would finish minutes late.
 */
const TICK_MS = 50;

@Component({
  selector: 'app-pomodoro',
  imports: [ToolPage, ToolContent, MatButtonModule, NgIcon],
  templateUrl: './pomodoro.html',
  styleUrls: ['../tool-shell.css', './pomodoro.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PomodoroTool implements OnDestroy {
  protected readonly phases = PHASES;
  protected readonly minMinutes = MIN_MINUTES;
  protected readonly maxMinutes = MAX_MINUTES;
  protected readonly longBreakEvery = LONG_BREAK_EVERY;
  protected readonly formatStopwatch = formatStopwatch;

  protected readonly mode = signal<Mode>('pomodoro');
  protected readonly running = signal(false);

  /** Redrawn on every tick; the source of every elapsed calculation. */
  private readonly now = signal(Date.now());

  /** When the current run began. Null while paused or reset. */
  private startedAt: number | null = null;

  /** Time already banked from previous runs of this phase or stopwatch. */
  private readonly banked = signal(0);

  // --- Pomodoro ---------------------------------------------------------
  protected readonly phase = signal<Phase>('work');
  protected readonly completed = signal(0);
  protected readonly lengths = signal<Record<Phase, number>>({
    work: PHASES.work.minutes,
    short: PHASES.short.minutes,
    long: PHASES.long.minutes,
  });

  // --- Stopwatch --------------------------------------------------------
  protected readonly laps = signal<readonly Lap[]>([]);

  private readonly interval: ReturnType<typeof setInterval>;

  constructor() {
    this.interval = setInterval(() => {
      if (this.running()) {
        this.now.set(Date.now());
        this.checkFinished();
      }
    }, TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(this.interval));
  }

  /** Milliseconds run so far, banked plus whatever the current run has added. */
  protected readonly elapsed = computed(() => {
    const banked = this.banked();
    if (!this.running() || this.startedAt === null) {
      return banked;
    }
    return banked + Math.max(0, this.now() - this.startedAt);
  });

  protected readonly phaseMs = computed(() => this.lengths()[this.phase()] * 60_000);
  protected readonly remaining = computed(() => Math.max(0, this.phaseMs() - this.elapsed()));

  protected readonly display = computed(() =>
    this.mode() === 'stopwatch'
      ? formatStopwatch(this.elapsed())
      : formatDuration(this.remaining()),
  );

  protected readonly progress = computed(() =>
    this.mode() === 'stopwatch' ? 0 : progressOf(this.remaining(), this.phaseMs()),
  );

  /** Stroke offset for the progress ring, as a fraction of its circumference. */
  protected readonly ringOffset = computed(() => `${(1 - this.progress()) * 100}`);

  protected readonly phaseInfo = computed(() => PHASES[this.phase()]);
  protected readonly isBreak = computed(() => this.phase() !== 'work');
  protected readonly canLap = computed(() => this.mode() === 'stopwatch' && this.running());
  protected readonly lapList = computed(() => [...this.laps()].reverse());

  // --- Controls ---------------------------------------------------------
  protected setMode(mode: Mode): void {
    if (mode === this.mode()) {
      return;
    }
    this.mode.set(mode);
    this.reset();
  }

  protected toggle(): void {
    if (this.running()) {
      // Bank what this run added, then stop counting from the wall clock.
      this.banked.set(this.elapsed());
      this.startedAt = null;
      this.running.set(false);
      return;
    }
    this.startedAt = Date.now();
    this.now.set(this.startedAt);
    this.running.set(true);
  }

  protected reset(): void {
    this.running.set(false);
    this.startedAt = null;
    this.banked.set(0);
    this.laps.set([]);
  }

  protected lap(): void {
    if (this.canLap()) {
      this.laps.update((laps) => addLap(laps, this.elapsed()));
    }
  }

  protected setLength(phase: Phase, value: string): void {
    const minutes = clampMinutes(Number(value));
    this.lengths.update((lengths) => ({ ...lengths, [phase]: minutes }));
    if (phase === this.phase()) {
      // Changing the phase you are in restarts it rather than leaving a
      // countdown that is already past its new end.
      this.reset();
    }
  }

  /** Jumps to a phase by hand, for when the plan changes. */
  protected choosePhase(phase: Phase): void {
    this.phase.set(phase);
    this.reset();
  }

  protected resetCycle(): void {
    this.completed.set(0);
    this.phase.set('work');
    this.reset();
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

  ngOnDestroy(): void {
    clearInterval(this.interval);
  }
}
