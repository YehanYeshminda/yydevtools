import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  computed,
  effect,
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
import { type Zoom, resolveScale, stepZoom } from './page-fit';

/** Rendering holds the whole document in memory, so cap the input. */
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

/**
 * Overrides for the stylesheet docx-preview builds.
 *
 * Injected into the shadow root *after* the library's own styles, so equal
 * specificity resolves in this sheet's favour and no `!important` is needed.
 * Three things are being corrected here, and the first is the important one.
 *
 *  - `section.docx` ships as `overflow: hidden`, which silently deletes
 *    anything wider than the page. A table with more columns than the text
 *    column can hold — the ordinary shape of an exported report — loses its
 *    right-hand columns with nothing to say they were ever there. Drawing them
 *    is what Word does, and being able to see that content runs off the page is
 *    itself worth knowing. The section is a flex container, so it still
 *    contains its floats without needing to clip.
 *  - the wrapper's `background: gray` is hard-coded, and stacked on this app's
 *    own surface it showed as a mismatched band above the first page.
 *  - `width: max-content` keeps the pages at their true width regardless of the
 *    element they are measured in, which is what makes the zoom arithmetic
 *    stable: the scale can change without the measurement moving under it.
 */
const OVERRIDES = `
.docx-render { width: max-content; transform-origin: top left; }
.docx-wrapper { background: transparent; padding: 0; width: max-content; }
.docx-wrapper > section.docx {
  margin: 0 0 1.25rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14), 0 8px 24px rgba(0, 0, 0, 0.12);
}
.docx-wrapper > section.docx:last-child { margin-bottom: 0; }
section.docx { overflow: visible; }
@media print {
  .docx-render { transform: none !important; }
  .docx-wrapper > section.docx { margin: 0; box-shadow: none; }
}
`;

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
  private readonly surface = viewChild<ElementRef<HTMLElement>>('surface');

  // --- Zoom ---------------------------------------------------------------
  protected readonly zoom = signal<Zoom>('fit');

  /** The document's own width and height in CSS pixels, unscaled. */
  private readonly contentWidth = signal(0);
  private readonly contentHeight = signal(0);

  /** The width available to show it in, tracked as the window resizes. */
  private readonly available = signal(0);

  protected readonly scale = computed(() =>
    resolveScale(this.zoom(), this.contentWidth(), this.available()),
  );
  protected readonly zoomPercent = computed(() => Math.round(this.scale() * 100));
  protected readonly canZoomIn = computed(() => stepZoom(this.scale(), 1) !== this.scale());
  protected readonly canZoomOut = computed(() => stepZoom(this.scale(), -1) !== this.scale());

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

  constructor() {
    // Track the space the document has to fit into.
    effect((onCleanup) => {
      const element = this.surface()?.nativeElement;
      if (!element || !this.isBrowser) {
        return;
      }
      // Seeded synchronously as well as observed. ResizeObserver delivers its
      // first callback at the end of a frame, and a tab that is not being
      // painted produces no frames — so a document opened in a background tab
      // would otherwise stay at 100% until something resized it.
      this.measureAvailable();
      const observer = new ResizeObserver(([entry]) => {
        // contentBoxSize already excludes padding, which is what a page may occupy.
        const box = entry.contentBoxSize?.[0];
        if (box) {
          this.available.set(box.inlineSize);
        } else {
          this.measureAvailable();
        }
      });
      observer.observe(element);
      onCleanup(() => observer.disconnect());
    });

    // Scaling is applied imperatively because the elements it acts on live
    // inside the shadow root, out of reach of the component's template and
    // stylesheet.
    effect(() => this.applyScale(this.scale()));
  }

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
      extendPages(target.body);
      this.measurePage(target.body);
      // The surface was hidden until this document arrived, so whatever the
      // observer last reported for it was the size of nothing.
      this.measureAvailable();
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
    this.zoom.set('fit');
    this.contentWidth.set(0);
    this.contentHeight.set(0);
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

  protected zoomIn(): void {
    this.zoom.set(stepZoom(this.scale(), 1));
  }

  protected zoomOut(): void {
    this.zoom.set(stepZoom(this.scale(), -1));
  }

  protected fitWidth(): void {
    this.zoom.set('fit');
  }

  // --- Layout ------------------------------------------------------------
  /**
   * Record how much room the rendered document actually needs.
   *
   * `scrollWidth` rather than `offsetWidth`, because it counts content that
   * spills past the page edge as well as the page itself. That is what makes
   * "fit width" show the whole of a table that is wider than its page instead
   * of stopping at the paper.
   */
  private measurePage(body: HTMLElement): void {
    this.contentWidth.set(body.scrollWidth);
    this.contentHeight.set(body.scrollHeight);
  }

  /** The surface's content width, read straight from layout. */
  private measureAvailable(): void {
    const element = this.surface()?.nativeElement;
    if (!element) {
      return;
    }
    const style = getComputedStyle(element);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    this.available.set(Math.max(0, element.clientWidth - padding));
  }

  /**
   * Size the host to the scaled document.
   *
   * A transform does not affect layout, so without this the host would keep the
   * document's full unscaled footprint and leave a band of empty space below
   * and beside a shrunken page.
   */
  private applyScale(scale: number): void {
    const host = this.host()?.nativeElement;
    const body = this.shadow?.querySelector<HTMLElement>('.docx-render');
    if (!host || !body) {
      return;
    }
    const width = this.contentWidth();
    const height = this.contentHeight();
    body.style.transform = scale === 1 ? '' : `scale(${scale})`;
    host.style.width = width ? `${Math.ceil(width * scale)}px` : '';
    host.style.height = height ? `${Math.ceil(height * scale)}px` : '';
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
    const overrides = document.createElement('style');
    overrides.textContent = OVERRIDES;
    const body = document.createElement('div');
    body.className = 'docx-render';
    // Order matters: the overrides have to follow the library's own sheet, and
    // docx-preview fills `styles` in place rather than appending to the root.
    this.shadow.replaceChildren(styles, overrides, body);
    return { body, styles };
  }

  private clearShadow(): void {
    this.shadow?.replaceChildren();
    const host = this.host()?.nativeElement;
    if (host) {
      host.style.width = '';
      host.style.height = '';
    }
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

/**
 * Grow each page to cover whatever hangs off it.
 *
 * A table with more columns than the text column can hold is the ordinary shape
 * of an exported report, and it gets drawn past the edge of the paper.
 * docx-preview's answer is to clip it, which loses the content outright.
 * Simply letting it draw is not enough either: it ends up stranded on the
 * workspace behind the page, where a table cell with no fill of its own has
 * nothing to be read against.
 *
 * So the sheet is widened by exactly as much as overflows it, and its right
 * padding by the same amount. Adding both leaves the content box the size it
 * already was, so not one word moves or re-wraps — the paper grows to hold what
 * was always there. Written as `calc()` over the values docx-preview set rather
 * than as recomputed pixels, because the page width is the one measurement in
 * here that decides where every line breaks, and it should survive this
 * untouched rather than approximately.
 */
function extendPages(body: HTMLElement): void {
  for (const section of body.querySelectorAll<HTMLElement>('section.docx')) {
    const overflow = section.scrollWidth - section.clientWidth;
    // No width of its own means the caller asked for `ignoreWidth`, and there
    // is no page to extend.
    if (overflow <= 0 || !section.style.width) {
      continue;
    }
    const padding = section.style.paddingRight || '0px';
    section.style.width = `calc(${section.style.width} + ${overflow}px)`;
    section.style.paddingRight = `calc(${padding} + ${overflow}px)`;
  }
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
