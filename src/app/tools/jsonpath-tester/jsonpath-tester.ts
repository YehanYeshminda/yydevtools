import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { SendTo } from '../../shared/send-to/send-to';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { TryExample } from '../../shared/try-example/try-example';
import { describeProblem } from '../json-formatter/json-problem';
import { runQuery } from './jsonpath-query';

/** Past this many matches only the count grows; `$..*` on a big file would bury the page. */
const MAX_SHOWN = 500;
/** Each match's value is cut to this for display; Copy values still gives it whole. */
const MAX_VALUE_CHARS = 1000;

const SAMPLE_JSON = `{
  "store": {
    "book": [
      { "category": "reference", "author": "Nigel Rees", "title": "Sayings of the Century", "price": 8.95 },
      { "category": "fiction", "author": "Evelyn Waugh", "title": "Sword of Honour", "price": 12.99 },
      { "category": "fiction", "author": "Herman Melville", "title": "Moby Dick", "isbn": "0-553-21311-3", "price": 8.99 },
      { "category": "fiction", "author": "J. R. R. Tolkien", "title": "The Lord of the Rings", "isbn": "0-395-19395-8", "price": 22.99 }
    ],
    "bicycle": { "color": "red", "price": 19.95 }
  }
}`;

/** The syntax, each line runnable against the sample with one click. */
const CHEAT_SHEET: { path: string; meaning: string }[] = [
  { path: '$.store.book[*].author', meaning: 'The author of every book' },
  { path: '$..author', meaning: 'Every author, at any depth' },
  { path: '$.store.*', meaning: 'Everything directly inside store' },
  { path: '$.store..price', meaning: 'Every price inside store' },
  { path: '$..book[2]', meaning: 'The third book (indexes start at 0)' },
  { path: '$..book[-1:]', meaning: 'The last book' },
  { path: '$..book[0,1]', meaning: 'The first two books, by index' },
  { path: '$..book[:2]', meaning: 'The first two books, as a slice' },
  { path: '$..book[?(@.isbn)]', meaning: 'Books that have an isbn' },
  { path: '$..book[?(@.price < 10)]', meaning: 'Books cheaper than 10' },
  { path: "$..book[?(@.category == 'fiction')].title", meaning: 'Titles of fiction books' },
  { path: '$..*', meaning: 'Every value in the document' },
];

@Component({
  selector: 'app-jsonpath-tester',
  imports: [ToolPage, ToolContent, CodeEditor, SendTo, ShareLink, TryExample, MatButtonModule, NgIcon],
  templateUrl: './jsonpath-tester.html',
  styleUrls: ['../tool-shell.css', './jsonpath-tester.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonPathTesterTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly cheatSheet = CHEAT_SHEET;
  protected readonly maxShown = MAX_SHOWN;

  protected readonly json = signal('');
  protected readonly path = signal('');

  protected readonly shared = syncToolState({
    key: 'jsonpath-tester',
    snapshot: () => ({ json: this.json(), path: this.path() }),
    restore: (state) => {
      if (typeof state.json === 'string') {
        this.json.set(state.json);
      }
      if (typeof state.path === 'string') {
        this.path.set(state.path);
      }
    },
  });

  /** Parsed once per edit of the document, not per keystroke in the expression. */
  private readonly document = computed<{ value?: unknown; error?: string }>(() => {
    const text = this.json();
    if (text.trim() === '') {
      return {};
    }
    try {
      return { value: JSON.parse(text) };
    } catch {
      const problem = describeProblem(text);
      const where = problem?.line ? ` (line ${problem.line}, column ${problem.column})` : '';
      return { error: `${problem?.message ?? 'That is not valid JSON.'}${where}` };
    }
  });

  protected readonly jsonError = computed(() => this.document().error ?? '');

  private readonly result = computed(() => {
    const document = this.document();
    return 'value' in document ? runQuery(document.value, this.path()) : null;
  });

  protected readonly pathError = computed(() => this.result()?.error ?? '');
  protected readonly matches = computed(() => this.result()?.matches ?? []);
  protected readonly ran = computed(() => this.result() !== null && this.path().trim() !== '');

  protected readonly shown = computed(() =>
    this.matches()
      .slice(0, MAX_SHOWN)
      .map((match) => ({ path: match.path, text: preview(match.value) })),
  );

  /** All matched values as one JSON array — what Copy values and Send to hand over. */
  protected readonly valuesJson = computed(() =>
    this.matches().length
      ? JSON.stringify(
          this.matches().map((match) => match.value),
          null,
          2,
        )
      : '',
  );

  protected onPathInput(event: Event): void {
    this.path.set((event.target as HTMLInputElement).value);
  }

  protected usePath(path: string): void {
    if (!this.json().trim()) {
      this.json.set(SAMPLE_JSON);
    }
    this.path.set(path);
  }

  protected copyValues(): void {
    void this.clipboard.copy(this.valuesJson(), { label: 'Values' });
  }

  protected copyPaths(): void {
    void this.clipboard.copy(this.matches().map((match) => match.path).join('\n'), {
      label: 'Paths',
    });
  }

  protected loadExample(): void {
    this.json.set(SAMPLE_JSON);
    this.path.set('$..book[?(@.price < 10)].title');
  }
}

function preview(value: unknown): string {
  const text = JSON.stringify(value, null, 2) ?? String(value);
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text;
}
