import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { downloadBytes } from '../../core/download';
import { formatBytes } from '../../core/format';
import { OfficeServicesClient } from '../../core/office-services.client';
import { readPageCount } from '../../core/pdf-probe';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { PdfPreview } from '../../shared/pdf-preview/pdf-preview';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';

const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/**
 * The deck is rendered to PDF by the same endpoint Office to PDF uses, then
 * shown in the bundled pdf.js viewer — one slide per page, with its thumbnails
 * doubling as a slide sorter. There is no client-side PowerPoint engine to
 * host, so the conversion is the viewer.
 */
@Component({
  selector: 'app-powerpoint-viewer',
  imports: [ToolPage, Dropzone, ToolContent, MatButtonModule, NgIcon, Spinner, PdfPreview],
  templateUrl: './powerpoint-viewer.html',
  styleUrls: ['../tool-shell.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PowerpointViewerTool {
  private readonly office = inject(OfficeServicesClient);

  protected readonly name = signal('');
  protected readonly size = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly pdf = signal<Uint8Array | null>(null);
  protected readonly slides = signal<number | null>(null);

  protected readonly summary = computed(() => {
    const parts = [this.name()];
    const slides = this.slides();
    if (slides !== null) {
      parts.push(`${slides} ${slides === 1 ? 'slide' : 'slides'}`);
    }
    parts.push(formatBytes(this.size()));
    return parts.join(' · ');
  });

  /** Guards against a slow conversion landing after the user moved on. */
  private generation = 0;

  constructor() {
    afterNextRender(() => this.office.warm());
  }

  protected async open(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) {
      return;
    }
    if (/\.ppt$/i.test(file.name)) {
      this.fail(
        'That is a .ppt file — the older binary PowerPoint format. Open it in PowerPoint or LibreOffice and save it as .pptx first.',
      );
      return;
    }
    if (!/\.pptx$/i.test(file.name)) {
      this.fail('That does not look like a PowerPoint deck. Choose a .pptx file.');
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.fail(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
      return;
    }

    const generation = ++this.generation;
    this.reset();
    this.loading.set(true);
    this.name.set(file.name);
    this.size.set(file.size);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await this.office.toPdf(bytes, 'pptx');
    if (generation !== this.generation) {
      return;
    }
    if (!result.ok) {
      this.fail(result.failure.message);
      return;
    }
    this.slides.set(await readPageCount(result.bytes));
    this.pdf.set(result.bytes);
    this.loading.set(false);
  }

  protected download(): void {
    const pdf = this.pdf();
    if (pdf) {
      downloadBytes(pdf, `${this.name().replace(/\.pptx$/i, '')}.pdf`, 'application/pdf');
    }
  }

  protected close(): void {
    this.generation++;
    this.reset();
    this.name.set('');
    this.size.set(0);
  }

  private reset(): void {
    this.error.set(null);
    this.pdf.set(null);
    this.slides.set(null);
    this.loading.set(false);
  }

  private fail(message: string): void {
    this.reset();
    this.error.set(message);
  }
}
