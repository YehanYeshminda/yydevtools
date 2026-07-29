import { DOCUMENT, Injectable, inject } from '@angular/core';

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
