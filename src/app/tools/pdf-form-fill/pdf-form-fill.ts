import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgIcon } from '@ng-icons/core';
import { PDFDocument } from '@cantoo/pdf-lib';

import { downloadBytes } from '../../core/download';
import type { HandoffFile } from '../../core/file-handoff';
import { NextStep } from '../../shared/next-step/next-step';
import { describeFile, formatBytes } from '../../core/format';
import { looksLikePdf } from '../../core/pdf-probe';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { PdfPreview } from '../../shared/pdf-preview/pdf-preview';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import {
  FieldInfo,
  FieldValue,
  FieldValues,
  applyValues,
  initialValues,
  readFields,
} from './form-fields';

const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const SETTLE_MS = 400;

/**
 * PDF Form Fill & Flatten: the document's own fields as an HTML form, a live
 * preview of the filled pages, and a download that is editable or flattened.
 *
 * Browser-only via pdf-lib. The preview is always the flattened rendering so
 * the viewer's own form widgets do not compete with the inputs above it.
 */
@Component({
  selector: 'app-pdf-form-fill',
  imports: [
    NextStep,
    ToolPage,
    Dropzone,
    ToolContent,
    MatButtonModule,
    NgIcon,
    Spinner,
    PdfPreview,
  ],
  templateUrl: './pdf-form-fill.html',
  styleUrls: ['../tool-shell.css', './pdf-form-fill.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfFormFillTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);

  protected readonly fileName = signal('');
  protected readonly fileSize = signal(0);
  protected readonly pageCount = signal(0);
  protected readonly fields = signal<FieldInfo[]>([]);
  protected readonly values = signal<FieldValues>({});
  protected readonly xfa = signal(false);
  protected readonly flatten = signal(true);
  protected readonly preview = signal<Uint8Array | null>(null);
  protected readonly busy = signal(false);

  protected readonly hasFile = computed(() => this.fileName() !== '');
  protected readonly fileSummary = computed(() =>
    describeFile(this.fileName(), this.pageCount() || null, this.fileSize()),
  );
  protected readonly editable = computed(() => this.fields().filter((f) => !f.readOnly).length);

  private bytes: Uint8Array | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private run = 0;

  ngOnDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  protected acceptFiles(files: File[]): void {
    const file = files[0];
    if (file) {
      void this.load(file);
    }
  }

  private async load(file: File): Promise<void> {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      this.showError(`"${file.name}" is not a PDF.`);
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!looksLikePdf(bytes)) {
      this.showError(`"${file.name}" is not a readable PDF.`);
      return;
    }
    let doc: PDFDocument;
    let fields: FieldInfo[];
    try {
      doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      fields = readFields(doc);
    } catch {
      this.showError(`"${file.name}" could not be opened. It may be damaged or encrypted.`);
      return;
    }
    this.run++;
    this.bytes = bytes;
    this.fileName.set(file.name);
    this.fileSize.set(file.size);
    this.pageCount.set(doc.getPageCount());
    this.fields.set(fields);
    this.values.set(initialValues(fields));
    this.xfa.set(doc.getForm().hasXFA());
    this.preview.set(null);
    if (fields.length > 0) {
      await this.render();
    }
  }

  /** The last filled document, so it can be carried into the next tool. */
  protected readonly result = signal<HandoffFile | null>(null);

  protected clear(): void {
    this.result.set(null);
    this.run++;
    this.bytes = null;
    this.fileName.set('');
    this.fileSize.set(0);
    this.pageCount.set(0);
    this.fields.set([]);
    this.values.set({});
    this.preview.set(null);
  }

  // --- Inputs -------------------------------------------------------------
  protected setValue(name: string, value: FieldValue): void {
    this.values.update((current) => ({ ...current, [name]: value }));
    this.schedule();
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected selected(event: Event): string[] {
    return Array.from((event.target as HTMLSelectElement).selectedOptions, (o) => o.value);
  }

  protected setFlatten(event: Event): void {
    this.flatten.set((event.target as HTMLInputElement).checked);
  }

  protected isChosen(name: string, option: string): boolean {
    const value = this.values()[name];
    return Array.isArray(value) ? value.includes(option) : value === option;
  }

  protected asText(name: string): string {
    const value = this.values()[name];
    return typeof value === 'string' ? value : '';
  }

  /** The first chosen option of a dropdown or list, or '' when none is. */
  protected first(name: string): string {
    const value = this.values()[name];
    return Array.isArray(value) ? (value[0] ?? '') : '';
  }

  protected asBool(name: string): boolean {
    return this.values()[name] === true;
  }

  // --- Output -------------------------------------------------------------
  private schedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => void this.render(), SETTLE_MS);
  }

  private async render(): Promise<void> {
    const out = await this.build(true);
    if (out) {
      this.preview.set(out);
    }
  }

  protected async download(): Promise<void> {
    const out = await this.build(this.flatten());
    if (out) {
      const name = `${this.fileName().replace(/\.pdf$/i, '')}-filled.pdf`;
      downloadBytes(out, name, 'application/pdf');
      this.result.set({ bytes: out, name });
    }
  }

  private async build(flatten: boolean): Promise<Uint8Array | null> {
    const bytes = this.bytes;
    if (!bytes) {
      return null;
    }
    const run = ++this.run;
    this.busy.set(true);
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      applyValues(doc, this.values(), flatten);
      const out = await doc.save();
      return run === this.run ? out : null;
    } catch (error) {
      if (run === this.run) {
        this.showError(
          error instanceof Error && /encod|WinAnsi/i.test(error.message)
            ? 'One of the values uses characters this form’s font cannot show. Stick to Latin letters, digits and punctuation.'
            : 'The form could not be filled. It may be damaged or use an unsupported field type.',
        );
      }
      return null;
    } finally {
      if (run === this.run) {
        this.busy.set(false);
      }
    }
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 6000, panelClass: 'snack-error' });
  }
}
