import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

/**
 * Tracks the active colour scheme and keeps it in sync with the `data-theme`
 * attribute on <html> (initially set by the inline script in index.html) and
 * with localStorage so the choice survives reloads.
 *
 * This is a browser-only single-page app, so it reads the DOM globals directly
 * rather than injecting DOCUMENT.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly root = document.documentElement;

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
    // Fallback if the inline bootstrap script did not run.
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
