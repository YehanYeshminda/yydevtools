import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { HostedPdfTool } from '../../core/hosted-pdf-tool';

interface LanguageOption {
  value: string;
  label: string;
}

/**
 * A curated subset of Adobe's OCR locales — the ones people actually pick.
 * Adobe supports ~40; listing them all would make the control unusable.
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
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
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
