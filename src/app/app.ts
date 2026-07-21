import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ConsentService } from './core/consent.service';
import { SeoService } from './core/seo.service';
import { ThemeService } from './core/theme.service';
import { ConsentBanner } from './shared/consent-banner/consent-banner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConsentBanner],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly theme = inject(ThemeService);
  protected readonly consent = inject(ConsentService);
  protected readonly year = new Date().getFullYear();

  constructor() {
    inject(SeoService).init();
  }
}
