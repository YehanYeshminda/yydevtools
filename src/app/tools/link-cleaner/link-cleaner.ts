import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { encodeState, syncToolState } from '../../core/tool-state';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { TryExample } from '../../shared/try-example/try-example';
import { buildLink } from '../hyperlink-generator/hyperlink';
import { cleanText, richHtml, type CleanedLink } from './link-clean';

/**
 * "Try an example": the kind of message that actually arrives. A newsletter
 * link full of campaign tags, a YouTube share with its si, and a Google
 * result link copied out of Gmail, wrapped around the real page.
 */
const SAMPLE = [
  'The recipe is here: https://cooking.example.com/recipes/lemon-tart?utm_source=newsletter&utm_medium=email&utm_campaign=autumn&mc_eid=8f2a91c4',
  'and the video I mentioned https://youtu.be/dQw4w9WgXcQ?si=Xy7_kQ2pL0aB&t=42',
  'https://www.google.com/url?sa=t&url=https%3A%2F%2Fshop.example.com%2Ftart-tin%3Fid%3D118%26gclid%3DCj0KCQjw&ved=2ahUKEwi',
].join('\n');

/** One cleaned link, with what the template needs precomputed. */
interface LinkView extends CleanedLink {
  /** Opens the Hyperlink Generator with this link already in it. */
  fragment: string | null;
}

@Component({
  selector: 'app-link-cleaner',
  imports: [ToolPage, ToolContent, TryExample, MatButtonModule, NgIcon, RouterLink],
  templateUrl: './link-cleaner.html',
  styleUrls: ['../tool-shell.css', './link-cleaner.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkCleanerTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly input = signal('');

  /**
   * Kept across a reload but not offered as a share link: the thing worth
   * sending is the cleaned link itself, not a link to this page holding it.
   */
  protected readonly state = syncToolState({
    key: 'link-cleaner',
    shareable: false,
    snapshot: () => ({ input: this.input() }),
    restore: (state) => {
      if (typeof state.input === 'string') this.input.set(state.input);
    },
  });

  protected readonly result = computed(() => cleanText(this.input()));
  protected readonly links = computed<LinkView[]>(() =>
    this.result().links.map((link) => {
      const encoded = encodeState({ url: link.cleaned });
      return { ...link, fragment: encoded === null ? null : `s=${encoded}` };
    }),
  );
  protected readonly removedCount = computed(() =>
    this.links().reduce((sum, link) => sum + link.removed.length, 0),
  );
  protected readonly unwrappedCount = computed(
    () => this.links().filter((link) => link.unwrapped.length > 0).length,
  );

  /** One sentence for the live region, so a screen reader hears the outcome. */
  protected readonly summary = computed(() => {
    const links = this.links().length;
    if (!this.input().trim()) return '';
    if (links === 0) return 'No web links found. Paste a link that starts with http:// or https://.';
    const removed = this.removedCount();
    const unwrapped = this.unwrappedCount();
    const linkWord = links === 1 ? 'link' : 'links';
    const parts = [
      removed === 0
        ? `Nothing to remove: ${links === 1 ? 'that link is' : `all ${links} links are`} already clean`
        : `Removed ${removed} tracking ${removed === 1 ? 'parameter' : 'parameters'} from ${links} ${linkWord}`,
    ];
    if (unwrapped) parts.push(`unwrapped ${unwrapped} redirect ${unwrapped === 1 ? 'link' : 'links'}`);
    return `${parts.join(', and ')}.`;
  });

  /** Just one link and nothing around it, so the result is a link rather than text. */
  protected readonly single = computed(() => {
    const links = this.links();
    return links.length <= 1 && this.result().text.trim() === (links[0]?.cleaned ?? '');
  });

  protected readonly changed = computed(() => this.removedCount() + this.unwrappedCount() > 0);

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected copyAll(): void {
    void this.clipboard.copy(this.result().text, {
      label: this.single() ? 'Clean link' : 'Cleaned text',
    });
  }

  protected copyAllRich(): void {
    const text = this.result().text;
    void this.clipboard.copyRich(richHtml(text), text, { label: 'Clickable links' });
  }

  protected copyOne(link: LinkView): void {
    void this.clipboard.copy(link.cleaned, { label: 'Clean link' });
  }

  protected copyOneRich(link: LinkView): void {
    const built = buildLink(link.cleaned, '');
    if (built.ok) void this.clipboard.copyRich(built.html, built.href, { label: 'Clickable link' });
  }

  protected clear(): void {
    this.input.set('');
  }

  protected loadExample(): void {
    this.input.set(SAMPLE);
  }
}
