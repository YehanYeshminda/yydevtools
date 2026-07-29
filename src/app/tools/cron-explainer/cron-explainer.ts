import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { explainCron } from './cron-schedule';
import { ToolContent } from '../../shared/tool-content/tool-content';

type Zone = 'local' | 'utc';

interface Example {
  expression: string;
  label: string;
}

const RUN_COUNT = 8;

const EXAMPLES: Example[] = [
  { expression: '*/15 * * * *', label: 'Every 15 minutes' },
  { expression: '0 9 * * 1-5', label: 'Weekdays at 9am' },
  { expression: '0 0 1 * *', label: 'First of the month' },
  { expression: '0 3 * * 0', label: 'Sundays at 3am' },
];

@Component({
  selector: 'app-cron-explainer',
  imports: [ToolContent, RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './cron-explainer.html',
  styleUrls: ['../tool-shell.css', './cron-explainer.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CronExplainerTool {
  protected readonly examples = EXAMPLES;

  protected readonly expression = signal('0 9 * * 1-5');
  protected readonly zone = signal<Zone>('local');

  /** Anchor for "next runs"; refreshable so the preview can be re-pinned to now. */
  private readonly now = signal(new Date());

  private readonly localZone = new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  protected readonly timeZone = computed(() => (this.zone() === 'utc' ? 'UTC' : this.localZone));

  private readonly formatter = computed(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: this.timeZone(),
      }),
  );

  protected readonly preview = computed(() =>
    explainCron(this.expression(), {
      from: this.now(),
      tz: this.timeZone(),
      count: RUN_COUNT,
    }),
  );

  protected readonly hasInput = computed(() => this.expression().trim().length > 0);

  protected readonly formattedRuns = computed(() =>
    this.preview().runs.map((run) => this.formatter().format(run)),
  );

  protected onExpressionInput(event: Event): void {
    this.expression.set((event.target as HTMLInputElement).value);
  }

  protected useExample(expression: string): void {
    this.expression.set(expression);
  }

  protected setZone(zone: Zone): void {
    this.zone.set(zone);
  }

  protected refresh(): void {
    this.now.set(new Date());
  }
}
