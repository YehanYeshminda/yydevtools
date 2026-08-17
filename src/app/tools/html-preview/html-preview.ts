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

import { downloadText } from '../../core/download';
import { syncToolState } from '../../core/tool-state';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { TryExample } from '../../shared/try-example/try-example';

/** How long typing must pause before the preview reloads, in milliseconds. */
const RENDER_DEBOUNCE = 250;

/**
 * "Try an example": a self-contained document that exercises the whole tool —
 * HTML structure and inline CSS always render; the little counter button only
 * works once "Run scripts" is on, which the example turns on so it works right
 * away. Written with no backticks or `${}` so it survives being a template
 * literal here.
 */
const STARTER = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        font-family: system-ui, -apple-system, sans-serif;
        margin: 0;
        padding: 2rem;
        background: #0f172a;
        color: #e2e8f0;
      }
      .card {
        max-width: 26rem;
        margin: 2rem auto;
        padding: 1.5rem;
        border-radius: 16px;
        background: linear-gradient(135deg, #1e293b, #334155);
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
      }
      h1 {
        margin: 0 0 0.5rem;
        font-size: 1.4rem;
      }
      p {
        margin: 0 0 1rem;
        color: #94a3b8;
        line-height: 1.5;
      }
      button {
        font: inherit;
        padding: 0.6rem 1rem;
        border: 0;
        border-radius: 10px;
        background: #38bdf8;
        color: #0f172a;
        font-weight: 600;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Hello from your browser 👋</h1>
      <p>Edit the HTML on the left — this preview updates as you type. Turn on "Run scripts" to make the button work.</p>
      <button id="go">Clicked 0 times</button>
    </div>
    <script>
      var n = 0;
      var btn = document.getElementById('go');
      btn.addEventListener('click', function () {
        n++;
        btn.textContent = 'Clicked ' + n + (n === 1 ? ' time' : ' times');
      });
    </script>
  </body>
</html>
`;

@Component({
  selector: 'app-html-preview',
  imports: [ToolPage, ToolContent, CodeEditor, ShareLink, TryExample, MatButtonModule, NgIcon],
  templateUrl: './html-preview.html',
  styleUrls: ['../tool-shell.css', './html-preview.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HtmlPreviewTool {
  protected readonly source = signal('');
  /** Whether the preview is allowed to run the page's own JavaScript. */
  protected readonly runScripts = signal(false);

  private readonly frameHost = viewChild<ElementRef<HTMLElement>>('frameHost');

  /**
   * The markup and the scripts switch — everything needed to reopen the same
   * preview from a shared link. The HTML travels in the URL fragment, which is
   * never sent to a server.
   */
  protected readonly shared = syncToolState({
    key: 'html-preview',
    snapshot: () => ({ source: this.source(), runScripts: this.runScripts() }),
    restore: (state) => {
      if (typeof state.source === 'string') {
        this.source.set(state.source);
      }
      if (typeof state.runScripts === 'boolean') {
        this.runScripts.set(state.runScripts);
      }
    },
  });

  protected readonly hasSource = computed(() => this.source().trim().length > 0);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** True once the first document has been rendered, so later edits can debounce. */
  private painted = false;

  constructor() {
    // Build the preview by replacing a fresh <iframe> inside the host on every
    // change. It is created imperatively, in the browser only:
    //  - `sandbox` must be fixed at creation — Angular blocks binding it (NG0910)
    //    because changing it on a live frame is a sandbox-escape vector. Scripts
    //    off means a fully restrictive `sandbox=""`; on adds only `allow-scripts`
    //    and never `allow-same-origin`, so the frame keeps a null origin and
    //    cannot reach this page, its cookies or its storage.
    //  - `srcdoc` is set as a property, so the markup skips Angular's HTML
    //    sanitizer, which would otherwise strip the very thing being previewed.
    //  - a raw element, absent from the prerendered HTML, never trips the
    //    hydration walker (NG0500). Effects do not run during prerender.
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
        iframe.style.cssText = 'flex:1 1 auto; width:100%; height:100%; border:0; background:#fff;';
        iframe.srcdoc = html;
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
  }

  protected toggleScripts(): void {
    this.runScripts.update((value) => !value);
  }

  protected loadExample(): void {
    this.source.set(STARTER);
    this.runScripts.set(true);
  }

  protected clear(): void {
    this.source.set('');
  }

  protected download(): void {
    downloadText(this.source(), 'page.html', 'text/html');
  }
}
