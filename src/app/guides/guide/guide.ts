import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { map } from 'rxjs';

import { StructuredDataService } from '../../core/structured-data.service';
import type { Tool } from '../../tools/tool.model';
import { TOOLS } from '../../tools/tools.data';
import type { Guide, GuideHeading } from '../guide.model';
import { GUIDE_BY_SLUG, GUIDES } from '../guides.data';
import { activeHeadingId, type TocEntry } from './toc';

/**
 * How far below the viewport top a heading counts as "reached", in pixels. It
 * sits just under the sticky app bar, matching the headings' `scroll-margin-top`
 * so that following a contents link highlights the section it lands on.
 */
const HEADING_OFFSET = 96;

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

  /**
   * The article's headings, for the contents list beside it. Ids are derived by
   * the same {@link anchor} the headings themselves use, so the links cannot
   * drift out of step with what they point at.
   */
  protected readonly headings = computed<TocEntry[]>(() =>
    (this.guide()?.blocks ?? [])
      .filter((block): block is GuideHeading => block.kind === 'h2' || block.kind === 'h3')
      .map((block) => ({ id: this.anchor(block.text), text: block.text, sub: block.kind === 'h3' })),
  );

  /** Below a few sections a contents list is just a second, worse heading. */
  protected readonly showToc = computed(() => this.headings().length >= 3);

  /** The section currently being read, highlighted in the contents list. */
  protected readonly activeId = signal<string | null>(null);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

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

    // Track which section is being read, so the contents list follows along.
    // Re-runs per guide, because this component is reused between articles.
    //
    // The rule is "the last heading scrolled past", not "the heading currently
    // on screen". Testing for a heading inside a band near the top of the
    // viewport is the obvious approach and it does not work: a section is far
    // taller than any such band, so for most of the time spent reading one
    // there is no heading in it at all and nothing would be highlighted.
    effect((onCleanup) => {
      const headings = this.headings();
      this.activeId.set(null);
      if (!this.isBrowser || headings.length === 0) {
        return;
      }

      let queued = false;
      const update = () => {
        queued = false;
        this.activeId.set(
          activeHeadingId(
            headings,
            (id) => document.getElementById(id)?.getBoundingClientRect().top ?? null,
            HEADING_OFFSET,
          ),
        );
      };
      // Coalesce to one measurement per frame; scrolling fires far faster than
      // the page can repaint, and every read here forces layout.
      const onScroll = () => {
        if (!queued) {
          queued = true;
          requestAnimationFrame(update);
        }
      };

      const frame = requestAnimationFrame(update);
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });

      onCleanup(() => {
        cancelAnimationFrame(frame);
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      });
    });
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
