import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';

import { NewsService } from '../../core/news.client';

/** One story, shaped for the template (relative time pre-computed). */
interface NewsItem {
  title: string;
  description: string;
  url: string;
  source: string;
  /** "just now" / "3h ago" / "2d ago", or '' if the timestamp was unparseable. */
  when: string;
  /** "theverge.com · 3h ago" — the compact strip's single meta line. */
  meta: string;
}

/**
 * Renders the shared news feed in one of two shapes:
 *
 *  - `strip`  — a slim band shown above the footer on nearly every page. It only
 *    appears once stories have loaded, so it never leaves a gap on a page whose
 *    feed is unavailable (e.g. under `ng serve`, where there is no Worker).
 *  - `full`   — the list on the dedicated /news page, with a loading skeleton and
 *    a friendly empty state so that page is never blank.
 *
 * The first instance to render triggers the single per-session fetch in
 * {@link NewsService}; every instance then reads the same signals.
 */
@Component({
  selector: 'app-news-feed',
  imports: [RouterLink, NgIcon],
  templateUrl: './news-feed.html',
  styleUrl: './news-feed.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsFeed {
  private readonly news = inject(NewsService);

  readonly variant = input<'strip' | 'full'>('strip');
  /** How many stories to show. The strip stays short; /news shows more. */
  readonly limit = input(6);
  /**
   * Hides the strip's content even once loaded, without removing the host from
   * the DOM — used on the pages where the strip would duplicate the feed (/news)
   * or add noise (/404), while keeping the first render identical everywhere.
   */
  readonly suppressed = input(false);

  protected readonly status = this.news.status;
  protected readonly skeletonRows = [0, 1, 2, 3];

  /** Coarser than `status`: what the `full` layout should actually render. */
  protected readonly view = computed<'list' | 'skeleton' | 'empty'>(() => {
    const status = this.status();
    if (status === 'ready') {
      return 'list';
    }
    if (status === 'idle' || status === 'loading') {
      return 'skeleton';
    }
    return 'empty';
  });

  protected readonly items = computed<NewsItem[]>(() => {
    const articles = this.news.articles();
    if (articles.length === 0) {
      return [];
    }
    // Only reached in the browser (articles populate after the client fetch), so
    // reading the clock here is safe and deterministic for prerendering.
    const now = Date.now();
    return articles.slice(0, this.limit()).map((article) => {
      const when = timeAgo(article.published, now);
      return {
        title: article.title,
        description: article.description,
        url: article.url,
        source: article.source,
        when,
        meta: when ? `${article.source} · ${when}` : article.source,
      };
    });
  });

  protected readonly updatedLabel = computed<string | null>(() => {
    const updated = this.news.updated();
    if (!updated) {
      return null;
    }
    return timeAgo(updated, Date.now()) || null;
  });

  constructor() {
    afterNextRender(() => this.news.load());
  }
}

/** A compact, dependency-free "time since" label. */
function timeAgo(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return '';
  }
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) {
    return 'just now';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
