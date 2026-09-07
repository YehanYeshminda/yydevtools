import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgIcon } from '@ng-icons/core';
import { registerLicense } from '@syncfusion/ej2-base';
import { SpreadsheetAllModule, SpreadsheetComponent } from '@syncfusion/ej2-angular-spreadsheet';

import { formatBytes } from '../../core/format';
import { OfficeServicesClient, WorkbookJson } from '../../core/office-services.client';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { SpreadsheetTheme } from '../../shared/syncfusion/spreadsheet-theme';
import { SYNCFUSION_LICENSE_KEY } from '../../core/syncfusion-license.generated';

/** The conversion service caps at the same figure; fail before the upload. */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/**
 * How long to wait for a handover to show up, and how many times to repeat it
 * before giving up; see `handOver`.
 *
 * The wait is deliberately generous. Handing the workbook over again is not
 * free: each call builds its own grid and the previous one is left behind, so
 * a workbook opened twice renders as two stacked grids — an empty one above
 * the real one, which is exactly the fault this pacing exists to avoid.
 * 10,741 rows took well over the 150ms this was first written with.
 */
const OPEN_POLL_MS = 100;
const OPEN_POLLS_PER_ATTEMPT = 20;
const MAX_OPEN_ATTEMPTS = 3;

/** Counts read back off the opened workbook, for the summary line. */
interface BookStats {
  sheets: number;
  rows: number;
  columns: number;
}

let licenseRegistered = false;

