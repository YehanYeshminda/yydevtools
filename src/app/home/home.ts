import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { FavoritesService } from '../core/favorites.service';
import { AdSlot } from '../shared/ad-slot/ad-slot';
import { Tool, ToolCategory } from '../tools/tool.model';
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

const CATEGORY_META: Record<ToolCategory, { accent: string; icon: string }> = {
  Developer: { accent: 'dev', icon: 'terminal' },
  Converter: { accent: 'conv', icon: 'sync_alt' },
  Document: { accent: 'doc', icon: 'description' },
};

@Component({
  selector: 'app-home',
  imports: [RouterLink, AdSlot],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
})
export class Home {
  private readonly favoritesService = inject(FavoritesService);
  private readonly favoriteSlugs = this.favoritesService.favorites;

  protected readonly categories: readonly CategoryFilter[] = ['All', ...TOOL_CATEGORIES];
  protected readonly totalCount = TOOLS.length;

  protected readonly query = signal('');
  protected readonly category = signal<CategoryFilter>('All');

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

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

    return tools.length > 0 ? { title: 'Favorites', accent: 'fav', icon: 'star', tools } : null;
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

  protected selectCategory(category: CategoryFilter): void {
    this.category.set(category);
  }

  protected clearSearch(): void {
    this.query.set('');
    this.category.set('All');
    this.focusSearch();
  }

  /** ⌘K / Ctrl-K jumps to the search box, as the shortcut hint advertises. */
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) {
      return;
    }
    event.preventDefault();
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
