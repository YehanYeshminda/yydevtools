import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';
import { HostedPdfTool } from '../../core/hosted-pdf-tool';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { Spinner } from '../../shared/spinner/spinner';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { LocalOcrUnsupported, runLocalOcr, type LocalOcrProgress } from './local-ocr';

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

export type OcrMode = 'local' | 'hosted';

/**
 * Longest document worth recognising in the browser.
 *
 * Recognition costs a few seconds a page on one thread, so beyond roughly this
 * the hosted service — which has a machine to itself — is genuinely the kinder
 * answer, not a compromise.
 */
const MAX_LOCAL_PAGES = 20;

/** Roughly what the engine and English model weigh, for the one-time download. */
const ENGINE_DOWNLOAD = '7 MB';

@Component({
  selector: 'app-pdf-ocr',
  imports: [ToolPage, Dropzone, ToolContent, RouterLink, MatButtonModule, NgIcon, Spinner],
  templateUrl: './pdf-ocr.html',
  styleUrls: ['../tool-shell.css', './pdf-ocr.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfOcrTool extends HostedPdfTool {
  protected readonly languages = LANGUAGES;
  protected readonly language = signal('en-US');
  protected readonly maxLocalPages = MAX_LOCAL_PAGES;
  protected readonly engineDownload = ENGINE_DOWNLOAD;

  protected readonly mode = signal<OcrMode>('local');
  /** Human-readable progress while recognition runs in the browser. */
  protected readonly progress = signal('');
  /** Words written into the text layer by the last local run. */
  protected readonly wordsFound = signal<number | null>(null);
  /** Set when the local path declined this document and hosted should be used. */
  protected readonly localDeclined = signal('');

  private abort: AbortController | null = null;

  /** Only English is shipped for in-browser recognition. */
  protected readonly englishSelected = computed(() => this.language().startsWith('en-'));

  protected readonly tooManyPages = computed(() => (this.pageCount() ?? 0) > MAX_LOCAL_PAGES);

  /** Whether the in-browser option can be offered for the loaded document. */
  protected readonly localAvailable = computed(
    () => this.englishSelected() && !this.tooManyPages(),
  );

  /** What is actually used when Run is pressed. */
  protected readonly effectiveMode = computed<OcrMode>(() =>
    this.mode() === 'local' && this.localAvailable() ? 'local' : 'hosted',
  );

  /** Why the in-browser option is unavailable, for the disabled control. */
  protected readonly localBlockedReason = computed(() => {
    if (!this.englishSelected()) {
      return 'In-browser recognition ships with the English model only.';
    }
    if (this.tooManyPages()) {
      return `In-browser recognition is offered for documents up to ${MAX_LOCAL_PAGES} pages.`;
    }
    return '';
  });

  protected onLanguageChange(event: Event): void {
    this.language.set((event.target as HTMLSelectElement).value);
  }

  protected setMode(mode: OcrMode): void {
    this.mode.set(mode);
    this.localDeclined.set('');
  }

  protected override clear(): void {
    super.clear();
    this.progress.set('');
    this.wordsFound.set(null);
    this.localDeclined.set('');
  }

  protected cancel(): void {
    this.abort?.abort();
  }

  protected async recognise(): Promise<void> {
    this.wordsFound.set(null);
    this.localDeclined.set('');
    if (this.effectiveMode() === 'local') {
      await this.recogniseLocally();
    } else {
      await this.recogniseHosted();
    }
  }

  private async recogniseHosted(): Promise<void> {
    const language = this.language();
    const result = await this.runHosted((bytes) => this.service.ocr(bytes, language));
    if (result) {
      // The page images are unchanged; only an invisible text layer is added.
      this.download(result, `${this.stem()}-ocr.pdf`);
    }
  }

  private async recogniseLocally(): Promise<void> {
    const source = this.bytes;
    if (!source || this.working()) {
      return;
    }

    this.working.set(true);
    this.unavailable.set('');
    this.abort = new AbortController();
    this.progress.set('Loading the recognition engine…');

    try {
      const result = await runLocalOcr({
        bytes: source,
        signal: this.abort.signal,
        onProgress: (progress) => this.progress.set(describe(progress, this.engineDownload)),
      });
      this.wordsFound.set(result.words);
      this.download(result.bytes, `${this.stem()}-ocr.pdf`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // The user stopped it; nothing to report.
      } else if (error instanceof LocalOcrUnsupported) {
        // Not a failure — the hosted service is the right tool for this one.
        this.localDeclined.set(error.message);
        this.mode.set('hosted');
      } else {
        // The user gets a plain sentence and a working alternative; the detail
        // goes to the console, because "it didn't work" is not a bug report.
        console.error('In-browser OCR failed', error);
        this.showError(
          'Recognition could not be completed in your browser. Try the hosted service instead.',
        );
      }
    } finally {
      this.working.set(false);
      this.abort = null;
      this.progress.set('');
    }
  }
}

/** Turns a progress report into the line shown under the button. */
function describe(progress: LocalOcrProgress, download: string): string {
  switch (progress.stage) {
    case 'starting':
      return `Loading the recognition engine — about ${download} the first time, then cached…`;
    case 'rendering':
      return `Preparing page ${progress.page} of ${progress.pages}…`;
    case 'recognising':
      return `Reading page ${progress.page} of ${progress.pages}…`;
    case 'writing':
      return 'Adding the text layer…';
  }
}
