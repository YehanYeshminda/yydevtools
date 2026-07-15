import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';

import { ToolCategory } from '../tools/tool.model';
import { TOOLS, TOOL_CATEGORIES } from '../tools/tools.data';

type CategoryFilter = ToolCategory | 'All';

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  protected readonly categories: readonly CategoryFilter[] = ['All', ...TOOL_CATEGORIES];

  protected readonly query = signal('');
  protected readonly category = signal<CategoryFilter>('All');

  protected readonly tools = computed(() => {
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

  protected readonly hasResults = computed(() => this.tools().length > 0);

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected selectCategory(category: CategoryFilter | undefined): void {
    // The chip listbox emits `undefined` when the active chip is toggled off;
    // fall back to showing every tool in that case.
    this.category.set(category ?? 'All');
  }
}
