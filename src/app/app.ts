import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CdkMenu, CdkMenuItemRadio, CdkMenuTrigger } from '@angular/cdk/menu';
import { ConnectedPosition } from '@angular/cdk/overlay';
import { NgIcon } from '@ng-icons/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { ConsentService } from './core/consent.service';
import { RecentToolsService } from './core/recent-tools.service';
import { SeoService } from './core/seo.service';
import { ThemePreference, ThemeService } from './core/theme.service';
import { CommandPalette } from './shared/command-palette/command-palette';
import { ConsentBanner } from './shared/consent-banner/consent-banner';
import { TOOLS } from './tools/tools.data';

const TOOL_SLUGS = new Set(TOOLS.map((tool) => tool.slug));

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
    CdkMenuItemRadio,
    NgIcon,
    ConsentBanner,
    CommandPalette,
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

  /**
   * Drives the trigger button. On `system` this deliberately shows the neutral
   * monitor glyph rather than the resolved light/dark one, so the button
   * communicates the choice rather than its current outcome.
   */
  protected readonly activeThemeOption = computed(
    () => THEME_OPTIONS.find((option) => option.value === this.theme.preference()) ?? THEME_OPTIONS[2],
  );

  private readonly router = inject(Router);
  private readonly recents = inject(RecentToolsService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    inject(SeoService).init();
    this.trackRecentTools();
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
