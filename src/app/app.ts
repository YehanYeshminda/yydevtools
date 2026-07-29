import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { ConsentService } from './core/consent.service';
import { RecentToolsService } from './core/recent-tools.service';
import { SeoService } from './core/seo.service';
import { ThemeService } from './core/theme.service';
import { CommandPalette } from './shared/command-palette/command-palette';
import { ConsentBanner } from './shared/consent-banner/consent-banner';
import { TOOLS } from './tools/tools.data';

const TOOL_SLUGS = new Set(TOOLS.map((tool) => tool.slug));

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConsentBanner, CommandPalette],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly theme = inject(ThemeService);
  protected readonly consent = inject(ConsentService);
  protected readonly year = new Date().getFullYear();

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
