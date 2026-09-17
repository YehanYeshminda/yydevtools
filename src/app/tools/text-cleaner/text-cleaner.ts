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
import { TryExample } from '../../shared/try-example/try-example';
import { clean, stats, type CleanOptions, type SortOrder } from './clean';

/** One toggle, its label, and the sentence explaining what it does. */
interface Toggle {
  key: keyof Omit<CleanOptions, 'sort'>;
  label: string;
  hint: string;
}

const TOGGLES: readonly Toggle[] = [
  {
    key: 'stripInvisible',
    label: 'Remove invisible characters',
    hint: 'Zero-width spaces, soft hyphens, bidirectional overrides and stray byte-order marks.',
  },
  {
    key: 'straightenQuotes',
    label: 'Straighten quotes',
    hint: 'Curly quotes and apostrophes become straight ones, and an ellipsis becomes three dots.',
  },
  {
    key: 'normaliseSpaces',
    label: 'Normalise spaces',
    hint: 'Non-breaking and other exotic spaces become ordinary ones, and runs collapse to one.',
  },
  { key: 'trim', label: 'Trim each line', hint: 'Removes leading and trailing whitespace.' },
  { key: 'dropBlank', label: 'Remove blank lines', hint: 'Drops empty and whitespace-only lines.' },
  {
    key: 'dedupe',
    label: 'Remove duplicate lines',
    hint: 'Keeps the first occurrence of each line, in place.',
  },
  { key: 'reverse', label: 'Reverse order', hint: 'Last line first. Applied after sorting.' },
];

const SORTS: readonly { value: SortOrder; label: string }[] = [
  { value: 'none', label: 'Off' },
  { value: 'asc', label: 'A → Z' },
  { value: 'desc', label: 'Z → A' },
];

/**
 * "Try an example": a list pasted out of a spreadsheet, carrying everything a
 * copy and paste picks up — a zero-width space, curly quotes, a non-breaking
 * space, ragged indentation, a blank line and a duplicate.
 */
const SAMPLE = [
  '  Ada Lovelace\u00a0\u00a0',
  '\u200bGrace Hopper',
  '',
  '  \u201cKatherine\u201d Johnson  ',
  'Grace Hopper',
  '   ',
  'Margaret Hamilton\u2026',
].join('\n');

@Component({
  selector: 'app-text-cleaner',
  imports: [
    ToolPage,
    ToolContent,
    CodeEditor,
    SendTo,
    ShareLink,
    TryExample,
    MatButtonModule,
    NgIcon,
  ],
  templateUrl: './text-cleaner.html',
  styleUrls: ['../tool-shell.css', './text-cleaner.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextCleanerTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly toggles = TOGGLES;
  protected readonly sorts = SORTS;

  protected readonly input = signal('');
  protected readonly options = signal<CleanOptions>({
    // The three that are almost always wanted and never destructive start on;
    // anything that reorders or removes lines is opt-in.
    stripInvisible: true,
    straightenQuotes: false,
    normaliseSpaces: false,
    trim: true,
    dropBlank: true,
    dedupe: false,
    sort: 'none',
    reverse: false,
  });

  protected readonly shared = syncToolState({
    key: 'text-cleaner',
    snapshot: () => ({ input: this.input(), ...this.options() }),
    restore: (state) => {
      if (typeof state.input === 'string') {
        this.input.set(state.input);
      }
      this.options.update((current) => {
        const next = { ...current };
        for (const { key } of TOGGLES) {
          if (typeof state[key] === 'boolean') {
            next[key] = state[key];
          }
        }
        if (state.sort === 'none' || state.sort === 'asc' || state.sort === 'desc') {
          next.sort = state.sort;
        }
        return next;
      });
    },
  });

  protected readonly output = computed(() => clean(this.input(), this.options()));
  protected readonly counts = computed(() => stats(this.input(), this.output()));
  protected readonly hasInput = computed(() => this.input() !== '');
  protected readonly linesRemoved = computed(
    () => this.counts().linesBefore - this.counts().linesAfter,
  );

  protected isOn(key: Toggle['key']): boolean {
    return this.options()[key];
  }

  protected toggle(key: Toggle['key']): void {
    this.options.update((current) => ({ ...current, [key]: !current[key] }));
  }

  protected setSort(sort: SortOrder): void {
    this.options.update((current) => ({ ...current, sort }));
  }

  protected clear(): void {
    this.input.set('');
  }

  protected loadExample(): void {
    this.input.set(SAMPLE);
  }

  protected copy(): void {
    void this.clipboard.copy(this.output(), { label: 'Cleaned text' });
  }

  protected download(): void {
    downloadText(this.output(), 'cleaned.txt');
  }
}
