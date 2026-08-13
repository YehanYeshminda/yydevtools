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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';

import { FavoritesService } from '../core/favorites.service';
import { GUIDES } from '../guides/guides.data';
import { AdSlot } from '../shared/ad-slot/ad-slot';
import { CATEGORY_META, Tool, ToolCategory } from '../tools/tool.model';
import { TOOLS, TOOL_CATEGORIES } from '../tools/tools.data';

type CategoryFilter = ToolCategory | 'All';

/**
 * A tool plus the classes its card wears. Cards carry their own category
 * accent rather than inheriting it from the section, because the favourites
 * row mixes categories.
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
  tools: CardTool[];
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, NgIcon, AdSlot],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly favoritesService = inject(FavoritesService);
  private readonly favoriteSlugs = this.favoritesService.favorites;

  protected readonly categories: readonly CategoryFilter[] = ['All', ...TOOL_CATEGORIES];
  protected readonly totalCount = TOOLS.length;

  /** A few guides to surface at the foot of the page; the rest live at /guides. */
  protected readonly featuredGuides = GUIDES.slice(0, 3);
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
      this.route.queryParamMap
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((params) => {
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
   * Starred tools, in the order they were starred, and still subject to the
   * search and category filters so the row never contradicts the count.
   */
  private readonly favoriteGroup = computed<ToolGroup | null>(() => {
    const matches = this.matches();
    const tools = this.favoriteSlugs()
      .map((slug) => matches.find((tool) => tool.slug === slug))
      .filter((tool): tool is Tool => tool !== undefined)
      .map((tool) => this.toCard(tool));

    return tools.length > 0 ? { title: 'Favorites', accent: 'fav', icon: 'matStarOutline', tools } : null;
  });

  /**
   * The remaining matches, split by category. Starred tools are lifted out into
   * the favourites row above rather than listed twice, so the per-category
   * counts always describe what is actually on screen.
   */
  private readonly categoryGroups = computed<ToolGroup[]>(() => {
    const matches = this.matches().filter((tool) => !this.favoriteSlugs().includes(tool.slug));
    return TOOL_CATEGORIES.map((category) => ({
      title: category,
      ...CATEGORY_META[category],
      // Surface the ready-to-use tools first; sort is stable, so tools keep
      // their catalog order within the "available" and "coming soon" groups.
      tools: matches
        .filter((tool) => tool.category === category)
        .sort((a, b) => Number(b.ready) - Number(a.ready))
        .map((tool) => this.toCard(tool)),
    })).filter((group) => group.tools.length > 0);
  });

  /** Favourites first, then the categories — every section the page renders. */
  protected readonly sections = computed<ToolGroup[]>(() => {
    const favorites = this.favoriteGroup();
    return favorites ? [favorites, ...this.categoryGroups()] : this.categoryGroups();
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
