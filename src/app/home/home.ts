import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ToolCategory } from '../tools/tool.model';
import { TOOLS, TOOL_CATEGORIES } from '../tools/tools.data';

type CategoryFilter = ToolCategory | 'All';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  protected readonly categories: readonly CategoryFilter[] = ['All', ...TOOL_CATEGORIES];
  protected readonly totalCount = TOOLS.length;

  protected readonly query = signal('');
  protected readonly category = signal<CategoryFilter>('All');

  protected readonly tools = computed(() => {
    const q = this.query().trim().toLowerCase();
    const cat = this.category();
    const matches = TOOLS.filter((tool) => {
      const matchesCategory = cat === 'All' || tool.category === cat;
      const matchesQuery =
        q === '' ||
        tool.name.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
    // Surface the ready-to-use tools first; sort is stable, so tools keep their
    // catalog order within the "available" and "coming soon" groups.
    return matches.sort((a, b) => Number(b.ready) - Number(a.ready));
  });

  protected readonly shownCount = computed(() => this.tools().length);
  protected readonly hasResults = computed(() => this.shownCount() > 0);

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected selectCategory(category: CategoryFilter): void {
    this.category.set(category);
  }
}
