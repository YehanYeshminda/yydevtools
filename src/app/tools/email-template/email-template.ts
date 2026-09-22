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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { downloadBytes, downloadText } from '../../core/download';
import { syncToolState } from '../../core/tool-state';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { SendTo } from '../../shared/send-to/send-to';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { TryExample } from '../../shared/try-example/try-example';
import { convert } from '../case-converter/case';
import { parseColor } from '../color-converter/color';
import { DOCX_MEDIA_TYPE, renderDocx } from './docx';
import { draftToText, parseDraft } from './draft';
import { DEFAULT_ACCENT, LOOKS, LOOK_OPTIONS, renderEmail, type Look } from './email-html';
import { EML_MEDIA_TYPE, renderEml } from './eml';
import { renderRtf } from './rtf';

/** How long typing must pause before the draft is re-read and re-rendered. */
const RENDER_DEBOUNCE = 250;

/** What the preview is pinned to. Mobile is the narrow end of real phones. */
const PREVIEW_WIDTHS = { desktop: '100%', mobile: '375px' } as const;
type PreviewWidth = keyof typeof PREVIEW_WIDTHS;

/** Exercises every piece the tool can find: subject, greeting, list, link, sign-off. */
const SAMPLE = [
  'Subject: Your September invoice',
  '',
  'Hi Ada,',
  '',
  // Deliberately not hard-wrapped: a single newline is a line break, which is
  // what keeps "Thanks," above a name — and would break this mid-sentence.
  'Thanks for another month. The September invoice is ready, and two changes are worth flagging:',
  '',
  '- The new per-seat rate starts on 1 October.',
  '- Payment terms move to 14 days from the same date.',
  '',
  '[View your invoice](https://example.com/invoices/2026-09)',
  '',
  'If anything looks wrong, reply to this message and I will sort it out.',
  '',
  'Thanks,',
  'Grace Hopper',
].join('\n');

@Component({
  selector: 'app-email-template',
  imports: [
    ToolPage,
    ToolContent,
    CodeEditor,
    SendTo,
    ShareLink,
    TryExample,
    MatButtonModule,
    MatCheckboxModule,
    NgIcon,
  ],
  templateUrl: './email-template.html',
  styleUrls: ['../tool-shell.css', './email-template.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmailTemplateTool {
  private readonly clipboard = inject(ClipboardService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly frameHost = viewChild<ElementRef<HTMLElement>>('frame');

  protected readonly looks = LOOK_OPTIONS;

  protected readonly source = signal(SAMPLE);
  protected readonly look = signal<Look>('plain');
  protected readonly accent = signal(DEFAULT_ACCENT);
  /** On, the text's shape is read. Off, blank lines separate paragraphs and nothing else. */
  protected readonly infer = signal(true);
  protected readonly width = signal<PreviewWidth>('desktop');

  /**
   * The text as it was when typing last paused.
   *
   * Everything downstream reads this rather than `source`, so a keystroke costs
   * one signal write and nothing else: no lexing, no four renderers, no tearing
   * the preview frame down and building it again.
   */
  private readonly settled = signal(SAMPLE);

  protected readonly draft = computed(() =>
    parseDraft(this.settled(), { infer: this.infer() }),
  );

  protected readonly html = computed(() =>
    renderEmail(this.draft(), {
      look: this.look(),
      accent: this.accent(),
      subject: this.draft().subject,
    }),
  );

  protected readonly subject = computed(() => this.draft().subject);
  protected readonly hasText = computed(() => this.source().trim() !== '');
  protected readonly widthValue = computed(() => PREVIEW_WIDTHS[this.width()]);
  protected readonly lookHint = computed(
    () => this.looks.find((option) => option.id === this.look())?.hint ?? '',
  );

  protected readonly shared = syncToolState({
    key: 'email-template',
    snapshot: () => ({
      source: this.source(),
      look: this.look(),
      accent: this.accent(),
      infer: this.infer(),
    }),
    restore: (state) => {
      // A link is untrusted input, so each value is checked rather than spread.
      if (typeof state.source === 'string') {
        this.source.set(state.source);
        this.settled.set(state.source);
      }
      if (typeof state.look === 'string' && (LOOKS as readonly string[]).includes(state.look)) {
        this.look.set(state.look as Look);
      }
      if (typeof state.accent === 'string' && parseColor(state.accent)) {
        this.accent.set(state.accent);
      }
      if (typeof state.infer === 'boolean') {
        this.infer.set(state.infer);
      }
    },
  });

  constructor() {
    effect((onCleanup) => {
      const text = this.source();
      const timer = setTimeout(() => this.settled.set(text), RENDER_DEBOUNCE);
      onCleanup(() => clearTimeout(timer));
    });

    // The preview frame is built by hand rather than bound in the template:
    // `sandbox` cannot be bound (NG0910), because changing it on a live frame
    // would be a way out of the sandbox, and `srcdoc` set as a property skips
    // Angular's sanitizer — which would otherwise strip the very markup being
    // previewed. A raw element absent from the prerender also never trips the
    // hydration walker. The sandbox is empty: an email has no scripts, so the
    // frame is given no permissions at all.
    effect(() => {
      const html = this.html();
      if (!this.isBrowser) {
        return;
      }
      const host = this.frameHost()?.nativeElement;
      if (!host) {
        return;
      }
      const iframe = document.createElement('iframe');
      iframe.title = 'Email preview';
      iframe.setAttribute('sandbox', '');
      // The width reads an inherited custom property, so switching between
      // desktop and mobile restyles this frame instead of reloading it.
      iframe.style.cssText =
        'display:block;width:var(--preview-w,100%);max-width:100%;height:100%;' +
        'margin-inline:auto;border:0;background:#ffffff;';
      iframe.srcdoc = html;
      host.replaceChildren(iframe);
    });
  }

  protected setLook(look: Look): void {
    this.look.set(look);
  }

  protected setWidth(width: PreviewWidth): void {
    this.width.set(width);
  }

  protected onAccent(event: Event): void {
    this.accent.set((event.target as HTMLInputElement).value);
  }

  protected setInfer(checked: boolean): void {
    this.infer.set(checked);
  }

  protected loadExample(): void {
    this.source.set(SAMPLE);
    this.settled.set(SAMPLE);
  }

  protected clear(): void {
    this.source.set('');
    this.settled.set('');
  }

  protected copyHtml(): void {
    void this.clipboard.copy(this.html(), { label: 'Email HTML' });
  }

  protected downloadHtml(): void {
    downloadText(this.html(), `${this.fileStem()}.html`, 'text/html');
  }

  protected downloadEml(): void {
    downloadText(
      renderEml({
        subject: this.subject(),
        html: this.html(),
        text: draftToText(this.draft()),
      }),
      `${this.fileStem()}.eml`,
      EML_MEDIA_TYPE,
    );
  }

  protected async downloadDocx(): Promise<void> {
    downloadBytes(await renderDocx(this.draft()), `${this.fileStem()}.docx`, DOCX_MEDIA_TYPE);
  }

  protected downloadRtf(): void {
    // application/rtf rather than text/rtf: it is what Word registers itself
    // for, and what makes a browser offer to open rather than to display.
    downloadText(renderRtf(this.draft()), `${this.fileStem()}.rtf`, 'application/rtf');
  }

  /** The subject as a file name, so a folder of these is readable. */
  private fileStem(): string {
    const subject = this.subject();
    const slug = subject ? convert(subject, 'slug') : '';
    return slug === '' ? 'email' : slug.slice(0, 60);
  }
}
