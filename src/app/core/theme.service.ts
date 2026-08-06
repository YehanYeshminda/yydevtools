import { DOCUMENT, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** What the visitor asked for. `system` defers to the OS setting. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** What is actually painted — `system` resolved against the media query. */
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const isPreference = (value: unknown): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system';

/**
 * Tracks the active colour scheme and keeps it in sync with the `data-theme`
 * attribute on <html> (initially set by the inline script in index.html) and
 * with localStorage so the choice survives reloads.
 *
 * Two signals rather than one: `preference` is what the visitor picked and what
 * the picker highlights, `theme` is what is actually painted. They differ only
 * while `preference` is `system`, in which case a media-query listener keeps
 * `theme` following the OS live — without it, a visitor on `system` would have
 * to reload to see a change they made outside the page.
 *
 * Pages are prerendered, so this injects DOCUMENT rather than reaching for the
 * global and guards the browser-only APIs. During prerendering there is no
 * stored preference, so the static HTML is built as light; the inline script
 * then sets the real attribute before Angular boots, and this service reads it
 * back on construction. Only text content differs in that window, which
 * hydration tolerates.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly root = inject(DOCUMENT).documentElement;

  /** Tracks the OS setting; only consulted while the preference is `system`. */
  private readonly systemDark = signal(false);

  readonly preference = signal<ThemePreference>(this.readStoredPreference());

  readonly theme = computed<Theme>(() => {
    const preference = this.preference();
    if (preference !== 'system') {
      return preference;
    }
    return this.systemDark() ? 'dark' : 'light';
  });

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    const query = window.matchMedia(DARK_QUERY);
    this.systemDark.set(query.matches);
    query.addEventListener('change', (event) => {
      this.systemDark.set(event.matches);
      // Only repaints when the preference is `system`; `apply` reads the
      // computed value, which is pinned in the other two cases.
      this.apply();
    });
    // The inline script already painted the right colours, but the attribute it
    // wrote is the resolved theme. Re-assert from our own state so a stored
    // `system` preference lines up with what the computed signal now says.
    this.apply();
  }

  /** Cycles light → dark → system, the order the picker lists them in. */
  toggle(): void {
    const next: Record<ThemePreference, ThemePreference> = {
      light: 'dark',
      dark: 'system',
      system: 'light',
    };
    this.set(next[this.preference()]);
  }

  set(preference: ThemePreference): void {
    this.preference.set(preference);
    this.apply();
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Ignore storage failures (private mode, disabled cookies, etc.).
    }
  }

  private apply(): void {
    this.root.setAttribute('data-theme', this.theme());
  }

  private readStoredPreference(): ThemePreference {
    if (!this.isBrowser) {
      return 'light';
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isPreference(stored)) {
        return stored;
      }
    } catch {
      // Ignore storage failures and fall through to the system default.
    }
    // No explicit choice on record — follow the OS, which is also what the
    // inline bootstrap script assumed when it painted the first frame.
    return 'system';
  }
}
