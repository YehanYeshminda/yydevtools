import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideIcons, provideNgIconsConfig } from '@ng-icons/core';

import { routes } from './app.routes';
import { APP_ICONS } from './core/icons';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideIcons(APP_ICONS),
    // Sizing in `em` rather than px keeps mat-icon's semantics, where an icon
    // scales with the font-size set on it. The 24px default that mat-icon had
    // is applied once in styles.css, so the existing per-icon rules — which all
    // work by setting font-size — keep working untouched.
    provideNgIconsConfig({ size: '1em' }),
    // `skipInitialTransition` keeps the first paint after hydration instant — the
    // route is already on screen from the prerender, so animating it in would only
    // add a flash. The actual fade is opted into per-preference in styles.css.
    //
    // Scrolling is NOT the router's default: left alone it keeps whatever scroll
    // offset the previous page had, so opening a tool from halfway down the home
    // directory dropped you into the middle of the tool page. `enabled` sends every
    // forward navigation to the top and restores the remembered offset on back and
    // forward, which is what the browser does for a normal multi-page site.
    //
    // `anchorScrolling` is deliberately left off. The only fragments this app puts
    // in a URL are share-link state payloads (`#s=…` — see core/tool-state.ts), and
    // with anchor scrolling on the router would try to scroll to an element named
    // after the payload and skip the scroll-to-top fallback when it found none.
    provideRouter(
      routes,
      withViewTransitions({ skipInitialTransition: true }),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    provideHttpClient(),
    provideClientHydration(withEventReplay()),
  ],
};
