import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';

type IndentOption = '2' | '4' | 'tab';
type Validity = 'empty' | 'valid' | 'invalid';

@Component({
  selector: 'app-json-formatter',
  imports: [
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

  protected readonly input = signal('');
  protected readonly output = signal('');
  protected readonly indent = signal<IndentOption>('2');
  protected readonly sortKeys = signal(false);

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

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
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
    this.transform((value) => JSON.stringify(value, this.replacer(), this.indentValue()));
  }

  protected minify(): void {
    this.transform((value) => JSON.stringify(value, this.replacer()));
  }

  protected async copy(): Promise<void> {
    const text = this.output();
    if (text === '') {
      return;
    }
    await navigator.clipboard.writeText(text);
    this.snackBar.open('Copied to clipboard', undefined, { duration: 2000 });
  }

  protected clear(): void {
    this.input.set('');
    this.output.set('');
  }

  /** Parse the input and hand the value to a renderer; surface parse errors as a snackbar. */
  private transform(render: (value: unknown) => string): void {
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
    this.output.set(render(parsed));
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
