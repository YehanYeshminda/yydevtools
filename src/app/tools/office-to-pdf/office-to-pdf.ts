import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';
import { downloadBytes } from '../../core/download';
import type { HandoffFile } from '../../core/file-handoff';
import { NextStep } from '../../shared/next-step/next-step';
import { describeFile, formatBytes } from '../../core/format';
import { OfficeServicesClient, OfficeType } from '../../core/office-services.client';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';

/** Matches the Worker's and the service's cap, so oversized files fail before the upload. */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

const LEGACY = /\.(doc|xls|ppt)$/i;

@Component({
  selector: 'app-office-to-pdf',
  imports: [
    NextStep,
    ToolPage,
    Dropzone,
    ToolContent,
    RouterLink,
    MatButtonModule,
    NgIcon,
    Spinner,
  ],
  templateUrl: './office-to-pdf.html',
  styleUrls: ['../tool-shell.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfficeToPdfTool {
  private readonly office = inject(OfficeServicesClient);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly fileName = signal('');
  protected readonly fileSize = signal(0);
  protected readonly working = signal(false);
  /** Non-empty when the hosted service cannot serve this tool at all. */
  protected readonly unavailable = signal('');

  private bytes: Uint8Array | null = null;
  private type: OfficeType | null = null;

  protected readonly hasFile = computed(() => this.fileName() !== '');
  protected readonly canRun = computed(() => this.hasFile() && !this.working());
  protected readonly fileSummary = computed(() =>
    describeFile(this.fileName(), null, this.fileSize()),
  );

  constructor() {
    // The machine suspends when idle; wake it while the user picks a file.
    afterNextRender(() => this.office.warm());
  }

  protected acceptFiles(files: File[]): void {
    const file = files[0];
    if (file) {
      void this.load(file);
    }
  }

  private async load(file: File): Promise<void> {
    if (LEGACY.test(file.name)) {
      this.showError(
        `"${file.name}" is the older binary Office format. Save it as .docx, .xlsx or .pptx first.`,
      );
      return;
    }
    const type = /\.(docx|xlsx|pptx)$/i.exec(file.name)?.[1]?.toLowerCase() as
      OfficeType | undefined;
    if (!type) {
      this.showError(`"${file.name}" is not a Word, Excel or PowerPoint file.`);
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
      return;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    // All three formats are ZIP archives; the local-file-header signature is
    // the cheapest real check before the upload.
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03) {
      this.showError(`"${file.name}" is not a readable .${type} file.`);
      return;
    }

    this.clear();
    this.bytes = bytes;
    this.type = type;
    this.fileName.set(file.name);
    this.fileSize.set(file.size);
  }

  /** The converted document, so it can be carried into the next tool. */
  protected readonly result = signal<HandoffFile | null>(null);

  protected clear(): void {
    this.result.set(null);
    this.bytes = null;
    this.type = null;
    this.fileName.set('');
    this.fileSize.set(0);
  }

  protected async convert(): Promise<void> {
    const bytes = this.bytes;
    const type = this.type;
    if (!bytes || !type || this.working()) {
      return;
    }

    this.working.set(true);
    this.unavailable.set('');
    try {
      const result = await this.office.toPdf(bytes, type);
      if (result.ok) {
        const name = `${this.fileName().replace(/\.[^.]+$/, '')}.pdf`;
        downloadBytes(result.bytes, name, 'application/pdf');
        this.result.set({ bytes: result.bytes, name });
      } else if (result.failure.kind === 'unavailable') {
        this.unavailable.set(result.failure.message);
      } else {
        this.showError(result.failure.message);
      }
    } finally {
      this.working.set(false);
    }
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  }
}
