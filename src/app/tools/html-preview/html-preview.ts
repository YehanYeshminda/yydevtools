import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import type { Plugin } from 'prettier';

import { downloadText } from '../../core/download';
import { syncToolState } from '../../core/tool-state';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import {
  CONSOLE_MESSAGE_SOURCE,
  injectConsoleBridge,
  isLogLevel,
  type LogLevel,
} from './console-bridge';
import { EXAMPLES, type ExampleId } from './examples';

/** How long typing must pause before the preview reloads, in milliseconds. */
const RENDER_DEBOUNCE = 250;

/** The device widths the preview can be pinned to, in CSS pixels. */
const PREVIEW_WIDTHS = {
  phone: '390px',
  tablet: '768px',
  full: '100%',
} as const;
type PreviewWidth = keyof typeof PREVIEW_WIDTHS;

/** A single captured line from the preview's console. */
interface ConsoleEntry {
  id: number;
  level: LogLevel;
  text: string;
}

/** The most recent console lines kept, so a chatty page cannot grow unbounded. */
const MAX_LOG_ENTRIES = 200;

/**
 * A structural issue found in the markup — an unterminated tag, a stray token —
 * that a browser recovers from silently but the author probably did not intend.
 */
interface Problem {
  message: string;
  line?: number;
  column?: number;
}

/** How long typing must pause before the markup is re-checked, in milliseconds. */
const VALIDATE_DEBOUNCE = 450;

