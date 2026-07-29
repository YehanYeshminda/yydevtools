import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { StructuredDataService } from '../../core/structured-data.service';
import type { Tool } from '../../tools/tool.model';
import { TOOL_CONTENT } from '../../tools/tool-content.data';
import { TOOLS } from '../../tools/tools.data';

/**
 * The long-form content block shown below every tool's widget: what the tool is,
 * how to use it, an FAQ and links to related tools. Reads its copy from
 * {@link TOOL_CONTENT} by slug and, on the same data, emits the page's
 * SoftwareApplication / FAQPage / BreadcrumbList JSON-LD via
 * {@link StructuredDataService}.
 *
 * Rendered inside each tool's own component, so it inherits the tool-shell
 * column width. Because the build prerenders every route, all of this copy is in
 * the static HTML a crawler receives.
 */
@Component({
  selector: 'app-tool-content',
  imports: [RouterLink],
  templateUrl: './tool-content.html',
  styleUrl: './tool-content.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolContent implements OnInit, OnDestroy {
  private readonly structuredData = inject(StructuredDataService);

  /** The route slug of the tool this block describes. */
  readonly slug = input.required<string>();

  protected readonly tool = computed(() => TOOLS.find((t) => t.slug === this.slug()));
  protected readonly content = computed(() => TOOL_CONTENT[this.slug()]);

  protected readonly relatedTools = computed<Tool[]>(() => {
    const related = this.content()?.related ?? [];
    return related
      .map((slug) => TOOLS.find((t) => t.slug === slug))
      .filter((t): t is Tool => t !== undefined && t.ready);
  });

  ngOnInit(): void {
    const tool = this.tool();
    if (tool) {
      this.structuredData.setToolPage(tool, this.content());
    }
  }

  ngOnDestroy(): void {
    this.structuredData.clear();
  }
}
