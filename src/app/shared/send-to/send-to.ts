import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';

import { SEND_TARGETS, sendFragment, type SendTarget } from '../../core/send-to';

/**
 * "Send to" — hands this tool's text to another tool, already loaded.
 *
 * Unlike the share link next to it, this does navigate, and that is fine: the
 * state travels in the fragment, which browsers never transmit, so moving
 * between tools puts nothing on a wire. It does enter browser history, which
 * is the one difference worth knowing and the reason the share button still
 * copies rather than navigating.
 *
 * The host passes the text, so each tool decides what "its output" means
 * without this component knowing anything about any of them.
 */
@Component({
  selector: 'app-send-to',
  imports: [MatButtonModule, MatMenuModule, NgIcon],
  template: `
    <button matButton [disabled]="!text()" [matMenuTriggerFor]="menu" [attr.title]="hint()">
      <ng-icon name="matSendOutline" />
      Send to
    </button>
    <mat-menu #menu>
      @for (target of targets(); track target.slug) {
        <button mat-menu-item (click)="send(target)">{{ target.label }}</button>
      }
    </mat-menu>
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
export class SendTo {
  private readonly router = inject(Router);

  /** The text to hand over. Empty disables the button. */
  readonly text = input.required<string>();
  /** This tool's slug, so it is not offered as a destination for itself. */
  readonly from = input.required<string>();

  protected readonly targets = computed(() =>
    SEND_TARGETS.filter((target) => target.slug !== this.from()),
  );

  protected readonly hint = computed(() =>
    this.text()
      ? 'Opens another tool with this text already in it. It travels in the part of the URL browsers never send to a server.'
      : 'Enter something first, then this can hand it to another tool.',
  );

  protected send(target: SendTarget): void {
    const fragment = sendFragment(target, this.text());
    if (fragment) {
      void this.router.navigate(['/tools', target.slug], { fragment });
    }
  }
}
