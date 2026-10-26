import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { TryExample } from '../../shared/try-example/try-example';
import { STYLES, stylize, unstyle, type FancyStyle } from './fancy';

/** Shown in every style until something is typed. */
const PREVIEW = 'Your text here 123';

interface Row extends FancyStyle {
  text: string;
  unmapped: string[];
}

@Component({
  selector: 'app-fancy-text',
  imports: [ToolPage, ToolContent, TryExample, MatButtonModule, NgIcon, RouterLink],
  templateUrl: './fancy-text.html',
  styleUrls: ['../tool-shell.css', './fancy-text.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FancyTextTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly input = signal('');

  protected readonly state = syncToolState({
    key: 'fancy-text',
    shareable: false,
    snapshot: () => ({ input: this.input() }),
    restore: (state) => {
      if (typeof state.input === 'string') this.input.set(state.input);
    },
  });

  protected readonly hasInput = computed(() => this.input().trim() !== '');

  protected readonly rows = computed<Row[]>(() => {
    const text = this.hasInput() ? this.input() : PREVIEW;
    return STYLES.map((style) => ({ ...style, ...stylize(text, style.key) }));
  });

  /** The input with any styling taken off, when there was some to take off. */
  protected readonly plain = computed(() => {
    const input = this.input();
    const plain = unstyle(input);
    return plain !== input ? plain : null;
  });

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected copy(row: Row): void {
    void this.clipboard.copy(row.text, { label: row.name });
  }

  protected copyPlain(): void {
    const plain = this.plain();
    if (plain) void this.clipboard.copy(plain, { label: 'Plain text' });
  }

  protected clear(): void {
    this.input.set('');
  }

  protected loadExample(): void {
    this.input.set('Coffee & code, est. 2019');
  }
}