@Component({
  selector: 'app-html-preview',
  imports: [ToolPage, ToolContent, CodeEditor, ShareLink, MatButtonModule, NgIcon],
  templateUrl: './html-preview.html',
  styleUrls: ['../tool-shell.css', './html-preview.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HtmlPreviewTool {
  protected readonly source = signal('');
  /** Whether the preview is allowed to run the page's own JavaScript. */
  protected readonly runScripts = signal(false);
  /** Soft-wrap long lines in the source editor. */
  protected readonly wrapSource = signal(true);
  /** Which device width the rendered page is pinned to. */
  protected readonly width = signal<PreviewWidth>('full');
  /** Preview the page on a dark backdrop instead of white. */
  protected readonly dark = signal(false);
  /** The preview pane is blown up to fill the whole viewport. */
  protected readonly expanded = signal(false);

  protected readonly examples = EXAMPLES;

  /** Console output and uncaught errors captured from the previewed page. */
  protected readonly logs = signal<ConsoleEntry[]>([]);
  /** Whether the console panel is expanded. */
  protected readonly consoleOpen = signal(false);
  protected readonly errorCount = computed(
    () => this.logs().filter((entry) => entry.level === 'error').length,
  );

  private readonly frameHost = viewChild<ElementRef<HTMLElement>>('frameHost');

  /** The live preview frame, so incoming messages can be checked against it. */
  private currentFrame: HTMLIFrameElement | null = null;
  private logSeq = 0;

  /**
   * Everything needed to reopen the same preview from a shared link — the markup
   * plus the view switches. The HTML travels in the URL fragment, which is never
   * sent to a server.
   */
  protected readonly shared = syncToolState({
    key: 'html-preview',
    snapshot: () => ({
      source: this.source(),
      runScripts: this.runScripts(),
      wrapSource: this.wrapSource(),
      width: this.width(),
      dark: this.dark(),
    }),
    restore: (state) => {
      if (typeof state.source === 'string') {
        this.source.set(state.source);
      }
      if (typeof state.runScripts === 'boolean') {
        this.runScripts.set(state.runScripts);
      }
      if (typeof state.wrapSource === 'boolean') {
        this.wrapSource.set(state.wrapSource);
      }
      if (state.width === 'phone' || state.width === 'tablet' || state.width === 'full') {
        this.width.set(state.width);
      }
      if (typeof state.dark === 'boolean') {
        this.dark.set(state.dark);
      }
    },
  });

  protected readonly hasSource = computed(() => this.source().trim().length > 0);

  /** The pinned device width as a CSS length, applied via a custom property. */
  protected readonly widthValue = computed(() => PREVIEW_WIDTHS[this.width()]);
  /** The colour behind the rendered page — matters when the HTML is transparent. */
  protected readonly backdrop = computed(() => (this.dark() ? '#0f172a' : '#ffffff'));
  /** A human-readable size for the current markup, e.g. "1.4 KB". */
  protected readonly sizeLabel = computed(() => formatBytes(byteLength(this.source())));

  /** Beautify runs Prettier on demand; surface whether it is in flight. */
  protected readonly formatting = signal(false);

  /** Structural problems in the markup, found by the passive re-check. */
  protected readonly problems = signal<Problem[]>([]);

  /** The bottom panel is shown when there is anything to report in it. */
  protected readonly showPanel = computed(
    () => this.runScripts() || this.problems().length > 0,
  );
  /** With scripts on the panel is a console; with them off it is only problems. */
  protected readonly panelTitle = computed(() => (this.runScripts() ? 'Console' : 'Problems'));

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** True once the first document has been rendered, so later edits can debounce. */
  private painted = false;

  constructor() {
    // Build the preview by replacing a fresh <iframe> inside the host on every
    // change to the markup or the scripts switch. It is created imperatively, in
    // the browser only:
    //  - `sandbox` must be fixed at creation — Angular blocks binding it (NG0910)
    //    because changing it on a live frame is a sandbox-escape vector. Scripts
    //    off means a fully restrictive `sandbox=""`; on adds only `allow-scripts`
    //    and never `allow-same-origin`, so the frame keeps a null origin and
    //    cannot reach this page, its cookies or its storage.
    //  - `srcdoc` is set as a property, so the markup skips Angular's HTML
    //    sanitizer, which would otherwise strip the very thing being previewed.
    //  - a raw element, absent from the prerendered HTML, never trips the
    //    hydration walker (NG0500). Effects do not run during prerender.
    // Width and backdrop are deliberately NOT read here: they are custom
    // properties inherited from the host (see the template), so changing them
    // restyles the live frame without tearing it down and reloading the page.
    effect((onCleanup) => {
      const html = this.source();
      const scripts = this.runScripts();
      // Effects run during prerender too, where there is no `document`; the
      // preview is a browser-only concern, so bail out on the server.
      if (!this.isBrowser) {
        return;
      }
      const host = this.frameHost()?.nativeElement;
      if (!host) {
        return;
      }
      const render = () => {
        const iframe = document.createElement('iframe');
        iframe.title = 'HTML preview';
        iframe.setAttribute('sandbox', scripts ? 'allow-scripts' : '');
        // Width and background read inherited custom properties, so the width
        // selector and the light/dark toggle reshape this frame with no reload.
        iframe.style.cssText =
          'display:block; width:var(--preview-w,100%); max-width:100%; height:100%;' +
          'margin-inline:auto; border:0; background:var(--preview-bg,#fff);';
        // With scripts on, inject the console bridge so the page's logs and
        // uncaught errors reach the panel below. With scripts off nothing runs,
        // so the markup is previewed exactly as written.
        iframe.srcdoc = scripts ? injectConsoleBridge(html) : html;
        // A fresh run starts with a clean console, and messages are only trusted
        // from this exact frame.
        this.logs.set([]);
        this.currentFrame = iframe;
        host.replaceChildren(iframe);
      };
      // First paint immediate; later edits debounced so fast typing does not tear
      // the frame down and rebuild it on every keystroke.
      if (!this.painted) {
        this.painted = true;
        render();
        return;
      }
      const timer = setTimeout(render, RENDER_DEBOUNCE);
      onCleanup(() => clearTimeout(timer));
    });

    // While the preview is full-screen, close it on Escape and stop the page
    // behind it from scrolling. Both are browser-only and undone on collapse.
    effect((onCleanup) => {
      if (!this.isBrowser || !this.expanded()) {
        return;
      }
      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          this.expanded.set(false);
        }
      };
      document.addEventListener('keydown', onKey);
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      onCleanup(() => {
        document.removeEventListener('keydown', onKey);
        document.body.style.overflow = previousOverflow;
      });
    });

    // Listen once for the console bridge's messages. This effect reads no
    // signals, so it runs a single time; its cleanup removes the listener when
    // the component is destroyed.
    effect((onCleanup) => {
      if (!this.isBrowser) {
        return;
      }
      const handler = (event: MessageEvent) => this.onFrameMessage(event);
      window.addEventListener('message', handler);
      onCleanup(() => window.removeEventListener('message', handler));
    });

    // Passively re-check the markup for structural problems as it changes,
    // debounced so it does not run on every keystroke. This is browser-only and
    // independent of the scripts switch — a malformed tag is worth flagging even
    // with scripts off, and HTML parsers recover from it silently, so nothing
    // else would surface it. The check reuses Prettier's parser (already loaded
    // for the Format button), which is why it also reports the precise line.
    effect((onCleanup) => {
      const html = this.source();
      if (!this.isBrowser) {
        return;
      }
      if (html.trim() === '') {
        this.problems.set([]);
        return;
      }
      const timer = setTimeout(() => void this.validate(html), VALIDATE_DEBOUNCE);
      onCleanup(() => clearTimeout(timer));
    });
  }

  /**
   * Parse the markup with Prettier and record the first structural problem it
   * finds, if any. Only applied when the source has not changed since the parse
   * started, so a stale result from slow typing cannot overwrite a newer one.
   */
  private async validate(html: string): Promise<void> {
    try {
      const { format, plugins } = await loadPrettierHtml();
      await format(html, { parser: 'html', plugins, tabWidth: 2 });
      if (this.source() === html) {
        this.problems.set([]);
      }
    } catch (error) {
      if (this.source() === html) {
        this.problems.set([toProblem(error)]);
      }
    }
  }

  /**
   * Record a line from the preview's console. Every message is checked twice
   * before it is trusted: it must carry the bridge's marker, and — because the
   * frame is a null origin whose messages any script could try to spoof — it
   * must have come from the exact frame currently on screen.
   */
  private onFrameMessage(event: MessageEvent): void {
    const data = event.data as { source?: unknown; level?: unknown; text?: unknown } | null;
    if (!data || data.source !== CONSOLE_MESSAGE_SOURCE) {
      return;
    }
    if (!this.currentFrame || event.source !== this.currentFrame.contentWindow) {
      return;
    }
    if (!isLogLevel(data.level)) {
      return;
    }
    const text = typeof data.text === 'string' ? data.text : '';
    const entry: ConsoleEntry = { id: this.logSeq++, level: data.level, text };
    this.logs.update((list) => {
      const next = [...list, entry];
      return next.length > MAX_LOG_ENTRIES ? next.slice(next.length - MAX_LOG_ENTRIES) : next;
    });
  }

  protected toggleScripts(): void {
    this.runScripts.update((value) => !value);
  }

  protected toggleConsole(): void {
    this.consoleOpen.update((value) => !value);
  }

  protected clearLogs(): void {
    this.logs.set([]);
  }

  protected toggleWrap(): void {
    this.wrapSource.update((value) => !value);
  }

  protected toggleDark(): void {
    this.dark.update((value) => !value);
  }

  protected setWidth(width: PreviewWidth): void {
    this.width.set(width);
  }

  protected toggleExpanded(): void {
    this.expanded.update((value) => !value);
  }

  protected loadExample(id: ExampleId): void {
    const example = EXAMPLES.find((entry) => entry.id === id);
    if (!example) {
      return;
    }
    this.source.set(example.html);
    this.runScripts.set(example.scripts);
  }

  protected clear(): void {
    this.source.set('');
    this.problems.set([]);
  }

  protected download(): void {
    downloadText(this.source(), 'page.html', 'text/html');
  }

  /**
   * Tidy the markup in place with Prettier. The engine and its HTML plugins are
   * ~1 MB but load only once (shared with the passive re-check), so nothing is
   * fetched until the markup is first checked or formatted. A failure is the
   * same kind of thing the Problems panel already shows, so it is routed there
   * and the panel is opened rather than shown as a one-off message.
   */
  protected async format(): Promise<void> {
    const source = this.source();
    if (source.trim() === '') {
      return;
    }
    this.formatting.set(true);
    try {
      const { format, plugins } = await loadPrettierHtml();
      const result = await format(source, { parser: 'html', plugins, tabWidth: 2 });
      this.source.set(result.replace(/\n$/, ''));
      this.problems.set([]);
    } catch (error) {
      this.problems.set([toProblem(error)]);
      this.consoleOpen.set(true);
    } finally {
      this.formatting.set(false);
    }
  }
}

