import { DOCUMENT, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

/**
 * Tracks the active colour scheme and keeps it in sync with the `data-theme`
 * attribute on <html> (initially set by the inline script in index.html) and
 * with localStorage so the choice survives reloads.
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

  readonly theme = signal<Theme>(this.readInitial());

  toggle(): void {
    this.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    this.theme.set(theme);
    this.root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures (private mode, disabled cookies, etc.).
    }
  }

  private readInitial(): Theme {
    const current = this.root.getAttribute('data-theme');
    if (current === 'dark' || current === 'light') {
      return current;
    }
    if (!this.isBrowser) {
      return 'light';
    }
    // Fallback if the inline bootstrap script did not run.
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
