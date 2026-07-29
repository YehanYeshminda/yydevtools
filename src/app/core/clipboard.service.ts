import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * The one place tools copy to the clipboard. Every tool used to inline
 * `navigator.clipboard.writeText` plus its own snackbar, and only Base64
 * bothered to handle the failure case (a blocked or over-full clipboard). This
 * centralises the write, the confirmation and that failure handling so the
 * behaviour is identical everywhere.
 *
 * `duration`/`panelClass` mirror the values the tools already used, so the
 * migration is behaviour-preserving.
 */
@Injectable({ providedIn: 'root' })
export class ClipboardService {
  private readonly snackBar = inject(MatSnackBar);

  /**
   * Copy `text` and confirm with a snackbar. Empty input is a no-op that
   * resolves to `false`. Returns whether the write succeeded.
   *
   * The confirmation reads "Copied to clipboard" by default; pass `label` for
   * "<label> copied to clipboard", or `message` to set it outright. `label`
   * and `message` are ignored when there is nothing to copy.
   */
  async copy(
    text: string,
    options: { label?: string; message?: string; errorMessage?: string } = {},
  ): Promise<boolean> {
    if (!text) {
      return false;
    }
    try {
      await navigator.clipboard.writeText(text);
      const message =
        options.message ??
        (options.label ? `${options.label} copied to clipboard` : 'Copied to clipboard');
      this.snackBar.open(message, undefined, { duration: 2000 });
      return true;
    } catch {
      this.snackBar.open(
        options.errorMessage ?? 'Could not copy to the clipboard.',
        'Dismiss',
        { duration: 5000, panelClass: 'snack-error' },
      );
      return false;
    }
  }
}