/**
 * Load Prettier's standalone engine plus the HTML parser and the plugins for the
 * CSS and JavaScript it can embed. Memoised, so the ~1 MB of chunks is fetched
 * at most once and shared by the Format button and the passive re-check.
 */
let prettierHtml: Promise<{ format: PrettierFormat; plugins: Plugin[] }> | null = null;
function loadPrettierHtml(): Promise<{ format: PrettierFormat; plugins: Plugin[] }> {
  prettierHtml ??= Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/html'),
    import('prettier/plugins/postcss'),
    import('prettier/plugins/babel'),
    import('prettier/plugins/estree'),
  ]).then(([{ format }, html, postcss, babel, estree]) => ({
    format,
    plugins: [html, postcss, babel, estree] as unknown as Plugin[],
  }));
  return prettierHtml;
}

type PrettierFormat = (typeof import('prettier/standalone'))['format'];

/** Turn a Prettier parse error into a Problem, keeping its location. */
function toProblem(error: unknown): Problem {
  if (error instanceof Error) {
    const loc = (error as { loc?: { start?: { line?: number; column?: number } } }).loc?.start;
    // Prettier's message carries a helpful "(line:column)"; keep the first line
    // and drop the "For more info see <url>" clause some messages append, which
    // only bloats the row without adding anything actionable.
    const firstLine = error.message.split(/\r?\n/)[0].replace(/\s*For more info see \S+/, '');
    return { message: firstLine, line: loc?.line, column: loc?.column };
  }
  return { message: 'The markup could not be parsed.' };
}

/** UTF-8 byte length. `TextEncoder` exists in both the browser and prerender. */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}
