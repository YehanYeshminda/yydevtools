import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { downloadText } from '../../core/download';
import { formatBytes } from '../../core/format';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';

/** Rendering holds the whole document in memory, so cap the input. */
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

/** Counts taken from the rendered document, for the summary line. */
interface DocStats {
  words: number;
  characters: number;
  paragraphs: number;
  pages: number;
}

@Component({
  selector: 'app-word-viewer',
  imports: [ToolPage, ToolContent, Dropzone, Spinner, MatButtonModule, NgIcon],
  templateUrl: './word-viewer.html',
  styleUrls: ['../tool-shell.css', './word-viewer.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WordViewerTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly clipboard = inject(ClipboardService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly formatBytes = formatBytes;

  protected readonly name = signal('');
  protected readonly size = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly stats = signal<DocStats | null>(null);

  protected readonly hasDocument = computed(() => this.name() !== '' && this.error() === null);

  private readonly host = viewChild<ElementRef<HTMLElement>>('renderHost');

  /**
   * The shadow root the document is rendered into.
   *
   * docx-preview reproduces a Word document by emitting HTML *and* a stylesheet
   * built from the document's own styles — which is the point of it, and also a
   * problem: those rules are written for a whole page and would happily restyle
   * the rest of this one. A shadow root contains them. An iframe would too, but
   * it brings back the hydration and cross-document access awkwardness that the
   * HTML Preview tool already had to work around, and there is no security
   * boundary to be gained here: docx-preview builds DOM nodes from OOXML rather
   * than executing anything the file supplies.
   */
  private shadow: ShadowRoot | null = null;

  ngOnDestroy(): void {
    this.clearShadow();
  }

  protected async open(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) {
      return;
    }

    if (/\.doc$/i.test(file.name)) {
      this.fail(
        'That is a .doc file — the older binary Word format, which browsers cannot read. Open it in Word or LibreOffice and save it as .docx first.',
      );
      return;
    }
    if (!/\.docx$/i.test(file.name)) {
      this.fail('That does not look like a Word document. Choose a .docx file.');
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

    try {
      // ~175 kB with its zip dependency, so it is fetched only when a document
      // is actually opened rather than on every visit to the page.
      const { renderAsync } = await import('docx-preview');
      const target = this.prepareShadow();
      if (!target) {
        throw new Error('This browser could not create a container for the document.');
      }

      await renderAsync(file, target.body, target.styles, {
        className: 'docx',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        experimental: true,
      });

      this.stats.set(measure(target.body));
    } catch (error) {
      this.fail(explain(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected reset(): void {
    this.clearShadow();
    this.name.set('');
    this.size.set(0);
    this.error.set(null);
    this.stats.set(null);
  }

  /** The document's text, read back out of what was rendered. */
  private text(): string {
    const body = this.shadow?.querySelector('.docx-render');
    return (body?.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
  }

  protected copyText(): void {
    const text = this.text();
    if (text) {
      void this.clipboard.copy(text, { message: 'Document text copied to clipboard' });
    }
  }

  protected downloadText(): void {
    const text = this.text();
    if (text) {
      downloadText(text, `${this.name().replace(/\.docx$/i, '')}.txt`, 'text/plain');
    }
  }

  protected print(): void {
    if (this.isBrowser) {
      window.print();
    }
  }

  // --- Shadow root -------------------------------------------------------
  private prepareShadow(): { body: HTMLElement; styles: HTMLElement } | null {
    const host = this.host()?.nativeElement;
    if (!host) {
      return null;
    }
    this.clearShadow();
    // A host can only ever be given one shadow root, so it is created once and
    // its contents replaced on each open.
    this.shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });

    const styles = document.createElement('div');
    const body = document.createElement('div');
    body.className = 'docx-render';
    this.shadow.replaceChildren(styles, body);
    return { body, styles };
  }

  private clearShadow(): void {
    this.shadow?.replaceChildren();
  }

  private fail(message: string): void {
    this.error.set(message);
    this.name.set('');
    this.stats.set(null);
    this.clearShadow();
    this.snackBar.open(message, 'Dismiss', { duration: 8000 });
  }
}

/**
 * Turn a failure into something worth reading.
 *
 * The underlying errors come from the zip layer and are written for developers
 * — one of them helpfully links to the zip library's own documentation, which
 * is no use at all to somebody who has just dragged in the wrong file. Each
 * recognisable cause gets a sentence saying what to do about it instead.
 */
function explain(error: unknown): string {
  const detail = error instanceof Error ? error.message : '';
  const lower = detail.toLowerCase();

  if (lower.includes('central directory') || lower.includes('zip')) {
    return 'This is not a readable .docx file. A .docx is a zip archive, and this one could not be opened as such — it may be corrupt, incompletely downloaded, or another format that has simply been renamed.';
  }
  if (lower.includes('encrypt') || lower.includes('password')) {
    return 'This document appears to be password-protected, so it cannot be opened here. Remove the protection in Word and save it again.';
  }
  if (lower.includes('document.xml') || lower.includes('not found')) {
    return 'This zip archive does not contain a Word document. It may be an .xlsx or .pptx file, or a .docx that was saved incorrectly.';
  }
  return 'This document could not be opened. It may be corrupt, password-protected, or not a real .docx file.';
}

/** Word, character, paragraph and page counts from the rendered document. */
function measure(container: HTMLElement): DocStats {
  const text = (container.textContent ?? '').trim();
  const words = text === '' ? 0 : text.split(/\s+/).length;
  // docx-preview emits one section element per rendered page when breakPages is on.
  const pages = container.querySelectorAll('section.docx').length;
  return {
    words,
    characters: text.length,
    paragraphs: container.querySelectorAll('p').length,
    pages: Math.max(pages, 1),
  };
}
