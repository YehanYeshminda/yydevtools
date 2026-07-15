import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export type EncodeChoice = 'server' | 'browser';

export interface EncodeChoiceData {
  fileName: string;
  sizeLabel: string;
  thresholdLabel: string;
}

@Component({
  selector: 'app-encode-choice-dialog',
  imports: [MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Large file</h2>
    <mat-dialog-content>
      <p>
        <strong>{{ data.fileName }}</strong> is {{ data.sizeLabel }}, which is above the
        {{ data.thresholdLabel }} in-browser limit.
      </p>
      <p class="choice-help">
        Process it on the server or in your browser? The server is faster for large files;
        browser processing keeps the file on your device but may be slower.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancel</button>
      <button matButton [mat-dialog-close]="'browser'">Use browser</button>
      <button matButton="filled" [mat-dialog-close]="'server'" cdkFocusInitial>Use server</button>
    </mat-dialog-actions>
  `,
  styles: `
    .choice-help {
      color: var(--mat-sys-on-surface-variant);
      margin-bottom: 0;
    }
  `,
})
export class EncodeChoiceDialog {
  protected readonly data = inject<EncodeChoiceData>(MAT_DIALOG_DATA);
}
