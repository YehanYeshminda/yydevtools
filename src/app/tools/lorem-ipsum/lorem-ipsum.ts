import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { downloadText } from '../../core/download';
import { syncToolState } from '../../core/tool-state';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { SendTo } from '../../shared/send-to/send-to';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import {
  FORMATS,
  MAX_COUNT,
  UNITS,
  clampCount,
  generate,
  measure,
  render,
  type Format,
  type Unit,
} from './lorem';

/** File extension per format, for the download. */
const EXTENSIONS: Record<Format, string> = { text: 'txt', html: 'html', markdown: 'md' };

@Component({
  selector: 'app-lorem-ipsum',
  imports: [ToolPage, ToolContent, CodeEditor, SendTo, ShareLink, MatButtonModule, NgIcon],
  templateUrl: './lorem-ipsum.html',
  styleUrls: ['../tool-shell.css', './lorem-ipsum.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoremIpsumTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly units = UNITS;
  protected readonly formats = FORMATS;

  protected readonly unit = signal<Unit>('paragraphs');
  protected readonly count = signal(3);
  protected readonly format = signal<Format>('text');
  protected readonly classic = signal(true);

  /**
   * Bumped by Shuffle, and by nothing else.
   *
   * Generation is seeded on this, so every other control changes the passage
   * only in the way it describes — raising the count adds paragraphs to the
   * ones already on screen rather than replacing all of them.
   */
  protected readonly seed = signal(1);

  protected readonly maxCount = computed(() => MAX_COUNT[this.unit()]);

  protected readonly shared = syncToolState({
    key: 'lorem-ipsum',
    snapshot: () => ({
      unit: this.unit(),
      count: this.count(),
      format: this.format(),
      classic: this.classic(),
      seed: this.seed(),
    }),
    restore: (state) => {
      if (UNITS.some((option) => option.value === state.unit)) {
        this.unit.set(state.unit as Unit);
      }
      if (FORMATS.some((option) => option.value === state.format)) {
        this.format.set(state.format as Format);
      }
      if (typeof state.count === 'number') {
        this.count.set(clampCount(this.unit(), state.count));
      }
      if (typeof state.classic === 'boolean') {
        this.classic.set(state.classic);
      }
      if (typeof state.seed === 'number' && Number.isFinite(state.seed)) {
        this.seed.set(state.seed);
      }
    },
  });

  protected readonly output = computed(() => {
    const unit = this.unit();
    const blocks = generate({
      unit,
      count: this.count(),
      format: this.format(),
      classic: this.classic(),
      seed: this.seed(),
    });
    return render(blocks, unit, this.format());
  });

  protected readonly counts = computed(() => measure(this.output()));

  protected readonly formatHint = computed(
    () => FORMATS.find((option) => option.value === this.format())?.hint ?? '',
  );

  protected setUnit(value: Unit): void {
    this.unit.set(value);
    // The maximum differs per unit, so a count that was fine for words has to
    // come back into range when the unit becomes paragraphs.
    this.count.set(clampCount(value, this.count()));
  }

  protected setFormat(value: Format): void {
    this.format.set(value);
  }

  protected setCount(value: string): void {
    this.count.set(clampCount(this.unit(), Number(value)));
  }

  protected toggleClassic(): void {
    this.classic.update((on) => !on);
  }

  protected shuffle(): void {
    // A fresh seed, not an increment: consecutive mulberry32 seeds give related
    // streams, so +1 would sometimes produce a passage that looks half-familiar.
    this.seed.set(Math.floor(Math.random() * 0xffffffff));
  }

  protected copy(): void {
    void this.clipboard.copy(this.output(), { label: 'Lorem ipsum' });
  }

  protected download(): void {
    downloadText(this.output(), `lorem-ipsum.${EXTENSIONS[this.format()]}`);
  }
}
