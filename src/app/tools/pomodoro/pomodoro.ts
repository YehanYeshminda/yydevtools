import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';

import { askToConfirm } from '../../shared/confirm-dialog/confirm-dialog';
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
  private readonly dialog = inject(MatDialog);

  /** Guards against a second dialog while the first is still being answered. */
  private asking = false;

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

  protected async setMode(mode: PomodoroMode): Promise<void> {
    const name = mode === 'stopwatch' ? 'Stopwatch' : 'Pomodoro';
    if (await this.discards(`Switch to ${name}?`)) {
      return;
    }
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

  /**
   * Puts the length actually in use back into the field, once you leave it.
   *
   * Typing 400 into a field that stops at 360 clamps the timer but not the box:
   * the second over-long number clamps to the same value as the first, the
   * bound signal does not change, and Angular has nothing to write back — so
   * the field sits there claiming 400 while the clock counts six hours. Done on
   * `change` rather than on every keystroke, or the first digit of 25 would be
   * rewritten as 2 before the 5 arrived.
   */
  protected showClamped(phase: keyof typeof PHASES, input: HTMLInputElement): void {
    input.value = String(this.lengths()[phase]);
  }

  protected async choosePhase(phase: keyof typeof PHASES): Promise<void> {
    if (phase !== this.phase() && (await this.discards(`Switch to ${PHASES[phase].name}?`))) {
      return;
    }
    this.timer.choosePhase(phase);
  }

  protected resetCycle(): void {
    this.timer.resetCycle();
  }

  /**
   * Asks before a switch that would throw away a session already under way, and
   * reports whether the reader backed out.
   *
   * Both tab rows reset the clock on the way through. That is right when
   * nothing is running and silent data loss when something is: twenty-four
   * minutes banked, one click on Short break, gone with no way back and no
   * warning. A paused session counts too — it is still work you did.
   *
   * The question names what is at stake rather than asking whether you are
   * sure, because "Focus, 24:03 left" is the fact you need and "are you sure"
   * is not.
   */
  private async discards(question: string): Promise<boolean> {
    if (!this.timer.active()) {
      return false;
    }
    // A double click on the tab; the dialog already open is the one that decides.
    if (this.asking) {
      return true;
    }
    this.asking = true;
    try {
      const confirmed = await askToConfirm(this.dialog, {
        title: question,
        message: `That ends what is running now — ${this.timer.label()}.`,
        confirmLabel: 'Switch anyway',
        cancelLabel: 'Keep going',
      });
      return !confirmed;
    } finally {
      this.asking = false;
    }
  }
}
