import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { downloadText } from '../../core/download';
import { formatBytes } from '../../core/format';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { TryExample } from '../../shared/try-example/try-example';
import {
  describeDelimiter,
  filterRows,
  findRagged,
  normaliseHeaders,
  summarise,
  toObjects,
  type Row,
} from './csv-tools';

const MAX_INPUT_BYTES = 25 * 1024 * 1024;

/** Rows rendered at once. A CSV can easily hold more than a DOM should. */
const RENDER_LIMIT = 500;

/**
 * Deliberately awkward but well-formed: names containing commas, a doubled
 * quote, a thousands separator inside a quoted value, a blank cell, and
 * non-ASCII text. Every one of these breaks something that splits on commas,
 * and all of them are correct CSV — so the example should parse cleanly.
 */
const SAMPLE = `order_id,customer,country,ordered_at,total,shipped
1001,"Ahmed, Layla",AE,2026-08-02,149.99,true
1002,"O'Brien, Sean",IE,2026-08-03,24.50,true
1003,"Nakamura, Yui",JP,2026-08-05,"1,299.00",false
1004,"García, Ana",ES,2026-08-07,89.95,true
1005,"Smith, ""Jo""",GB,2026-08-11,,false`;

@Component({
  selector: 'app-csv-viewer',
  imports: [ToolPage, ToolContent, Dropzone, TryExample, MatButtonModule, NgIcon],
  templateUrl: './csv-viewer.html',
  styleUrls: ['../tool-shell.css', './csv-viewer.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsvViewerTool {
  private readonly snackBar = inject(MatSnackBar);
  private readonly clipboard = inject(ClipboardService);

  protected readonly formatBytes = formatBytes;
  protected readonly renderLimit = RENDER_LIMIT;

  protected readonly name = signal('');
  protected readonly size = signal(0);
  protected readonly headers = signal<string[]>([]);
  protected readonly rows = signal<Row[]>([]);
  protected readonly delimiter = signal('');
  protected readonly problems = signal<string[]>([]);
  protected readonly filter = signal('');
  protected readonly firstRowIsHeader = signal(true);
  protected readonly parsing = signal(false);

  /** The raw text, kept so the header toggle can re-parse without the file. */
  private raw = '';

  protected readonly loaded = computed(() => this.headers().length > 0);
  protected readonly delimiterName = computed(() => describeDelimiter(this.delimiter()));
  protected readonly columns = computed(() => summarise(this.headers(), this.rows()));

  protected readonly visible = computed(() => filterRows(this.rows(), this.filter()));
  protected readonly shown = computed(() => this.visible().slice(0, RENDER_LIMIT));
  protected readonly truncated = computed(() => this.visible().length > RENDER_LIMIT);
  protected readonly filtering = computed(() => this.filter().trim() !== '');

  // --- Input -------------------------------------------------------------
  protected async open(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) {
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
      return;
    }
    this.name.set(file.name);
    this.size.set(file.size);
    await this.parse(await file.text());
  }

  protected loadExample(): void {
    this.name.set('orders.csv');
    this.size.set(new TextEncoder().encode(SAMPLE).length);
    void this.parse(SAMPLE);
  }

  protected toggleHeader(): void {
    this.firstRowIsHeader.update((value) => !value);
    if (this.raw) {
      void this.parse(this.raw);
    }
  }

  protected reset(): void {
    this.raw = '';
    this.name.set('');
    this.size.set(0);
    this.headers.set([]);
    this.rows.set([]);
    this.delimiter.set('');
    this.problems.set([]);
    this.filter.set('');
  }

  protected onFilterInput(event: Event): void {
    this.filter.set((event.target as HTMLInputElement).value);
  }

  // --- Output ------------------------------------------------------------
  protected copyJson(): void {
    void this.clipboard.copy(this.json(), { message: 'JSON copied to clipboard' });
  }

  protected downloadJson(): void {
    const stem = this.name().replace(/\.[^.]+$/, '') || 'data';
    downloadText(this.json(), `${stem}.json`, 'application/json');
  }

  private json(): string {
    return JSON.stringify(toObjects(this.headers(), this.visible()), null, 2);
  }

  // --- Parsing -----------------------------------------------------------
  /**
   * Parse with Papa Parse, which is imported only when a file is actually
   * opened. It is asked to detect the delimiter itself — a semicolon-separated
   * export from a European locale is the common case that trips up anything
   * assuming a comma — and to keep every value as a string, because guessing
   * types would silently mangle leading zeros in postcodes and ids.
   */
  private async parse(text: string): Promise<void> {
    this.raw = text;
    this.parsing.set(true);
    try {
      const Papa = (await import('papaparse')).default;
      const result = Papa.parse<string[]>(text, {
        skipEmptyLines: 'greedy',
        dynamicTyping: false,
        header: false,
      });

      const all = (result.data as string[][]).filter((row) => row.length > 0);
      if (all.length === 0) {
        this.showError('That file has no rows in it.');
        this.reset();
        return;
      }

      const width = Math.max(...all.map((row) => row.length));
      // Ragged rows are detected here, against the raw rows, before padding
      // evens them out — and against the header's own width rather than the
      // widest row, so the row that is wrong is the one reported rather than
      // every other row for failing to match it.
      let ragged: ReturnType<typeof findRagged>;

      if (this.firstRowIsHeader()) {
        const [first, ...rest] = all;
        this.headers.set(normaliseHeaders(pad(first, width)));
        this.rows.set(rest.map((row) => pad(row, width)));
        ragged = findRagged(rest, first.length, 1);
      } else {
        this.headers.set(normaliseHeaders(new Array(width).fill('')));
        this.rows.set(all.map((row) => pad(row, width)));
        ragged = findRagged(all, modal(all), 0);
      }

      this.delimiter.set(result.meta.delimiter ?? '');
      this.problems.set(
        ragged.map(
          (r) => `Line ${r.row} has ${r.cells} cell${r.cells === 1 ? '' : 's'}, not ${
            this.firstRowIsHeader() ? all[0].length : modal(all)
          }`,
        ),
      );
    } catch {
      this.showError('That file could not be read as CSV.');
      this.reset();
    } finally {
      this.parsing.set(false);
    }
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 6000 });
  }
}

/** The most common row length, used as the expected width when there is no header. */
function modal(rows: readonly Row[]): number {
  const counts = new Map<number, number>();
  for (const row of rows) {
    counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = -1;
  for (const [length, count] of counts) {
    if (count > bestCount) {
      best = length;
      bestCount = count;
    }
  }
  return best;
}

/** Pad a short row so every row has the same number of cells as the widest. */
function pad(row: readonly string[], width: number): string[] {
  const out = [...row];
  while (out.length < width) {
    out.push('');
  }
  return out;
}
