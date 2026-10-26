import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { TryExample } from '../../shared/try-example/try-example';
import { buildLink } from './hyperlink';

/** The secondary formats, each named for where it gets pasted. */
interface Format {
  key: 'markdown' | 'html' | 'plain';
  label: string;
  where: string;
}

const FORMATS: readonly Format[] = [
  { key: 'plain', label: 'Plain message', where: 'WhatsApp, SMS, Telegram and anything without links' },
  { key: 'markdown', label: 'Markdown', where: 'GitHub, Reddit, Notion and other Markdown editors' },
  { key: 'html', label: 'HTML', where: 'a web page or an email template' },
];

@Component({
  selector: 'app-hyperlink-generator',
  imports: [ToolPage, ToolContent, TryExample, MatButtonModule, NgIcon],
  templateUrl: './hyperlink-generator.html',
  styleUrls: ['../tool-shell.css', './hyperlink-generator.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HyperlinkGeneratorTool {
  private readonly clipboard = inject(ClipboardService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly formats = FORMATS;
  protected readonly url = signal('');
  protected readonly text = signal('');

  /**
   * Kept across a reload, but not offered as a share link: on this page a
   * second "Copy link" button beside "Copy clickable link" would be read as the
   * same thing, and the link people want to send is the one they typed.
   */
  protected readonly state = syncToolState({
    key: 'hyperlink-generator',
    shareable: false,
    snapshot: () => ({ url: this.url(), text: this.text() }),
    restore: (state) => {
      if (typeof state.url === 'string') this.url.set(state.url);
      if (typeof state.text === 'string') this.text.set(state.text);
    },
  });

  protected readonly link = computed(() => buildLink(this.url(), this.text()));
  protected readonly outputs = computed(() => {
    const link = this.link();
    return link.ok ? { markdown: link.markdown, html: link.html, plain: link.plain } : null;
  });

  /** The error, but only once there is something to complain about. */
  protected readonly error = computed(() => {
    const link = this.link();
    return this.url().trim() && !link.ok ? link.error : null;
  });

  /** Known only in the browser, so it is set after the first render to keep hydration identical. */
  protected readonly canShare = signal(false);

  constructor() {
    afterNextRender(() => this.canShare.set(typeof navigator.share === 'function'));
  }

  protected onUrl(event: Event): void {
    this.url.set((event.target as HTMLInputElement).value);
  }

  protected onText(event: Event): void {
    this.text.set((event.target as HTMLInputElement).value);
  }

  protected copyRich(): void {
    const link = this.link();
    if (link.ok) void this.clipboard.copyRich(link.html, link.plain, { label: 'Clickable link' });
  }

  protected copyFormat(format: Format): void {
    const link = this.link();
    if (link.ok) void this.clipboard.copy(link[format.key], { label: format.label });
  }

  protected async share(): Promise<void> {
    const link = this.link();
    if (!link.ok) return;
    try {
      await navigator.share(this.text().trim() ? { title: link.label, text: link.label, url: link.href } : { url: link.href });
    } catch (error) {
      // Closing the share sheet is a choice, not a failure.
      if ((error as DOMException)?.name !== 'AbortError') {
        this.snackBar.open('Could not open the share sheet. Copy the link instead.', 'Dismiss', {
          duration: 5000,
          panelClass: 'snack-error',
        });
      }
    }
  }

  protected clear(): void {
    this.url.set('');
    this.text.set('');
  }

  protected loadExample(): void {
    this.url.set('example.com/invoices/2026-10');
    this.text.set("Here's the October invoice");
  }
}
