import { Injectable, afterNextRender, computed, signal } from '@angular/core';

const STORAGE_KEY = 'favorites';

/**
 * Remembers which tools the visitor has starred, keyed by tool slug, and keeps
 * the list in localStorage so it survives reloads.
 *
 * The pages are prerendered, so this deliberately starts empty and only reads
 * storage in `afterNextRender` — the first client render has to produce the
 * same DOM as the prerendered HTML or hydration breaks, and the favourites
 * section changes the structure. Storage failures (private mode, disabled
 * cookies) are swallowed: favouriting still works, it just won't persist.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  /** Insertion-ordered, so the favourites row keeps the order they were starred. */
  private readonly slugs = signal<readonly string[]>([]);

  constructor() {
    afterNextRender(() => this.slugs.set(this.read()));
  }

  readonly favorites = this.slugs.asReadonly();
  readonly count = computed(() => this.slugs().length);

  isFavorite(slug: string): boolean {
    return this.slugs().includes(slug);
  }

  toggle(slug: string): void {
    this.slugs.update((current) =>
      current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug],
    );
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
      return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
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
