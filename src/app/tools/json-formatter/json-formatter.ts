import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { ShareLink } from '../../shared/share-link/share-link';
import { JSONPath } from 'jsonpath-plus';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { CodeEditor, type EditorLanguage } from '../../shared/code-editor/code-editor';
import { ToolContent } from '../../shared/tool-content/tool-content';

type IndentOption = '2' | '4' | 'tab';
type Validity = 'empty' | 'valid' | 'invalid';

@Component({
  selector: 'app-json-formatter',
  imports: [ToolContent,
    CodeEditor,
    ShareLink,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './json-formatter.html',
  styleUrl: './json-formatter.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonFormatterTool {
  private readonly snackBar = inject(MatSnackBar);
  private readonly clipboard = inject(ClipboardService);

  protected readonly input = signal('');
  protected readonly output = signal('');
  protected readonly indent = signal<IndentOption>('2');
  protected readonly sortKeys = signal(false);
  protected readonly query = signal('');

  /** Highlighting for the result pane — everything but "To YAML" emits JSON. */
  protected readonly outputLanguage = signal<EditorLanguage>('json');

  /**
   * The input, the options and the query — but never the rendered output, which
   * the recipient's own browser recomputes from them.
   */
  protected readonly shared = syncToolState({
    key: 'json-formatter',
    snapshot: () => ({
      input: this.input(),
      indent: this.indent(),
      sortKeys: this.sortKeys(),
      query: this.query(),
    }),
    restore: (state) => {
      if (typeof state.input === 'string') {
        this.input.set(state.input);
      }
      if (state.indent === '2' || state.indent === '4' || state.indent === 'tab') {
        this.indent.set(state.indent);
      }
      if (typeof state.sortKeys === 'boolean') {
        this.sortKeys.set(state.sortKeys);
      }
      if (typeof state.query === 'string') {
        this.query.set(state.query);
      }
    },
  });

  /** Live, non-intrusive validity of the current input — drives the status chip. */
  protected readonly validity = computed<Validity>(() => {
    const text = this.input().trim();
    if (text === '') {
      return 'empty';
    }
    try {
      JSON.parse(text);
      return 'valid';
    } catch {
      return 'invalid';
    }
  });

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected setIndent(value: IndentOption): void {
    this.indent.set(value);
    this.reformatIfShown();
  }

  protected toggleSortKeys(checked: boolean): void {
    this.sortKeys.set(checked);
    this.reformatIfShown();
  }

  protected format(): void {
    this.outputLanguage.set('json');
    this.transform((value) => JSON.stringify(value, this.replacer(), this.indentValue()));
  }

  protected minify(): void {
    this.outputLanguage.set('json');
    this.transform((value) => JSON.stringify(value, this.replacer()));
  }

  /** JSON → YAML. YAML indentation is always spaces, so a tab choice falls back to 2. */
  protected toYaml(): void {
    this.outputLanguage.set('yaml');
    this.transform((value) =>
      stringifyYaml(value, {
        indent: this.indent() === 'tab' ? 2 : Number(this.indent()),
        sortMapEntries: this.sortKeys(),
      }).trimEnd(),
    );
  }

  /** YAML (a superset of JSON) → pretty JSON. */
  protected fromYaml(): void {
    this.outputLanguage.set('json');
    const text = this.input().trim();
    if (text === '') {
      return;
    }
    let parsed: unknown;
    try {
      parsed = parseYaml(text);
    } catch (error) {
      this.showError(yamlErrorMessage(error));
      return;
    }
    this.output.set(JSON.stringify(parsed, this.replacer(), this.indentValue()));
  }

  /** Evaluate a JSONPath expression against the input and show the matches. */
  protected runQuery(): void {
    this.outputLanguage.set('json');
    const path = this.query().trim();
    if (path === '') {
      this.showError('Enter a JSONPath expression first, e.g. $.store.book[*].title');
      return;
    }
    this.transform((value) => {
      const matches = JSONPath({ path, json: value as object, wrap: true });
      return JSON.stringify(matches, this.replacer(), this.indentValue());
    }, jsonPathErrorMessage);
  }

  protected copy(): void {
    void this.clipboard.copy(this.output());
  }

  protected clear(): void {
    this.input.set('');
    this.output.set('');
    this.query.set('');
  }

  /**
   * Parse the input as JSON and hand the value to a renderer; surface parse
   * errors (or a renderer's own failure) as a snackbar.
   */
  private transform(
    render: (value: unknown) => string,
    onRenderError: (error: unknown) => string = () => 'Could not process that input.',
  ): void {
    const text = this.input().trim();
    if (text === '') {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      this.showError(parseErrorMessage(error));
      return;
    }
    try {
      this.output.set(render(parsed));
    } catch (error) {
      this.showError(onRenderError(error));
    }
  }

  /** Keep an already-shown result in sync when the indent or sort-keys options change. */
  private reformatIfShown(): void {
    if (this.output() !== '') {
      this.format();
    }
  }

  private indentValue(): string | number {
    return this.indent() === 'tab' ? '\t' : Number(this.indent());
  }

  /** When "sort keys" is on, order each object's keys alphabetically during stringify. */
  private replacer(): ((key: string, value: unknown) => unknown) | undefined {
    if (!this.sortKeys()) {
      return undefined;
    }
    return (_key, value) => {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        return Object.keys(record)
          .sort()
          .reduce<Record<string, unknown>>((sorted, key) => {
            sorted[key] = record[key];
            return sorted;
          }, {});
      }
      return value;
    };
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 6000, panelClass: 'snack-error' });
  }
}

/** Turn a JSON.parse exception into a readable, capitalised message. */
function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'That input is not valid JSON.';
  }
  // V8's message already carries the position, e.g. "... in JSON at position 42 (line 3 column 5)".
  const message = error.message.replace(/^JSON\.parse:\s*/i, '');
  return message.charAt(0).toUpperCase() + message.slice(1);
}

function yamlErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'That input is not valid YAML.';
}

function jsonPathErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `That JSONPath expression could not be evaluated: ${detail}`;
}
