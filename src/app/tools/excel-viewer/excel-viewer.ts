import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgIcon } from '@ng-icons/core';
import { registerLicense } from '@syncfusion/ej2-base';
import { SpreadsheetAllModule, SpreadsheetComponent } from '@syncfusion/ej2-angular-spreadsheet';

import { formatBytes } from '../../core/format';
import { OfficeServicesClient } from '../../core/office-services.client';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { SpreadsheetTheme } from '../../shared/syncfusion/spreadsheet-theme';
import { SYNCFUSION_LICENSE_KEY } from '../../core/syncfusion-license.generated';

/** The conversion service caps at the same figure; fail before the upload. */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

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
   * The live component, captured from its own `created` event rather than a
   * `viewChild` query.
   *
   * The query version was measured never resolving in time inside the
   * `@defer` block — the component mounted, sized itself and sat there while
   * the effect below never saw it. Taking the instance straight off the
   * template reference in the event binding sidesteps query timing entirely.
   */
  private readonly instance = signal<SpreadsheetComponent | null>(null);

  /**
   * Where the Spreadsheet posts the file itself.
   *
   * This is the one tool that does not fetch its own conversion: the component
   * builds and sends the request, so all we hand it is a URL. Word Viewer does
   * the opposite — see OfficeServicesClient.importDocx — and the two shapes meet
   * at the same machine behind /api/*.
   */
  protected readonly openUrl = '/api/excel/import';

  /**
   * The chosen file, held until the component exists to take it.
   *
   * A signal rather than a plain field so the effect below covers both
   * orderings: the first workbook, where the file is set before the `@defer`
   * block has rendered anything, and a later one, where the component is
   * already mounted and it is the file that arrives second. Word Viewer gets
   * away with a plain field only because its network round-trip happens to
   * give the block time to render first.
   */
  private readonly pendingFile = signal<File | null>(null);

  constructor() {
    effect(() => {
      const sheet = this.instance();
      const file = this.pendingFile();
      if (sheet && file) {
        this.pendingFile.set(null);
        // The component takes it from here: it posts to `openUrl` itself and
        // renders whatever workbook JSON comes back.
        sheet.open({ file });
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

  protected open(files: File[]): void {
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
    // `hasWorkbook()` is now true, which mounts the `@defer` block. The effect
    // in the constructor hands the file over as soon as both exist.
    this.pendingFile.set(file);
  }

  /** Captures the component the moment it exists; see `instance` above. */
  protected onCreated(sheet: SpreadsheetComponent): void {
    this.instance.set(sheet);
  }

  protected onOpenComplete(): void {
    this.loading.set(false);
    const sheet = this.instance();
    if (sheet) {
      this.stats.set(measure(sheet));
    }
  }

  /**
   * The component surfaces its own failures here rather than throwing, which
   * includes anything the Worker rejected — so the message the service wrote
   * is what the reader sees, exactly as in the PDF tools.
   */
  protected onOpenFailure(args: { message?: string }): void {
    this.loading.set(false);
    this.fail(explain(args?.message));
  }

  protected reset(): void {
    this.name.set('');
    this.size.set(0);
    this.error.set(null);
    this.stats.set(null);
    this.pendingFile.set(null);
  }

  private fail(message: string): void {
    this.error.set(message);
    this.name.set('');
    this.stats.set(null);
    this.pendingFile.set(null);
    this.loading.set(false);
    this.snackBar.open(message, 'Dismiss', { duration: 8000 });
  }
}

/**
 * Turns the component's own failure text into something worth reading.
 *
 * Its messages are written for a developer wiring up a service — the reader
 * dropped in a file and wants to know what to do about it instead.
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
