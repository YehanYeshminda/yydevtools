import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

/**
 * The canonical origin. Every page is reachable on the *.workers.dev URL too,
 * so without an explicit canonical the whole site indexes twice.
 */
export const SITE_URL = 'https://yydevtools.com';

const SITE_NAME = 'YYDevTools';
/** One image for every page: a link preview needs a picture, and the mark is the brand. */
const SOCIAL_IMAGE = `${SITE_URL}/og-image.png`;
const DEFAULT_DESCRIPTION =
  'Free developer and PDF tools that run in your browser — JSON, JWT, Base64, hashing, ' +
  'image compression and PDF editing. No account, no upload, no install.';

/** Per-route SEO copy, read from the router `data` bag. */
export interface SeoData {
  description?: string;
  /** Set on pages that must never be indexed (404, thin utility pages). */
  noindex?: boolean;
}

/**
 * Keeps the description, canonical URL and social cards in step with the active
 * route. The build prerenders every route, so whatever this writes during the
 * prerender pass is baked into the static HTML a crawler receives — it does not
 * depend on the client executing JavaScript.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly document = inject(DOCUMENT);

  /** Called once from the root component. */
  init(): void {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        map(() => this.deepestRoute().snapshot),
      )
      .subscribe((snapshot) =>
        // `snapshot.title` is the route's resolved title. Reading it from the
        // Title service instead would be a page behind: this subscriber runs
        // before the router's title strategy has written the new one.
        this.apply(snapshot.data as SeoData, snapshot.title, this.router.url),
      );
  }

  private deepestRoute(): ActivatedRoute {
    let route = this.route;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return route;
  }

  private apply(data: SeoData, routeTitle: string | undefined, url: string): void {
    const description = data.description ?? DEFAULT_DESCRIPTION;
    const title = routeTitle ?? this.title.getTitle();
    // Strip the query/fragment so canonicals never fork on ?utm_source=…, and
    // keep the form identical to the sitemap's (bare root, no trailing slash
    // elsewhere) so the two never disagree about the same page.
    const path = url.split('?')[0].split('#')[0];
    const canonical = path === '/' ? `${SITE_URL}/` : SITE_URL + path.replace(/\/$/, '');

    this.meta.updateTag({ name: 'description', content: description });

    if (data.noindex) {
      this.meta.updateTag({ name: 'robots', content: 'noindex, follow' });
    } else {
      this.meta.updateTag({ name: 'robots', content: 'index, follow' });
    }

    this.setCanonical(canonical);

    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: canonical });
    // A guide is an article (and its JSON-LD says so); every other page is a tool or a site page.
    const type = path.startsWith('/guides/') ? 'article' : 'website';
    this.meta.updateTag({ property: 'og:type', content: type });
    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.meta.updateTag({ property: 'og:image', content: SOCIAL_IMAGE });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt', content: `${SITE_NAME} — ${title}` });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:image', content: SOCIAL_IMAGE });
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
  }

  private setCanonical(href: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }
}
