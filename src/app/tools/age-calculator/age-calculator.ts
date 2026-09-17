import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import {
  calendarSpan,
  describeSpan,
  formatDate,
  nextAnniversary,
  parseDate,
  today,
  totalsBetween,
  weekdayOf,
} from './age';

/** One line of the totals list. */
interface Total {
  label: string;
  value: string;
}

@Component({
  selector: 'app-age-calculator',
  imports: [ToolPage, ToolContent, ShareLink, MatButtonModule, NgIcon],
  templateUrl: './age-calculator.html',
  styleUrls: ['../tool-shell.css', './age-calculator.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgeCalculatorTool {
  private readonly clipboard = inject(ClipboardService);

  /**
   * Read once, at construction.
   *
   * There is no ticking clock here as there is in the Timestamp Converter: a
   * page open across midnight showing yesterday's day count is a far smaller
   * problem than the results shifting under someone mid-read.
   */
  private readonly now = today();

  protected readonly from = signal('');
  protected readonly to = signal(formatDate(today()));

  protected readonly shared = syncToolState({
    key: 'age-calculator',
    snapshot: () => ({ from: this.from(), to: this.to() }),
    restore: (state) => {
      // Checked rather than trusted: a shared link can be hand-edited, and a
      // native date input never emits anything but '' or a real date, so this
      // is the only door a non-date could come through.
      if (typeof state.from === 'string' && parseDate(state.from)) {
        this.from.set(state.from);
      }
      if (typeof state.to === 'string' && parseDate(state.to)) {
        this.to.set(state.to);
      }
    },
  });

  /** Both dates, ordered earliest first, or null while either is incomplete. */
  private readonly range = computed(() => {
    const first = parseDate(this.from());
    const second = parseDate(this.to());
    if (!first || !second) {
      return null;
    }
    // Ordered rather than refused: someone counting down to a date puts it in
    // the second field, someone counting up from one puts it in the first, and
    // both want the same answer.
    const reversed = first > second;
    return {
      start: reversed ? second : first,
      end: reversed ? first : second,
      reversed,
    };
  });

  protected readonly ready = computed(() => this.range() !== null);
  protected readonly reversed = computed(() => this.range()?.reversed ?? false);

  protected readonly span = computed(() => {
    const range = this.range();
    return range ? calendarSpan(range.start, range.end) : null;
  });

  protected readonly headline = computed(() => {
    const span = this.span();
    return span ? describeSpan(span) : '';
  });

  protected readonly totals = computed<Total[]>(() => {
    const range = this.range();
    if (!range) {
      return [];
    }
    const totals = totalsBetween(range.start, range.end);
    const number = new Intl.NumberFormat();
    return [
      { label: 'Days', value: number.format(totals.days) },
      {
        label: 'Weeks',
        value: totals.weekDays
          ? `${number.format(totals.weeks)} and ${totals.weekDays} days`
          : number.format(totals.weeks),
      },
      { label: 'Months', value: number.format(totals.months) },
      { label: 'Weekdays', value: number.format(totals.workDays) },
      { label: 'Hours', value: number.format(totals.hours) },
      { label: 'Minutes', value: number.format(totals.minutes) },
    ];
  });

  /** The weekday the earlier date fell on — the "what day was I born" answer. */
  protected readonly startWeekday = computed(() => {
    const range = this.range();
    return range ? weekdayOf(range.start) : '';
  });

  /**
   * The next time the earlier date comes round, counted from today rather than
   * from the second field: "your next birthday" means the next one from now,
   * whatever range is on screen.
   */
  protected readonly anniversary = computed(() => {
    const range = this.range();
    if (!range) {
      return null;
    }
    const next = nextAnniversary(range.start, this.now);
    return {
      daysAway: next.daysAway,
      date: next.date.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    };
  });

  protected setFrom(value: string): void {
    this.from.set(value);
  }

  protected setTo(value: string): void {
    this.to.set(value);
  }

  protected useToday(): void {
    this.to.set(formatDate(this.now));
  }

  protected swap(): void {
    const from = this.from();
    this.from.set(this.to());
    this.to.set(from);
  }

  protected clear(): void {
    this.from.set('');
    this.to.set(formatDate(this.now));
  }

  protected copy(): void {
    const lines = [
      this.headline(),
      ...this.totals().map((total) => `${total.label}: ${total.value}`),
    ];
    void this.clipboard.copy(lines.join('\n'), { label: 'Result' });
  }
}
