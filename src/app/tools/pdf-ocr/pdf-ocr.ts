import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { HostedPdfTool } from '../../core/hosted-pdf-tool';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';

interface LanguageOption {
  value: string;
  label: string;
}

/**
 * The languages we ship Tesseract packs for on the OCR service. Add a pack in
 * the service Dockerfile (and its LANGS set) to offer more here.
 */
const LANGUAGES: LanguageOption[] = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'de-DE', label: 'German' },
  { value: 'fr-FR', label: 'French' },
  { value: 'es-ES', label: 'Spanish' },
  { value: 'it-IT', label: 'Italian' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'nl-NL', label: 'Dutch' },
  { value: 'sv-SE', label: 'Swedish' },
  { value: 'pl-PL', label: 'Polish' },
  { value: 'tr-TR', label: 'Turkish' },
  { value: 'ru-RU', label: 'Russian' },
  { value: 'ja-JP', label: 'Japanese' },
  { value: 'ko-KR', label: 'Korean' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
];

@Component({
  selector: 'app-pdf-ocr',
  imports: [ToolContent, RouterLink, MatButtonModule, MatIconModule, Spinner],
  templateUrl: './pdf-ocr.html',
  styleUrls: ['../tool-shell.css', './pdf-ocr.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfOcrTool extends HostedPdfTool {
  protected readonly languages = LANGUAGES;
  protected readonly language = signal('en-US');

  protected onLanguageChange(event: Event): void {
    this.language.set((event.target as HTMLSelectElement).value);
  }

  protected async recognise(): Promise<void> {
    const language = this.language();
    const result = await this.runHosted((bytes) => this.service.ocr(bytes, language));
    if (result) {
      // The page images are unchanged; only an invisible text layer is added.
      this.download(result, `${this.stem()}-ocr.pdf`);
    }
  }
}
