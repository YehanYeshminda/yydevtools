import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Event as RouterEvent,
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { filter, map } from 'rxjs';

/**
 * Whether a navigation is in flight once this event has been seen, or `null` if
 * the event says nothing either way.
 *
 * The router emits a dozen event types per navigation; only these four open or
 * close one. Mapping the rest to `null` and dropping them is what keeps the bar
 * steady — reading any other event as "not navigating" would flicker it off and
 * on mid-flight. The three closing events have to stay three: a navigation that
 * is cancelled by a guard or fails on a missing chunk never reaches
 * NavigationEnd, and leaving either out strands the bar on screen for good.
 */
export function navigatingAfter(event: RouterEvent): boolean | null {
  if (event instanceof NavigationStart) {
    return true;
  }
  if (
    event instanceof NavigationEnd ||
    event instanceof NavigationCancel ||
    event instanceof NavigationError
  ) {
    return false;
  }
  return null;
}

/**
 * The thin bar across the top of the window while the router is fetching a
 * page.
 *
 * Every route in this app is a `loadComponent`, so opening a tool means waiting
 * on a chunk over the network — usually brief, but long enough that a click can
 * feel like it did nothing. This is the reassurance that it did.
 *
 * Two things it deliberately does not do:
 *
 *  - It never completes. The router reports that a navigation started and that
 *    it finished; it cannot report how much of a chunk has arrived, so any
 *    percentage would be invented. The bar decelerates towards the right and
 *    stops short, which is the honest shape for "working, length unknown" — and
 *    it is the shape every browser's own loading bar uses for the same reason.
 *  - It does not appear for 150ms. Most navigations here finish faster than
 *    that, and a bar that flashes on and off is worse than no bar at all. The
 *    wait is the animation's `animation-delay` rather than a timer, so a
 *    navigation that beats it removes the element before anything is painted:
 *    nothing to cancel, nothing to leak.
 *
 * Decorative, hence `aria-hidden`. A route change already announces itself to a
 * screen reader through the page title (see core/seo.service.ts); a live region
 * here would only say the same thing twice.
 */
@Component({
  selector: 'app-nav-progress',
  imports: [],
  template: `
    @if (navigating()) {
      <div class="bar"></div>
    }
  `,
  host: {
    'aria-hidden': 'true',
  },
  styles: `
    :host {
      position: fixed;
      inset-block-start: 0;
      inset-inline: 0;
      height: 3px;
      /* Over the sticky appbar (z-index 10), under the command palette (200). */
      z-index: 20;
      pointer-events: none;
    }

    .bar {
      height: 100%;
      width: 0;
      background: var(--primary);
      border-end-end-radius: 3px;
      border-start-end-radius: 3px;
      /* Fast at first, then progressively slower, stopping short of the edge — a
         long wait still looks like it is moving, without ever promising it is
         nearly done. The 150ms delay is what keeps a quick navigation from
         flashing a bar: until it elapses the width above is still 0. */
      animation: app-nav-progress-creep 8s cubic-bezier(0.12, 0.82, 0.24, 1) 150ms forwards;
    }

    @keyframes app-nav-progress-creep {
      to {
        width: 92%;
      }
    }

    /* No travel: the bar fades in at a fixed width after the same delay. It
       still says "working" — it just does not slide across the screen. */
    @media (prefers-reduced-motion: reduce) {
      .bar {
        width: 35%;
        opacity: 0;
        animation: app-nav-progress-fade 120ms linear 150ms forwards;
      }
    }

    @keyframes app-nav-progress-fade {
      to {
        opacity: 1;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavProgress {
  private readonly router = inject(Router);

  /**
   * True between a navigation starting and it ending, being cancelled or
   * failing. On the server this settles to false before the page is serialized
   * — prerendering waits for the app to be stable, which is precisely the point
   * at which navigation has finished — so no static page ships with a bar in it.
   */
  protected readonly navigating = toSignal(
    this.router.events.pipe(
      map(navigatingAfter),
      filter((navigating): navigating is boolean => navigating !== null),
    ),
    { initialValue: false },
  );
}
