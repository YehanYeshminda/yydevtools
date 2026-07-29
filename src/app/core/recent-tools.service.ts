import { Injectable, afterNextRender, computed, signal } from '@angular/core';

const STORAGE_KEY = 'recent-tools';
const MAX_RECENT = 6;

/**
 * Remembers the tools the visitor opened most recently, keyed by slug, newest
 * first. Backs the "Recently used" row in the command palette.
 *
 * Mirrors {@link FavoritesService}: the pages are prerendered, so it starts
 * empty and only touches storage in `afterNextRender` — the first client render
 * must match the prerendered HTML or hydration breaks. Storage failures
 * (private mode, disabled cookies) are swallowed; the in-memory signal is still
 * the source of truth.
 */
@Injectable({ providedIn: 'root' })
export class RecentToolsService {
  private readonly slugs = signal<readonly string[]>([]);

  constructor() {
    afterNextRender(() => this.slugs.set(this.read()));
  }

  /** Most-recently-opened first, capped at {@link MAX_RECENT}. */
  readonly recent = this.slugs.asReadonly();
  readonly count = computed(() => this.slugs().length);

  /** Record a visit: move `slug` to the front, dropping any older entry for it. */
  record(slug: string): void {
    this.slugs.update((current) => [slug, ...current.filter((s) => s !== slug)].slice(0, MAX_RECENT));
    this.write();
  }

  private read(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed: unknown = JSON.parse(raw);
      // Guard against a hand-edited or stale value in storage.
      return Array.isArray(parsed)
        ? parsed.filter((s): s is string => typeof s === 'string').slice(0, MAX_RECENT)
        : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.slugs()));
    } catch {
      // Ignore storage failures; the in-memory signal is still the source of truth.
    }
  }
}
