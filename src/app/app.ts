import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  CdkMenu,
  CdkMenuGroup,
  CdkMenuItem,
  CdkMenuItemRadio,
  CdkMenuTrigger,
} from '@angular/cdk/menu';
import { ConnectedPosition } from '@angular/cdk/overlay';
import { NgIcon } from '@ng-icons/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { ConsentService } from './core/consent.service';
import { FavoritesService } from './core/favorites.service';
import { registerServiceWorker } from './core/pwa';
import { RecentToolsService } from './core/recent-tools.service';
import { SeoService } from './core/seo.service';
import { ThemePreference, ThemeService } from './core/theme.service';
import { CommandPalette } from './shared/command-palette/command-palette';
import { ConsentBanner } from './shared/consent-banner/consent-banner';
import { NewsFeed } from './shared/news-feed/news-feed';
import { CATEGORY_META, Tool } from './tools/tool.model';
import { TOOLS, TOOL_CATEGORIES } from './tools/tools.data';

const TOOL_SLUGS = new Set(TOOLS.map((tool) => tool.slug));
const TOOLS_BY_SLUG = new Map(TOOLS.map((tool) => [tool.slug, tool]));

/** One row in the Browse menu's category list. */
interface CategoryLink {
  name: string;
  icon: string;
  count: number;
}

/**
 * Counted once at module load: the catalog is a static import, so these numbers
 * cannot change while the app is running.
 */
const CATEGORY_LINKS: readonly CategoryLink[] = TOOL_CATEGORIES.map((category) => ({
  name: category,
  icon: CATEGORY_META[category].icon,
  count: TOOLS.filter((tool) => tool.category === category).length,
}));

/** How many shortcuts each of the favourites and recents groups will show. */
const MENU_ROWS = 5;

interface ThemeOption {
  value: ThemePreference;
  label: string;
  icon: string;
}

const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: 'light', label: 'Light', icon: 'matLightModeOutline' },
  { value: 'dark', label: 'Dark', icon: 'matDarkModeOutline' },
  { value: 'system', label: 'System', icon: 'matComputerOutline' },
];

/**
 * The trigger sits hard against the right edge of the bar, so the panel has to
 * hang leftward from it — CDK's default (left edges aligned) runs it straight
 * off the viewport. The second entry flips it above the trigger if there is no
 * room below.
 */
const THEME_MENU_POSITION: readonly ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
];

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    CdkMenuTrigger,
    CdkMenu,
    CdkMenuGroup,
    CdkMenuItem,
    CdkMenuItemRadio,
    NgIcon,
    ConsentBanner,
    CommandPalette,
    NewsFeed,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly theme = inject(ThemeService);
  protected readonly consent = inject(ConsentService);
  protected readonly year = new Date().getFullYear();
  protected readonly themeOptions = THEME_OPTIONS;
  protected readonly themeMenuPosition = THEME_MENU_POSITION;
  protected readonly categoryLinks = CATEGORY_LINKS;
  protected readonly toolCount = TOOLS.length;

  /**
   * Drives the trigger button. On `system` this deliberately shows the neutral
   * monitor glyph rather than the resolved light/dark one, so the button
   * communicates the choice rather than its current outcome.
   */
  protected readonly activeThemeOption = computed(
    () => THEME_OPTIONS.find((option) => option.value === this.theme.preference()) ?? THEME_OPTIONS[2],
  );

  /**
   * The modifier shown on the search button. Pages are prerendered, so this
   * starts on the majority answer and is corrected after hydration rather than
   * guessed at build time, where there is no platform to read.
   */
  protected readonly shortcutHint = signal('Ctrl K');

  private readonly router = inject(Router);
  private readonly recents = inject(RecentToolsService);
  private readonly favorites = inject(FavoritesService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Starred tools, for the Browse menu. Both services start empty and fill in
   * after hydration, so on a prerendered page these groups simply are not in the
   * served HTML — which is correct: they are per-visitor, and nothing about them
   * belongs in a cached document.
   */
  protected readonly favoriteTools = computed(() =>
    this.favorites.favorites().slice(0, MENU_ROWS).map(toTool).filter(isTool),
  );

  /**
   * Recently opened tools, minus anything already starred above — the menu is
   * short, and a tool listed twice in it wastes one of the few rows there are.
   */
  protected readonly recentTools = computed(() => {
    const starred = new Set(this.favorites.favorites());
    return this.recents
      .recent()
      .filter((slug) => !starred.has(slug))
      .slice(0, MENU_ROWS)
      .map(toTool)
      .filter(isTool);
  });

  /** The current path, tracked so the news strip can bow out where it is redundant. */
  private readonly currentPath = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split(/[?#]/)[0]),
    ),
    { initialValue: this.router.url.split(/[?#]/)[0] },
  );

  /**
   * The site-wide news strip shows above the footer everywhere except the two
   * pages where it would be noise: /news (which already lists the feed) and the
   * 404 page. This is evaluated during prerender too, so each page's static HTML
   * either carries the strip's shell or omits it — no hydration mismatch.
   */
  protected readonly showNewsStrip = computed(() => {
    const path = this.currentPath();
    return path !== '/news' && path !== '/404';
  });

  constructor() {
    inject(SeoService).init();
    registerServiceWorker();
    this.trackRecentTools();

    afterNextRender(() => {
      // iPadOS reports itself as a Mac, which is the right answer anyway: the
      // shortcut only exists for someone with a keyboard attached, and on that
      // keyboard the key is ⌘.
      if (/Mac|iPhone|iPad|iPod/.test(navigator.userAgent)) {
        this.shortcutHint.set('⌘ K');
      }
    });
  }

  /** Note each tool page the visitor lands on, so the palette can offer it back. */
  private trackRecentTools(): void {
    if (!this.isBrowser) {
      return;
    }
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        const slug = /^\/tools\/([^/?#]+)/.exec(this.router.url)?.[1];
        if (slug && TOOL_SLUGS.has(slug)) {
          this.recents.record(slug);
        }
      });
  }
}

/** Slug to catalog entry; `undefined` for a slug left over from an older build. */
function toTool(slug: string): Tool | undefined {
  return TOOLS_BY_SLUG.get(slug);
}

function isTool(tool: Tool | undefined): tool is Tool {
  return tool !== undefined;
}
