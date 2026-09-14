import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { downloadText } from '../../core/download';
import { syncToolState } from '../../core/tool-state';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { SendTo } from '../../shared/send-to/send-to';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { TryExample } from '../../shared/try-example/try-example';
import { convert, type Choice, type Delimiter } from './json-csv-codec';

/** Nested address and a missing field, so the example shows both rules at once. */
const SAMPLE = JSON.stringify(
  [
    { name: 'Ada Lovelace', born: 1815, address: { city: 'London', country: 'UK' } },
    { name: 'Grace Hopper', born: 1906, address: { city: 'New York', country: 'US' } },
    { name: 'Linus Torvalds', born: 1969, languages: ['C', 'Finnish'] },
  ],
  null,
  2,
);

const DELIMITERS: { value: Delimiter; label: string }[] = [
  { value: ',', label: 'Comma' },
  { value: ';', label: 'Semicolon' },
  { value: '\t', label: 'Tab' },
];

@Component({
  selector: 'app-json-csv',
  imports: [
    ToolPage,
    ToolContent,
    CodeEditor,
    Dropzone,
    SendTo,
    ShareLink,
    TryExample,
    MatButtonModule,
    MatCheckboxModule,
    NgIcon,
  ],
  templateUrl: './json-csv.html',
  styleUrls: ['../tool-shell.css', './json-csv.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonCsvTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly delimiters = DELIMITERS;

  protected readonly input = signal('');
  protected readonly choice = signal<Choice>('auto');
  protected readonly delimiter = signal<Delimiter>(',');
  protected readonly typed = signal(true);

  protected readonly shared = syncToolState({
    key: 'json-csv',
    snapshot: () => ({
      input: this.input(),
      choice: this.choice(),
      delimiter: this.delimiter(),
      typed: this.typed(),
    }),
    restore: (state) => {
      if (typeof state.input === 'string') {
        this.input.set(state.input);
      }
      if (state.choice === 'auto' || state.choice === 'to-csv' || state.choice === 'to-json') {
        this.choice.set(state.choice);
      }
      if (state.delimiter === ',' || state.delimiter === ';' || state.delimiter === '\t') {
        this.delimiter.set(state.delimiter);
      }
      if (typeof state.typed === 'boolean') {
        this.typed.set(state.typed);
      }
    },
  });

  protected readonly result = computed(() =>
    convert(this.input(), this.choice(), { delimiter: this.delimiter(), typed: this.typed() }),
  );
  protected readonly direction = computed(() => this.result().direction);
  protected readonly hasOutput = computed(() => this.result().output !== '');
  protected readonly summary = computed(() => {
    const { rows, columns } = this.result();
    return `${rows} ${rows === 1 ? 'row' : 'rows'} · ${columns} ${columns === 1 ? 'column' : 'columns'}`;
  });

  protected setChoice(choice: Choice): void {
    this.choice.set(choice);
  }

  protected setDelimiter(delimiter: Delimiter): void {
    this.delimiter.set(delimiter);
  }

  protected async open(files: File[]): Promise<void> {
    this.input.set(await files[0].text());
    this.choice.set('auto');
  }

  /** Feed the result back in and turn around, so a round trip is one click. */
  protected swap(): void {
    const { output, direction } = this.result();
    if (output === '') {
      return;
    }
    this.input.set(output);
    this.choice.set(direction === 'to-csv' ? 'to-json' : 'to-csv');
  }

  protected clear(): void {
    this.input.set('');
  }

  protected loadExample(): void {
    this.input.set(SAMPLE);
    this.choice.set('auto');
  }

  protected copy(): void {
    void this.clipboard.copy(this.result().output, { label: 'Result' });
  }

  protected download(): void {
    const csv = this.direction() === 'to-csv';
    downloadText(
      this.result().output,
      csv ? 'converted.csv' : 'converted.json',
      csv ? 'text/csv' : 'application/json',
    );
  }
}
