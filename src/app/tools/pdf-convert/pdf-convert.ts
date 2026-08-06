import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';
import { HostedPdfTool } from '../../core/hosted-pdf-tool';
import { ExportFormat } from '../../core/pdf-services.client';
import { Spinner } from '../../shared/spinner/spinner';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { ToolContent } from '../../shared/tool-content/tool-content';

interface FormatOption {
  value: ExportFormat;
  label: string;
  extension: string;
}

const FORMATS: FormatOption[] = [
  { value: 'docx', label: 'Word', extension: 'docx' },
  { value: 'rtf', label: 'Rich text', extension: 'rtf' },
];

@Component({
  selector: 'app-pdf-convert',
  imports: [Dropzone, ToolContent, RouterLink, MatButtonModule, NgIcon, Spinner],
  templateUrl: './pdf-convert.html',
  styleUrls: ['../tool-shell.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfConvertTool extends HostedPdfTool {
  protected readonly formats = FORMATS;
  protected readonly format = signal<ExportFormat>('docx');

  protected selectFormat(format: ExportFormat): void {
    this.format.set(format);
  }

  protected async convert(): Promise<void> {
    const format = this.format();
    const result = await this.runHosted((bytes) => this.service.exportPdf(bytes, format));
    if (!result) {
      return;
    }

    const option = FORMATS.find((entry) => entry.value === format);
    this.download(result, `${this.stem()}.${option?.extension ?? format}`);
  }
}
