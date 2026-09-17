import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { PomodoroService, type PomodoroMode } from './pomodoro.service';
import { LONG_BREAK_EVERY, MAX_MINUTES, MIN_MINUTES, PHASES, formatStopwatch } from './timer';

/**
 * The timer's screen.
 *
 * Every piece of state lives in PomodoroService, which is root-provided, so a
 * session started here keeps running once you navigate away to use another
 * tool — and the header shows it while you are gone. This component is only
 * the view.
 */
@Component({
  selector: 'app-pomodoro',
  imports: [ToolPage, ToolContent, MatButtonModule, NgIcon],
  templateUrl: './pomodoro.html',
  styleUrls: ['../tool-shell.css', './pomodoro.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PomodoroTool {
  protected readonly timer = inject(PomodoroService);

  protected readonly phases = PHASES;
  protected readonly minMinutes = MIN_MINUTES;
  protected readonly maxMinutes = MAX_MINUTES;
  protected readonly longBreakEvery = LONG_BREAK_EVERY;
  protected readonly formatStopwatch = formatStopwatch;

  protected readonly mode = this.timer.mode;
  protected readonly running = this.timer.running;
  protected readonly phase = this.timer.phase;
  protected readonly completed = this.timer.completed;
  protected readonly lengths = this.timer.lengths;
  protected readonly display = this.timer.display;
  protected readonly phaseInfo = this.timer.phaseInfo;
  protected readonly isBreak = this.timer.isBreak;
  protected readonly canLap = this.timer.canLap;
  protected readonly lapList = this.timer.lapList;

  /** Stroke offset for the progress ring, as a fraction of its circumference. */
  protected readonly ringOffset = computed(() => `${(1 - this.timer.progress()) * 100}`);

  protected setMode(mode: PomodoroMode): void {
    this.timer.setMode(mode);
  }

  protected toggle(): void {
    this.timer.toggle();
  }

  protected reset(): void {
    this.timer.reset();
  }

  protected lap(): void {
    this.timer.lap();
  }

  protected setLength(phase: keyof typeof PHASES, value: string): void {
    this.timer.setLength(phase, value);
  }

  protected choosePhase(phase: keyof typeof PHASES): void {
    this.timer.choosePhase(phase);
  }

  protected resetCycle(): void {
    this.timer.resetCycle();
  }
}
