import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { LowerCasePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';

import { FavoritesService } from '../core/favorites.service';
import { GUIDES } from '../guides/guides.data';
import { AdSlot } from '../shared/ad-slot/ad-slot';
import { CATEGORY_META, Tool, ToolCategory } from '../tools/tool.model';
import { LOCAL_TOOL_COUNT, TOOLS, TOOL_CATEGORIES } from '../tools/tools.data';

type CategoryFilter = ToolCategory | 'All';

/**
 * A tool plus the classes its card wears. Cards carry their own category
 * accent rather than inheriting it from the section, so a starred tool keeps
 * its own colour wherever it is listed.
 */
interface CardTool {
  tool: Tool;
  cssClass: string;
}

/** A section heading plus the tools under it, ready to render. */
interface ToolGroup {
  title: string;
  /** Modifier suffix for the section's accent colour. */
  accent: string;
  icon: string;
  /** The category's landing page, linked from the section head. */
  heading: string;
  path: string;
  /** How many tools the category holds in total, for the "X of Y" count. */
  total: number;
  tools: CardTool[];
}

/** One row in the left rail's category browser. */
interface RailItem {
  key: CategoryFilter;
  label: string;
  accent: string;
  total: number;
}

/** Section headings run in the plural; the filter keys stay singular. */
const CATEGORY_TITLES: Record<ToolCategory, string> = {
  Developer: 'Developer',
  Converter: 'Converters',
  Document: 'Documents',
};

@Component({
  selector: 'app-home',
  imports: [RouterLink, NgIcon, AdSlot, LowerCasePipe],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly favoritesService = inject(FavoritesService);
  private readonly favoriteSlugs = this.favoritesService.favorites;

  protected readonly categories: readonly CategoryFilter[] = ['All', ...TOOL_CATEGORIES];
  protected readonly totalCount = TOOLS.length;
  /** Both halves of the rail's privacy claim, so it cannot go stale again. */
  protected readonly localCount = LOCAL_TOOL_COUNT;

  /** Per-category totals — static, since the catalog never changes at runtime. */
  private readonly categoryTotals: Record<ToolCategory, number> = TOOL_CATEGORIES.reduce(
    (totals, category) => {
      totals[category] = TOOLS.filter((tool) => tool.category === category).length;
      return totals;
    },
    {} as Record<ToolCategory, number>,
  );

  /** The left rail's category browser: All, then one row per category. */
  protected readonly railItems: readonly RailItem[] = [
    { key: 'All', label: 'All tools', accent: 'all', total: TOOLS.length },
    ...TOOL_CATEGORIES.map((category) => ({
      key: category,
      label: CATEGORY_TITLES[category],
      accent: CATEGORY_META[category].accent,
      total: this.categoryTotals[category],
    })),
  ];

  /** The heading over the grid: "All tools" or the chosen category, pluralised. */
  protected readonly workbenchTitle = computed(() => {
    const cat = this.category();
    return cat === 'All' ? 'All tools' : CATEGORY_TITLES[cat];
  });

  /**
   * The guides surfaced at the foot of the page, freshest first; the rest live
   * at /guides.
   *
   * This was `GUIDES.slice(0, 3)` — the first three in array order, fixed for
   * as long as the page has existed. Over the last 30 days those three were
   * three of the only four guides anyone opened at all: the other 21 had no
   * inbound link except the guides index, and were never read once. Ordering by
   * `updated` gives each one a turn as it is revised, and sorts on static data
   * so the prerendered HTML and the hydrated page cannot disagree.
   */
  protected readonly featuredGuides = [...GUIDES]
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 6);
  protected readonly guideCount = GUIDES.length;

  protected readonly query = signal('');
  protected readonly category = signal<CategoryFilter>('All');

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // `?category=` makes a filtered view linkable, which is what lets the
    // header's Browse menu point at one.
    //
    // Read after the first render, never during it: this page is prerendered
    // with every category showing, so applying the filter while hydrating would
    // produce a DOM that disagrees with the served HTML. Same reason the
    // favourites row starts empty.
    afterNextRender(() => {
      this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
        const requested = params.get('category');
        const match = this.categories.find(
          (category) => category.toLowerCase() === requested?.toLowerCase(),
        );
        this.category.set(match ?? 'All');
      });
    });
  }

  private readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    const cat = this.category();
    return TOOLS.filter((tool) => {
      const matchesCategory = cat === 'All' || tool.category === cat;
      const matchesQuery =
        q === '' ||
        tool.name.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  });

  /**
   * Starred tools, in the order they were starred — the rail's shortcut list.
   * Unfiltered on purpose: it is a persistent jump list, not a slice of the
   * grid, so it stays put while you filter. Empty on the prerendered page (the
   * service reads storage only after first render), which is why it never
   * causes a hydration mismatch.
   */
  protected readonly favoriteTools = computed<Tool[]>(() =>
    this.favoriteSlugs()
      .map((slug) => TOOLS.find((tool) => tool.slug === slug))
      .filter((tool): tool is Tool => tool !== undefined),
  );

  /**
   * The matches, split by category into catalogue sections. Starred tools stay
   * in their category cell rather than being lifted out — the rail already
   * carries them as shortcuts, and the grid reads as a table of contents.
   */
  protected readonly sections = computed<ToolGroup[]>(() => {
    const matches = this.matches();
    return TOOL_CATEGORIES.map((category) => ({
      title: CATEGORY_TITLES[category],
      ...CATEGORY_META[category],
      total: this.categoryTotals[category],
      // Surface the ready-to-use tools first; sort is stable, so tools keep
      // their catalog order within the "available" and "coming soon" groups.
      tools: matches
        .filter((tool) => tool.category === category)
        .sort((a, b) => Number(b.ready) - Number(a.ready))
        .map((tool) => this.toCard(tool)),
    })).filter((group) => group.tools.length > 0);
  });

  protected readonly shownCount = computed(() => this.matches().length);
  protected readonly hasResults = computed(() => this.shownCount() > 0);

  protected isFavorite(slug: string): boolean {
    return this.favoriteSlugs().includes(slug);
  }

  protected toggleFavorite(slug: string): void {
    this.favoritesService.toggle(slug);
  }

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  /**
   * Push the choice through the URL rather than setting the signal directly, so
   * the address bar, the Browse menu and the chips can never disagree — the
   * subscription above is the single place the signal is written.
   *
   * `replaceUrl` because flipping through four filters should not cost four
   * presses of the back button to escape.
   */
  protected selectCategory(category: CategoryFilter): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { category: category === 'All' ? null : category },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected clearSearch(): void {
    this.query.set('');
    this.selectCategory('All');
    this.focusSearch();
  }

  private toCard(tool: Tool): CardTool {
    const classes = [`cat--${CATEGORY_META[tool.category].accent}`];
    if (!tool.ready) {
      classes.push('card--soon');
    }
    return { tool, cssClass: classes.join(' ') };
  }

  private focusSearch(): void {
    const input = this.searchInput()?.nativeElement;
    input?.focus();
    input?.select();
  }
}
