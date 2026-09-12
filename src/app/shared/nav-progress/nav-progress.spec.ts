import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  RouteConfigLoadEnd,
  RouteConfigLoadStart,
  Scroll,
} from '@angular/router';
import { describe, expect, it } from 'vitest';

import { navigatingAfter } from './nav-progress';

/**
 * The failure this guards against is a bar that never goes away. It is driven
 * by a stream of router events, so getting the set of closing events wrong
 * leaves a stripe pinned across the top of the site until the next full page
 * load — and only on the uncommon paths (a cancelled or failed navigation),
 * which is exactly where nobody looks.
 */
describe('navigatingAfter', () => {
  it('opens on NavigationStart', () => {
    expect(navigatingAfter(new NavigationStart(1, '/tools/json-formatter'))).toBe(true);
  });

  it('closes on every way a navigation can finish', () => {
    expect(navigatingAfter(new NavigationEnd(1, '/tools/x', '/tools/x'))).toBe(false);
    // A guard turning the navigation away.
    expect(navigatingAfter(new NavigationCancel(1, '/tools/x', 'blocked'))).toBe(false);
    // The realistic one here: a lazy chunk that fails to load.
    expect(navigatingAfter(new NavigationError(1, '/tools/x', new Error('chunk failed')))).toBe(
      false,
    );
  });

  it('says nothing about the events in between', () => {
    // These fire *during* a navigation. Reading any of them as "finished" would
    // flicker the bar off and straight back on.
    expect(navigatingAfter(new RouteConfigLoadStart({}))).toBeNull();
    expect(navigatingAfter(new RouteConfigLoadEnd({}))).toBeNull();
    expect(navigatingAfter(new Scroll(new NavigationEnd(1, '/a', '/a'), null, null))).toBeNull();
  });

  it('ignores a skipped navigation rather than closing one', () => {
    // NavigationSkipped is emitted *instead of* NavigationStart, never after it
    // (see the two emission sites in Angular's navigation_transition), so there
    // is no bar open for it to close and nothing to strand.
    expect(navigatingAfter(new NavigationSkipped(1, '/tools/x', 'same url'))).toBeNull();
  });
});
