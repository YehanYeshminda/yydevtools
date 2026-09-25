import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { NgIcon } from '@ng-icons/core';

import { FileHandoff } from '../../core/file-handoff';
import { openTargets } from '../../core/open-in';
import { ReturnTrip, fromFragment } from '../../core/return-trip';

/**
 * "Open in" — the file counterpart of Send to. Hands a finished file to another
 * tool, which loads it as though it had been dropped there.
 *
 * The file goes through FileHandoff, in memory, for one navigation: nothing is
 * uploaded and nothing is stored. The menu lists only tools that take the
 * file's type, the viewer for it first.
 */
@Component({
  selector: 'app-open-in',
  imports: [MatButtonModule, MatMenuModule, NgIcon],
  template: `
    <button
      matButton
      [disabled]="!bytes()?.length"
      [matMenuTriggerFor]="menu"
      [attr.title]="bytes()?.length ? hint : 'Decode something first.'"
    >
      <ng-icon name="matOpenInNewOutline" />
      Open in
    </button>
    <mat-menu #menu class="menu--long">
      @for (target of targets(); track target.slug) {
        <button mat-menu-item (click)="open(target.slug)">{{ target.name }}</button>
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
export class OpenIn {
  private readonly handoff = inject(FileHandoff);
  private readonly trip = inject(ReturnTrip);

  /** The file's contents. Null or empty disables the button. */
  readonly bytes = input.required<Uint8Array | null>();
  readonly name = input.required<string>();
  readonly mime = input.required<string>();
  /** This tool's slug, so it is not offered as a destination for itself. */
  readonly from = input.required<string>();
  /**
   * Set when this file is the tool's whole state (the Image Viewer), so Back
   * hands it to the tool again. Tools with text state come back from storage.
   */
  readonly bringBack = input(false, { transform: booleanAttribute });

  protected readonly hint =
    'Opens this file in another tool. It is passed along inside your browser — nothing is uploaded.';

  protected readonly targets = computed(() =>
    openTargets(this.name(), this.mime()).filter((tool) => tool.slug !== this.from()),
  );

  protected open(slug: string): void {
    const bytes = this.bytes();
    if (bytes?.length) {
      const file = new File([bytes.slice()], this.name(), { type: this.mime() });
      this.trip.leave(this.from(), this.bringBack() ? file : null);
      this.handoff.sendFile(file, slug, fromFragment(this.from()));
    }
  }
}