@Component({
  selector: 'app-excel-viewer',
  // `SpreadsheetAllModule`, not the bare `SpreadsheetModule`: the Spreadsheet
  // splits its features into injectable services, and the grid renderer is one
  // of them. With the bare module the component mounts, sizes itself and even
  // loads the workbook into its model — but `.e-sheet` stays empty, because
  // nothing is registered to draw the cells. Measured directly before this was
  // swapped in. The All module registers the lot; the read-only behaviour comes
  // from the inputs in the template, not from withholding services.
  imports: [
    ToolPage,
    ToolContent,
    Dropzone,
    Spinner,
    MatButtonModule,
    NgIcon,
    SpreadsheetAllModule,
    SpreadsheetTheme,
  ],
  templateUrl: './excel-viewer.html',
  styleUrls: ['../tool-shell.css', './excel-viewer.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExcelViewerTool {
  private readonly snackBar = inject(MatSnackBar);
  private readonly office = inject(OfficeServicesClient);

  protected readonly formatBytes = formatBytes;

  protected readonly name = signal('');
  protected readonly size = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly stats = signal<BookStats | null>(null);

  protected readonly hasWorkbook = computed(() => this.name() !== '' && this.error() === null);

  /**
   * The live grid, once the `@defer` block has rendered it.
   *
   * Resolving this says nothing about whether the grid will accept content
   * yet — it resolves well before that — which is why `handOver` verifies
   * rather than assumes.
   */
  private readonly instance = viewChild<SpreadsheetComponent>('sheet');

  /**
   * Bumped whenever the tool is reset, so a retry loop still in flight for a
   * previous file stops instead of opening it over the reader's new one.
   */
  private readonly generation = signal(0);

  /**
   * The converted workbook, held until the grid exists to take it.
   *
   * A signal rather than a plain field so the effect below covers both
   * orderings: the first workbook, where this is set before the `@defer` block
   * has rendered anything, and a later one, where the grid is already mounted
   * and it is the workbook that arrives second.
   */
  private readonly pendingWorkbook = signal<WorkbookJson | null>(null);

  constructor() {
    effect(() => {
      const sheet = this.instance();
      const workbook = this.pendingWorkbook();
      if (sheet && workbook) {
        this.pendingWorkbook.set(null);
        this.handOver(sheet, workbook, this.generation(), 0);
      }
    });

    // Same reasoning as Word Viewer's constructor: wake the shared machine
    // while the file is still being chosen, and register the licence once.
    afterNextRender(() => {
      if (!licenseRegistered) {
        licenseRegistered = true;
        if (SYNCFUSION_LICENSE_KEY) {
          registerLicense(SYNCFUSION_LICENSE_KEY);
        }
      }
      this.office.warm();
    });
  }

  protected async open(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) {
      return;
    }

    if (/\.xls$/i.test(file.name)) {
      this.fail(
        'That is a .xls file — the older binary Excel format. Open it in Excel or LibreOffice and save it as .xlsx first.',
      );
      return;
    }
    if (!/\.xlsx$/i.test(file.name)) {
      this.fail('That does not look like an Excel workbook. Choose a .xlsx file.');
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.fail(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
      return;
    }

    this.reset();
    this.loading.set(true);
    this.name.set(file.name);
    this.size.set(file.size);
    // `hasWorkbook()` is now true, which mounts the `@defer` block — so the
    // grid loads its chunk while the conversion is in flight.
    const generation = this.generation();

    const result = await this.office.importXlsx(file);

    // The reader moved on while this was converting.
    if (generation !== this.generation()) {
      return;
    }
    if (!result.ok) {
      this.fail(explain(result.failure.message));
      return;
    }

    // The effect in the constructor hands this to the grid as soon as both
    // exist; `loading` stays up until the grid confirms it opened.
    this.pendingWorkbook.set(result.workbook);
  }

  /**
   * Hands the converted workbook to the grid, and makes sure it took.
   *
   * The Spreadsheet ignores content given to it before it has finished
   * starting up, and says nothing when it does: no throw, no warning, and
   * neither `openComplete` nor `openFailure`. Every readiness event was tried
   * as a gate first — `created` and `dataBound` both fire too early — and
   * `isOpen` is no better, because it is set optimistically the moment a call
   * is made and stays true on calls that go nowhere.
   *
   * So readiness is not predicted, it is observed: hand the workbook over, and
   * if the grid still has not taken it, hand it over again. The check is that
   * the sheets actually changed, which is the thing we care about rather than
   * a proxy for it. This is only affordable because the conversion already
   * happened — a retry re-renders, it does not re-upload.
   */
  private handOver(
    sheet: SpreadsheetComponent,
    workbook: WorkbookJson,
    generation: number,
    attempt: number,
  ): void {
    // The reader pressed "Open another", or moved on to a different file.
    if (generation !== this.generation()) {
      return;
    }

    sheet.openFromJson({ file: workbook });
    this.awaitOpen(sheet, workbook, generation, attempt, 0);
  }

  /**
   * Watches for the handover to take effect, and only re-issues it if the grid
   * has shown no sign of life for a good while.
   *
   * Polling and re-issuing are separated on purpose. Polling often keeps the
   * spinner honest, so it clears the moment the grid is up; re-issuing rarely
   * keeps it correct, because a second `openFromJson` while the first is still
   * rendering leaves two grids stacked on the page.
   */
  private awaitOpen(
    sheet: SpreadsheetComponent,
    workbook: WorkbookJson,
    generation: number,
    attempt: number,
    poll: number,
  ): void {
    setTimeout(() => {
      if (generation !== this.generation()) {
        return;
      }
      if (this.opened(sheet)) {
        this.finish(sheet);
        return;
      }
      if (poll < OPEN_POLLS_PER_ATTEMPT) {
        this.awaitOpen(sheet, workbook, generation, attempt, poll + 1);
        return;
      }
      if (attempt >= MAX_OPEN_ATTEMPTS) {
        this.fail(
          'This workbook was converted, but the viewer could not display it. Reload the page and try again.',
        );
        return;
      }
      this.handOver(sheet, workbook, generation, attempt + 1);
    }, OPEN_POLL_MS);
  }

  /**
   * Settles the tool once the grid is showing the workbook.
   *
   * Called from `handOver` rather than driven by `openComplete`, because
   * `openFromJson` does not raise that event — measured: the sheets load and
   * render, and the event never arrives. Left waiting on it, the spinner
   * stayed up over a workbook the reader could already see.
   */
  private finish(sheet: SpreadsheetComponent): void {
    dropStalePanels(sheet);
    this.loading.set(false);
    fitColumns(sheet);
    this.stats.set(measure(sheet));
  }

  /**
   * Whether the grid is showing a real workbook rather than the empty starter
   * sheet the template scaffolds it with.
   */
  private opened(sheet: SpreadsheetComponent): boolean {
    const sheets = sheet.sheets ?? [];
    return sheets.length > 1 || (sheets[0]?.usedRange?.rowIndex ?? 0) > 0;
  }

  protected reset(): void {
    this.name.set('');
    this.size.set(0);
    this.error.set(null);
    this.stats.set(null);
    this.pendingWorkbook.set(null);
    this.generation.update((n) => n + 1);
  }

  private fail(message: string): void {
    this.error.set(message);
    this.name.set('');
    this.stats.set(null);
    this.pendingWorkbook.set(null);
    this.loading.set(false);
    this.snackBar.open(message, 'Dismiss', { duration: 8000 });
  }
}

/**
 * Turns the service's failure text into something worth reading.
 *
 * Most of its messages are already written for the reader, but the ones that
 * surface a conversion error are not — someone who dropped in a locked
 * workbook wants to know what to do about it, not what threw.
 */
function explain(detail: string | undefined): string {
  const lower = (detail ?? '').toLowerCase();

  if (lower.includes('password') || lower.includes('encrypt')) {
    return 'This workbook is password-protected, so it cannot be opened here. Remove the protection in Excel and save it again.';
  }
  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return 'The conversion service could not be reached. Try again in a moment.';
  }
  return detail?.trim()
    ? detail
    : 'This workbook could not be opened. It may be corrupt, password-protected, or not a real .xlsx file.';
}

/**
 * Removes the grid the Spreadsheet drew before it was given a workbook.
 *
 * `openFromJson` builds a fresh grid and appends it, without taking down the
 * one already there — so the empty starter grid the component renders on
 * mount is left stacked above the real one, each with its own scrollbar. Only
 * the last panel has a column header, which is what makes the leftover read
 * as a broken half-rendered table.
 *
 * Whether it happens at all is a race, which is why it survived local
 * testing: the panel only exists if the component finished painting before
 * the conversion came back. Locally that took about a second and it never
 * did; against the deployed service it took five, and it did every time.
 *
 * Reaching into the widget's DOM is not something to do lightly, but there is
 * no API for it — `refresh()` tears the grid down to nothing — and the scope
 * is small and checkable: only inside this component's own host, and only
 * panels that are no longer the current one.
 */
function dropStalePanels(sheet: SpreadsheetComponent): void {
  const panels = sheet.element?.querySelectorAll('.e-main-panel');
  if (!panels) {
    return;
  }
  for (let i = 0; i < panels.length - 1; i += 1) {
    panels[i].remove();
  }
}

/**
 * Widens the active sheet's columns to fit what is in them.
 *
 * A spreadsheet stores a width per column, and a cell whose text is longer
 * than its column is simply clipped — in Excel that is survivable, because you
 * can widen the column or read the value in the formula bar. Here there is no
 * formula bar and the grid is read-only, so a clipped cell is unreadable full
 * stop, and a column of long identifiers renders as a column of prefixes.
 * Measured on a 10,741-row workbook: the ids needed 148px and were given the
 * 64px default, so every one of them was cut off mid-value.
 *
 * `autoFit` is the same operation as double-clicking a column edge in Excel,
 * and it costs ~415ms across that workbook — paid once per sheet on open,
 * against a conversion round-trip that is already measured in seconds.
 *
 * The trade is fidelity: a width the author deliberately set is widened too.
 * For a viewer that seems right — being able to read the content beats
 * reproducing the column the author happened to leave narrow — but it is why
 * this tool no longer claims to keep column widths exactly as they were.
 *
 * Only the sheet that is open gets fitted, and only when the workbook is
 * opened. Refitting on sheet change is deliberately not wired to
 * `actionComplete`: that event fires for the resize this function itself
 * performs, so calling it from there is an infinite loop that locks the tab —
 * which it duly did, once.
 */
function fitColumns(sheet: SpreadsheetComponent): void {
  const active = sheet.sheets?.[sheet.activeSheetIndex ?? 0];
  const lastColumn = active?.usedRange?.colIndex;
  if (lastColumn === undefined || lastColumn < 0) {
    return;
  }
  sheet.autoFit(`A:${columnName(lastColumn)}`);
}

/** 0 -> A, 25 -> Z, 26 -> AA — the spreadsheet's own column naming. */
function columnName(index: number): string {
  let name = '';
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) {
    name = String.fromCharCode(65 + (n % 26)) + name;
  }
  return name;
}

/**
 * Sheet, row and column counts off the opened workbook.
 *
 * `usedRange` is the sheet's own record of how far its content reaches, which
 * is what the service reported per sheet — cheaper and more honest than
 * walking every row, and it is the same figure Excel shows.
 */
function measure(sheet: SpreadsheetComponent): BookStats {
  const sheets = sheet.sheets ?? [];
  let rows = 0;
  let columns = 0;
  for (const entry of sheets) {
    const used = entry.usedRange;
    rows += (used?.rowIndex ?? 0) + 1;
    columns = Math.max(columns, (used?.colIndex ?? 0) + 1);
  }
  return { sheets: sheets.length, rows, columns };
}
