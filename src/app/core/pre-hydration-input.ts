import { isPlatformBrowser } from '@angular/common';
import { ApplicationRef, inject, Injectable, PLATFORM_ID } from '@angular/core';
import { first } from 'rxjs';

/** What the inline recorder in index.html leaves behind for us. */
interface EarlyInput {
  seen: Array<{ el: HTMLInputElement | HTMLTextAreaElement; value: string }>;
  stop(): void;
}

declare global {
  interface Window {
    __yyEarlyInput?: EarlyInput;
  }
}

/**
 * Gives a tool back whatever the visitor had already put into it.
 *
 * Every tool route is prerendered, so its controls are on screen and usable
 * before the component bound to them exists — the tool itself arrives in a
 * lazy route chunk. A file chosen in that window reaches an input nobody is
 * listening to, and text typed into one is overwritten the moment the
 * component hydrates and writes its own empty signal to `[value]`. Either way
 * the visitor's work disappears with no spinner and no error, which reads as
 * the tool being broken.
 *
 * The recording half has to run before the bundle does, so it lives inline in
 * index.html. This half waits for the application to settle — by which time
 * the route chunk has loaded and its component has hydrated — and then puts
 * each control back and fires the event its handler is now listening for.
 *
 * Both checks below exist to make a double-application impossible, because
 * `withEventReplay()` may well have delivered the same event already: a text
 * box whose value still matches is left alone, and a file input is only
 * re-fired while it is still holding files, which every consumer here clears
 * as soon as it has taken them.
 */
@Injectable({ providedIn: 'root' })
export class PreHydrationInput {
  private readonly appRef = inject(ApplicationRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  start(): void {
    const early = this.isBrowser ? window.__yyEarlyInput : undefined;
    if (!early) return;
    this.appRef.isStable.pipe(first(Boolean)).subscribe(() => {
      early.stop();
      this.restore(early.seen);
      early.seen.length = 0;
    });
  }

  private restore(seen: EarlyInput['seen']): void {
    for (const { el, value } of seen) {
      // Navigated away in the meantime, so there is nothing to give back to.
      if (!el.isConnected) continue;

      if (el instanceof HTMLInputElement && el.type === 'file') {
        // Consumers clear `value` once they have taken the files, which also
        // empties `files` — so files still sitting here mean nobody heard.
        if (el.files?.length) el.dispatchEvent(new Event('change', { bubbles: true }));
        continue;
      }

      // Unchanged means something was listening after all.
      if (el.value === value) continue;
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}
