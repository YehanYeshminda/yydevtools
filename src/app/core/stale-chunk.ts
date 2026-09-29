import { isPlatformBrowser } from '@angular/common';
import { ErrorHandler, Injectable, PLATFORM_ID, inject } from '@angular/core';
import type { NavigationError } from '@angular/router';

/**
 * Recovering a tab that outlived a deploy.
 *
 * Workers static assets serve only the current deploy, and every route here is
 * a `loadComponent`, so a tab opened before a deploy asks for chunk names that
 * have gone. Two things then did nothing at all when clicked:
 *
 * - a link to another page: the route's import fails and the router gives up;
 * - a link in a tool's long-form copy, which sits in a
 *   `@defer (hydrate on interaction)` block: the click asks for the block's
 *   chunk, that fails (NG0750), and the click is never replayed.
 *
 * Both now load a page from the server, whose fresh HTML names the current
 * chunks. Offline, the service worker answers that load with its cached copy or
 * the offline page, which still beats a link that does nothing.
 */

/** Each engine's own wording for a failed dynamic import. */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(
    message,
  );
}

/** Angular's RuntimeError for a `@defer` block whose dependencies failed to load. */
export function isDeferLoadFailure(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === -750;
}

/** A navigation that failed on a missing chunk becomes a full load of its target. */
export function reloadOnStaleChunk(event: NavigationError): void {
  if (typeof location !== 'undefined' && isStaleChunkError(event.error)) {
    location.assign(event.url);
  }
}

/** A click this recent is what asked for the block that failed to load. */
const CLICK_WINDOW_MS = 5_000;
/** One recovery at a time: a reload that fails the same way must not loop. */
const RELOAD_GUARD_KEY = 'yy:stale-reload';
const RELOAD_GUARD_MS = 30_000;

@Injectable()
export class StaleChunkErrorHandler extends ErrorHandler {
  private lastLink: { href: string; at: number } | null = null;

  constructor() {
    super();
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      // Capture phase, so it is seen before event replay takes the click.
      document.addEventListener(
        'click',
        (event) => {
          const link = (event.target as Element | null)?.closest?.('a[href]');
          this.lastLink = link instanceof HTMLAnchorElement ? { href: link.href, at: Date.now() } : null;
        },
        true,
      );
    }
  }

  override handleError(error: unknown): void {
    super.handleError(error);
    if (typeof location === 'undefined' || !isDeferLoadFailure(error) || recentlyRecovered()) {
      return;
    }
    const link = this.lastLink;
    if (link && Date.now() - link.at < CLICK_WINDOW_MS) {
      location.assign(link.href);
    } else {
      location.reload();
    }
  }
}

function recentlyRecovered(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY));
    if (Date.now() - last < RELOAD_GUARD_MS) return true;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // No storage: recover anyway; a loop needs a failure on every load.
  }
  return false;
}
