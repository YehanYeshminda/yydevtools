import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { AiStatusService, type AiService } from '../../core/ai-status.client';
import { ClipboardService } from '../../core/clipboard.service';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import {
  BADGE_BASE,
  STATE_LABELS,
  STATUS_PAGE,
  badgeSnippet,
  minutesAgo,
  type BadgeFormat,
} from './ai-status-format';

type Filter = 'all' | 'issues' | 'starred';

const STARS_KEY = 'ai-status-stars';

@Component({
  selector: 'app-ai-status',
  imports: [ToolPage, ToolContent, MatButtonModule, NgIcon],
  templateUrl: './ai-status.html',
  styleUrls: ['../tool-shell.css', './ai-status.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiStatusTool {
  private readonly feed = inject(AiStatusService);
  private readonly clipboard = inject(ClipboardService);

  protected readonly labels = STATE_LABELS;
  protected readonly statusPage = STATUS_PAGE;

  protected readonly load = this.feed.status;
  protected readonly services = this.feed.services;

  protected readonly query = signal('');
  protected readonly filter = signal<Filter>('all');
  /** Starred service ids. Read from storage after the first render, like the tool favourites. */
  protected readonly stars = signal<readonly string[]>([]);
  /** Ticks every 30 s once the page is live, so "updated N min ago" stays true. */
  private readonly now = signal(0);

  /** Degraded, down or in maintenance. "No data" is not evidence of a problem, so it is not one. */
  protected readonly issues = computed(() => this.services().filter(hasIssue));

  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const stars = this.stars();
    const filter = this.filter();
    return this.services()
      .filter((service) => {
        if (filter === 'issues' && !hasIssue(service)) return false;
        if (filter === 'starred' && !stars.includes(service.id)) return false;
        return !q || service.name.toLowerCase().includes(q) || service.id.includes(q);
      })
      .sort(
        (a, b) =>
          Number(stars.includes(b.id)) - Number(stars.includes(a.id)) ||
          a.name.localeCompare(b.name),
      );
  });

  protected readonly updatedAgo = computed(() => {
    const updated = this.feed.updated();
    return updated && this.now() ? minutesAgo(updated, this.now()) : '';
  });

  // Badge panel ------------------------------------------------------------
  protected readonly badgeId = signal('');
  protected readonly badgeFormat = signal<BadgeFormat>('markdown');
  protected readonly badgeService = computed(() =>
    this.services().find((service) => service.id === this.badgeId()),
  );
  protected readonly badgeUrl = computed(() => {
    const service = this.badgeService();
    return service ? `${BADGE_BASE}${service.id}.svg` : '';
  });
  protected readonly badgeCode = computed(() => {
    const service = this.badgeService();
    return service ? badgeSnippet(service, this.badgeFormat()) : '';
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.stars.set(readStars());
      this.now.set(Date.now());
      const timer = setInterval(() => this.now.set(Date.now()), 30_000);
      destroyRef.onDestroy(() => clearInterval(timer));
      this.feed.load();
    });
  }

  protected isStarred(id: string): boolean {
    return this.stars().includes(id);
  }

  protected toggleStar(id: string): void {
    this.stars.update((current) =>
      current.includes(id) ? current.filter((star) => star !== id) : [...current, id],
    );
    try {
      localStorage.setItem(STARS_KEY, JSON.stringify(this.stars()));
    } catch {
      // Storage unavailable: the star still works for this visit.
    }
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onBadgeService(event: Event): void {
    this.badgeId.set((event.target as HTMLSelectElement).value);
  }

  protected refresh(): void {
    this.feed.reload();
    this.now.set(Date.now());
  }

  protected copyBadge(): void {
    void this.clipboard.copy(this.badgeCode(), { label: 'Badge code' });
  }

  protected uptime(service: AiService): string {
    return service.uptime30dPct === null ? '' : `${service.uptime30dPct.toFixed(2)}% uptime (30 d)`;
  }
}

function hasIssue(service: AiService): boolean {
  return (
    service.state === 'degraded' || service.state === 'outage' || service.state === 'maintenance'
  );
}

function readStars(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STARS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
