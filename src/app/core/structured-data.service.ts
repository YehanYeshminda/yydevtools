import { DOCUMENT, Injectable, inject } from '@angular/core';

import type { Guide } from '../guides/guide.model';
import type { Tool } from '../tools/tool.model';
import type { ToolContent } from '../tools/tool-content.model';
import { SITE_URL } from './seo.service';

/**
 * Injects per-page JSON-LD structured data into the document head.
 *
 * The build prerenders every route, so whatever this writes during the prerender
 * pass is baked into the static HTML a crawler receives — it does not depend on
 * the client running JavaScript. On the client the same component re-runs and
 * calls {@link set} again; because every managed node carries the `MARKER`
 * attribute, {@link set} clears the previous batch first, so navigating between
 * tools never leaves a stale schema behind.
 *
 * Managed nodes live in `<head>`, outside any Angular component's DOM, so
 * hydration never inspects them and there is no mismatch to reconcile.
 */
@Injectable({ providedIn: 'root' })
export class StructuredDataService {
  private readonly document = inject(DOCUMENT);

  /** Marks the script tags this service owns, so it can replace exactly its own. */
  private static readonly MARKER = 'data-page-jsonld';

  /** Replace the page's structured data with a fresh graph for one tool page. */
  setToolPage(tool: Tool, content: ToolContent | undefined): void {
    const url = `${SITE_URL}/tools/${tool.slug}`;

    const graph: Record<string, unknown>[] = [
      {
        '@type': 'SoftwareApplication',
        name: `${tool.name} — YYDevTools`,
        url,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Any (runs in a web browser)',
        description: tool.description,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        isAccessibleForFree: true,
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'All tools', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: tool.name, item: url },
        ],
      },
    ];

    if (content && content.faq.length > 0) {
      graph.push({
        '@type': 'FAQPage',
        mainEntity: content.faq.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      });
    }

    this.set(graph);
  }

  /** Replace the page's structured data with an Article graph for one guide. */
  setGuidePage(guide: Guide): void {
    const url = `${SITE_URL}/guides/${guide.slug}`;

    this.set([
      {
        '@type': 'Article',
        headline: guide.title,
        description: guide.description,
        articleSection: guide.category,
        url,
        mainEntityOfPage: url,
        datePublished: guide.published,
        dateModified: guide.updated,
        inLanguage: 'en',
        isAccessibleForFree: true,
        author: { '@id': `${SITE_URL}/#organization` },
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Guides', item: `${SITE_URL}/guides` },
          { '@type': 'ListItem', position: 2, name: guide.title, item: url },
        ],
      },
    ]);
  }

  /** Replace the page's structured data with an AboutPage graph (plus any FAQ). */
  setAboutPage(faq: readonly { q: string; a: string }[]): void {
    const url = `${SITE_URL}/about`;

    const graph: Record<string, unknown>[] = [
      {
        '@type': 'AboutPage',
        name: 'About YYDevTools',
        url,
        description:
          'What YYDevTools is, why it exists and how it works: a free collection of ' +
          'developer and PDF tools that run in your browser, with no account or install.',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        about: { '@id': `${SITE_URL}/#organization` },
        inLanguage: 'en',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'All tools', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'About', item: url },
        ],
      },
    ];

    if (faq.length > 0) {
      graph.push({
        '@type': 'FAQPage',
        mainEntity: faq.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      });
    }

    this.set(graph);
  }

  /** Replace the page's structured data with a listing graph for the guides index. */
  setGuidesIndex(guides: readonly Guide[]): void {
    this.set([
      {
        '@type': 'CollectionPage',
        name: 'Guides — YYDevTools',
        url: `${SITE_URL}/guides`,
        description:
          'In-depth, plain-English guides on the concepts behind the tools — JWTs, ' +
          'Base64, hashing, cron, UUIDs and image compression.',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: guides.map((guide, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: guide.title,
            url: `${SITE_URL}/guides/${guide.slug}`,
          })),
        },
      },
    ]);
  }

  /** Remove every script tag this service owns. Called when leaving a tool page. */
  clear(): void {
    for (const node of this.owned()) {
      node.remove();
    }
  }

  private set(graph: Record<string, unknown>[]): void {
    this.clear();
    const script = this.document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute(StructuredDataService.MARKER, '');
    script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
    this.document.head.appendChild(script);
  }

  private owned(): HTMLScriptElement[] {
    return Array.from(
      this.document.head.querySelectorAll<HTMLScriptElement>(
        `script[${StructuredDataService.MARKER}]`,
      ),
    );
  }
}
