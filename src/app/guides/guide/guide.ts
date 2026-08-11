import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { map } from 'rxjs';

import { StructuredDataService } from '../../core/structured-data.service';
import type { Tool } from '../../tools/tool.model';
import { TOOLS } from '../../tools/tools.data';
import type { Guide } from '../guide.model';
import { GUIDE_BY_SLUG, GUIDES } from '../guides.data';

/**
 * Renders one guide article from {@link GUIDE_BY_SLUG}. The slug arrives in the
 * route's `data` bag (each guide is its own explicit route, mirroring the tools),
 * so navigating between guides reuses this component — hence the reactive slug
 * signal rather than a one-shot snapshot read.
 *
 * The block model is a small closed set of shapes and every string is
 * interpolated, so there is no innerHTML and nothing to sanitise. The same data
 * drives the page's Article/BreadcrumbList structured data.
 */
@Component({
  selector: 'app-guide',
  imports: [RouterLink, NgIcon, DatePipe],
  templateUrl: './guide.html',
  styleUrl: './guide.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideArticle implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly structuredData = inject(StructuredDataService);

  private readonly slug = toSignal(this.route.data.pipe(map((data) => data['slug'] as string)), {
    initialValue: this.route.snapshot.data['slug'] as string,
  });

  protected readonly guide = computed<Guide | undefined>(() => GUIDE_BY_SLUG[this.slug()]);

  /** The tools this guide is about, resolved and filtered to ready ones. */
  protected readonly relatedTools = computed<Tool[]>(() =>
    (this.guide()?.related ?? [])
      .map((slug) => TOOLS.find((tool) => tool.slug === slug))
      .filter((tool): tool is Tool => tool !== undefined && tool.ready),
  );

  /** Other guides to read next. */
  protected readonly relatedGuides = computed<Guide[]>(() =>
    (this.guide()?.relatedGuides ?? [])
      .map((slug) => GUIDE_BY_SLUG[slug])
      .filter((guide): guide is Guide => guide !== undefined),
  );

  constructor() {
    // A slug with no matching guide means a stale or mistyped URL — send it to
    // the real 404 rather than rendering a blank article.
    effect(() => {
      const guide = this.guide();
      if (guide) {
        this.structuredData.setGuidePage(guide);
      } else if (this.slug()) {
        void this.router.navigateByUrl('/404');
      }
    });

    // Belt and braces: clear the schema on any navigation away handled by the
    // reused component, so a guide never carries the previous one's graph.
    this.route.data.pipe(takeUntilDestroyed()).subscribe();
  }

  /** The tool behind a "tool" CTA block. */
  protected toolFor(slug: string): Tool | undefined {
    return TOOLS.find((tool) => tool.slug === slug);
  }

  /** A stable in-page anchor id for a heading, from its text. */
  protected anchor(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  protected readonly totalGuides = GUIDES.length;

  ngOnDestroy(): void {
    this.structuredData.clear();
  }
}
