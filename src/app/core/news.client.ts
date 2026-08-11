import { Injectable, computed, signal } from '@angular/core';

/**
 * Fetches the cached technology-news feed from the Worker's `/api/news` route
 * and exposes it as signals for any widget to read.
 *
 * The site is fully prerendered, so news — which changes daily — cannot be baked
 * into the static HTML. Instead one fetch runs in the browser after hydration
 * (kicked off by the first {@link NewsFeed} that mounts, via `afterNextRender`),
 * and every widget on the page shares the result. The Worker does the real
 * caching; this is only a per-session memo so navigating between pages does not
 * refetch.
 *
 * Everything degrades to `unavailable` rather than erroring: under `ng serve`
 * there is no Worker, and in production the feed may simply not be configured
 * yet — in both cases the widgets quietly hide.
 */

/** One story, matching the Worker's `NewsArticle` shape. */
export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  category: string;
  published: string;
}

interface NewsPayload {
  articles: NewsArticle[];
  updated: string;
}

export type NewsStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'unavailable';

@Injectable({ providedIn: 'root' })
export class NewsService {
  private readonly payload = signal<NewsPayload | null>(null);
  private readonly state = signal<NewsStatus>('idle');
  private started = false;

  readonly status = computed(() => this.state());
  readonly articles = computed<readonly NewsArticle[]>(() => this.payload()?.articles ?? []);
  /** ISO time the batch was fetched upstream, or null before it loads. */
  readonly updated = computed<string | null>(() => this.payload()?.updated ?? null);

  /**
   * Starts the single fetch. Safe to call from every widget and on every
   * navigation — it runs at most once per session.
   */
  load(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.state.set('loading');
    void this.run();
  }

  private async run(): Promise<void> {
    let response: Response;
    try {
      response = await fetch('/api/news', { headers: { Accept: 'application/json' } });
    } catch {
      this.state.set('unavailable');
      return;
    }

    // Under `ng serve` there is no Worker, so the SPA fallback answers with
    // index.html and a 200; a configured-but-down feed answers with a JSON
    // error. Anything that is not a JSON success means "no feed here".
    const type = response.headers.get('Content-Type') ?? '';
    if (!response.ok || !type.includes('application/json')) {
      this.state.set('unavailable');
      return;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      this.state.set('unavailable');
      return;
    }

    if (!isPayload(body)) {
      this.state.set('unavailable');
      return;
    }

    this.payload.set(body);
    this.state.set(body.articles.length > 0 ? 'ready' : 'empty');
  }
}

function isPayload(value: unknown): value is NewsPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record['articles']) && typeof record['updated'] === 'string';
}
