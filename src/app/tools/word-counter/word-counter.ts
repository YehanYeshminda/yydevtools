import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { TryExample } from '../../shared/try-example/try-example';
import { analyse, formatDuration, keywordDensity } from './text-stats';

/** One headline figure in the summary grid. */
interface Stat {
  key: string;
  label: string;
  value: string;
  /** Shown under the value when the number alone is ambiguous. */
  detail?: string;
}

/**
 * "Try an example": a paragraph of ordinary prose, long enough that reading
 * time is a real number rather than "under 1 sec" and repetitive enough that
 * the density table has something to show.
 */
const SAMPLE = `Writing well is mostly rewriting. The first draft exists to get the argument onto the page; the second exists to find out what the argument actually was. Most writers discover, somewhere in that second pass, that the real opening was buried three paragraphs down.

Cutting is the hardest part. A sentence you laboured over is not more valuable for having taken longer to write, and the reader has no idea what it cost you. If a sentence is not doing work — carrying an argument forward, giving the reader a fact they need, or earning goodwill — it is taking up space that a better sentence could use.

So: write badly, quickly, and without flinching. Then read it as a stranger would, and cut everything that stranger would skip.`;

@Component({
  selector: 'app-word-counter',
  imports: [ToolContent, ShareLink, TryExample, RouterLink, MatButtonModule, NgIcon],
  templateUrl: './word-counter.html',
  styleUrls: ['../tool-shell.css', './word-counter.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WordCounterTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly text = signal('');
  /** Common words crowd out the interesting ones, so they are hidden by default. */
  protected readonly ignoreCommon = signal(true);

  protected readonly shared = syncToolState({
    key: 'word-counter',
    snapshot: () => ({ text: this.text(), ignoreCommon: this.ignoreCommon() }),
    restore: (state) => {
      if (typeof state.text === 'string') {
        this.text.set(state.text);
      }
      if (typeof state.ignoreCommon === 'boolean') {
        this.ignoreCommon.set(state.ignoreCommon);
      }
    },
  });

  protected readonly stats = computed(() => analyse(this.text()));

  protected readonly hasText = computed(() => this.text().trim().length > 0);

  /** The headline figures, in the order they are read most often. */
  protected readonly summary = computed<Stat[]>(() => {
    const stats = this.stats();
    return [
      { key: 'words', label: 'Words', value: count(stats.words) },
      {
        key: 'characters',
        label: 'Characters',
        value: count(stats.characters),
        detail: `${count(stats.charactersNoSpaces)} without spaces`,
      },
      { key: 'sentences', label: 'Sentences', value: count(stats.sentences) },
      { key: 'paragraphs', label: 'Paragraphs', value: count(stats.paragraphs) },
      { key: 'lines', label: 'Lines', value: count(stats.lines) },
      {
        key: 'reading',
        label: 'Reading time',
        value: formatDuration(stats.readingSeconds),
        detail: 'silent, 238 wpm',
      },
      {
        key: 'speaking',
        label: 'Speaking time',
        value: formatDuration(stats.speakingSeconds),
        detail: 'aloud, 140 wpm',
      },
      {
        key: 'average',
        label: 'Average word',
        value: stats.averageWordLength ? `${stats.averageWordLength} chars` : '—',
        detail: stats.longestWord ? `longest: ${stats.longestWord}` : undefined,
      },
    ];
  });

  protected readonly keywords = computed(() =>
    keywordDensity(this.text(), { limit: 12, ignoreCommon: this.ignoreCommon() }),
  );

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }

  protected toggleIgnoreCommon(): void {
    this.ignoreCommon.update((value) => !value);
  }

  protected percent(density: number): string {
    return `${(density * 100).toFixed(1)}%`;
  }

  protected clear(): void {
    this.text.set('');
  }

  protected loadExample(): void {
    this.text.set(SAMPLE);
  }

  /** Copy the summary as plain text, which is what people paste into a brief. */
  protected copySummary(): void {
    const lines = this.summary().map((stat) => `${stat.label}: ${stat.value}`);
    void this.clipboard.copy(lines.join('\n'), { label: 'Summary' });
  }
}

function count(value: number): string {
  return value.toLocaleString('en-US');
}
