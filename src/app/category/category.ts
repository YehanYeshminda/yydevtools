import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';

import { StructuredDataService } from '../core/structured-data.service';
import { CATEGORY_META, ToolCategory } from '../tools/tool.model';
import { HOSTED_SLUGS, TOOLS, TOOL_CATEGORIES } from '../tools/tools.data';
import { CATEGORY_COPY } from './category.data';

/**
 * A category landing page: /developer-tools, /converter-tools, /document-tools.
 *
 * One component for all three; the route's `data.category` says which. The
 * homepage's `?category=` filter is a view of the homepage and canonicalises to
 * it, so it cannot be a page a search engine ranks. These can: each is its own
 * prerendered URL with its own copy, the full list of its tools, and the
 * CollectionPage structured data to match.
 */
@Component({
  selector: 'app-category',
  imports: [RouterLink, NgIcon],
  templateUrl: './category.html',
  styleUrl: './category.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryPage implements OnInit, OnDestroy {
  private readonly structuredData = inject(StructuredDataService);

  protected readonly category: ToolCategory = inject(ActivatedRoute).snapshot.data['category'];
  protected readonly copy = CATEGORY_COPY[this.category];
  protected readonly heading = CATEGORY_META[this.category].heading;
  protected readonly accent = CATEGORY_META[this.category].accent;
  protected readonly tools = TOOLS.filter((tool) => tool.category === this.category);
  protected readonly localCount = this.tools.filter((tool) => !this.isHosted(tool.slug)).length;

  /** The other two categories, so every landing page leads to the rest. */
  protected readonly others = TOOL_CATEGORIES.filter((other) => other !== this.category).map(
    (other) => CATEGORY_META[other],
  );

  ngOnInit(): void {
    this.structuredData.setCategoryPage(this.category, this.copy.lead, this.tools);
  }

  ngOnDestroy(): void {
    this.structuredData.clear();
  }

  protected isHosted(slug: string): boolean {
    return HOSTED_SLUGS.includes(slug);
  }
}
