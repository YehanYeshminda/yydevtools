import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { ClipboardService } from '../../core/clipboard.service';
import type { ToolState } from '../../core/tool-state';

/**
 * The "Copy link" button for a tool whose state can be shared.
 *
 * It is always rendered, including before there is anything to share, because a
 * control that only materialises once you have already done the work is a
 * control nobody discovers. Disabled states carry the reason.
 *
 * The button copies rather than navigating: pressing it must not rewrite the
 * address bar, because that would put whatever was typed into browser history
 * and into the next screen-share.
 */
@Component({
  selector: 'app-share-link',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <button
      matButton
      [disabled]="!link()"
      [attr.title]="hint()"
      (click)="copy()"
    >
      <mat-icon>link</mat-icon>
      Copy link
    </button>
  `,
  styles: [
    `
      :host {
        display: contents;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareLink {
  private readonly clipboard = inject(ClipboardService);

  readonly state = input.required<ToolState>();

  protected readonly link = computed(() => this.state().link());

  protected readonly hint = computed(() => {
    if (this.link()) {
      return 'Copies a link that reopens this tool with what you have entered. The state travels in the part of the URL that browsers never send to a server.';
    }
    if (this.state().tooLarge()) {
      return 'There is too much here to fit in a link. Your work is still kept if you reload this tab.';
    }
    return 'Enter something first, then this will copy a link that reproduces it.';
  });

  protected copy(): void {
    const link = this.link();
    if (link) {
      void this.clipboard.copy(link, { message: 'Link copied — it reopens this tool as it is now' });
    }
  }
}
