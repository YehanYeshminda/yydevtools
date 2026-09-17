import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

export interface ConfirmData {
  title: string;
  /** What is about to be lost, in the reader's terms rather than the code's. */
  message: string;
  /** The button that goes through with it. Name the action, never "OK". */
  confirmLabel: string;
  cancelLabel?: string;
}

/**
 * The id the message carries, so the dialog can point `aria-describedby` at it.
 *
 * Fixed rather than generated because only one of these is ever open: the
 * dialog is modal, and the second one could not be reached to read anyway.
 */
const MESSAGE_ID = 'confirm-dialog-message';

/**
 * The site's one confirmation.
 *
 * Material rather than `confirm()`, which is what this replaced: the native one
 * is chrome, not the page — it announces the origin ("localhost:4322 says"),
 * takes the browser's styling rather than the site's, and offers OK and Cancel
 * whatever the question was. This says what the buttons do.
 *
 * `alertdialog` rather than `dialog`, because it interrupts to ask about
 * something the reader is in the middle of. Cancel is what focus lands on and
 * what Enter takes, so the destructive answer is never the reflex.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 class="confirm__title" mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="confirm__message" id="confirm-dialog-message">{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions class="confirm__actions">
      <button matButton mat-dialog-close cdkFocusInitial>
        {{ data.cancelLabel ?? 'Keep going' }}
      </button>
      <button matButton="filled" [mat-dialog-close]="true">{{ data.confirmLabel }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .confirm__message {
      margin: 0;
      color: var(--on-var);
    }

    .confirm__actions {
      justify-content: flex-end;
      gap: 0.5rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
}

/**
 * Asks, and resolves to whether the reader went through with it.
 *
 * A plain function rather than a service: it is one `open` call with the
 * arguments that make it a confirmation rather than a panel, and wrapping that
 * in an injectable would add a layer without adding a decision.
 */
export function askToConfirm(dialog: MatDialog, data: ConfirmData): Promise<boolean> {
  const ref = dialog.open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, {
    data,
    role: 'alertdialog',
    ariaDescribedBy: MESSAGE_ID,
    // Narrow enough to read in one line of sight, and never wider than a phone.
    width: 'min(26rem, calc(100vw - 2rem))',
  });
  return firstValueFrom(ref.afterClosed()).then((answer) => answer === true);
}
