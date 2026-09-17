import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { SendTo } from '../../shared/send-to/send-to';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { DEFAULT_OPTIONS, slugLines, type Separator } from './slug';

/** Limits people actually use: none, a tidy URL, and the old SEO rules of thumb. */
const LENGTHS = [0, 40, 60, 80];

const SAMPLE = [
  'The Complete Guide to Café Culture',
  '10 Things I Wish I Knew About CSS Grid',
  'The Complete Guide to Cafe Culture',
].join('\n');

@Component({
  selector: 'app-slug-generator',
  imports: [ToolPage, ToolContent, SendTo, ShareLink, MatButtonModule, NgIcon, RouterLink],
  templateUrl: './slug-generator.html',
  styleUrls: ['../tool-shell.css', './slug-generator.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlugGeneratorTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly lengths = LENGTHS;

  protected readonly input = signal(SAMPLE);
  protected readonly separator = signal<Separator>(DEFAULT_OPTIONS.separator);
  protected readonly maxLength = signal(DEFAULT_OPTIONS.maxLength);
  protected readonly dropStopWords = signal(DEFAULT_OPTIONS.dropStopWords);

  protected readonly shared = syncToolState({
    key: 'slug-generator',
    snapshot: () => ({
      input: this.input(),
      separator: this.separator(),
      maxLength: this.maxLength(),
      dropStopWords: this.dropStopWords(),
    }),
    restore: (state) => {
      if (typeof state.input === 'string') {
        this.input.set(state.input);
      }
      if (state.separator === '-' || state.separator === '_') {
        this.separator.set(state.separator);
      }
      if (typeof state.maxLength === 'number' && LENGTHS.includes(state.maxLength)) {
        this.maxLength.set(state.maxLength);
      }
      if (typeof state.dropStopWords === 'boolean') {
        this.dropStopWords.set(state.dropStopWords);
      }
    },
  });

  protected readonly rows = computed(() =>
    slugLines(this.input(), {
      separator: this.separator(),
      maxLength: this.maxLength(),
      dropStopWords: this.dropStopWords(),
    }),
  );

  protected readonly dedupedCount = computed(() => this.rows().filter((row) => row.deduped).length);

  protected readonly summary = computed(() => {
    const rows = this.rows();
    if (rows.length === 0) {
      return '';
    }
    const slugs = `${rows.length} ${rows.length === 1 ? 'slug' : 'slugs'}`;
    const deduped = this.dedupedCount();
    return deduped === 0 ? slugs : `${slugs} · ${deduped} numbered to avoid a collision`;
  });

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setSeparator(separator: Separator): void {
    this.separator.set(separator);
  }

  protected setMaxLength(length: number): void {
    this.maxLength.set(length);
  }

  protected toggleStopWords(): void {
    this.dropStopWords.update((on) => !on);
  }

  protected clear(): void {
    this.input.set('');
  }

  protected copy(slug: string): void {
    void this.clipboard.copy(slug, { label: 'Slug' });
  }

  protected copyAll(): void {
    void this.clipboard.copy(
      this.rows()
        .map((row) => row.slug)
        .join('\n'),
      { label: 'All slugs' },
    );
  }
}
