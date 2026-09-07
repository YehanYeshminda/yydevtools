import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * Carries the Syncfusion Document Editor stylesheet, unencapsulated, around
 * whatever is projected into it.
 *
 * Same reasoning as SpreadsheetTheme, which documents the trap in full:
 * Angular's Emulated encapsulation requires its `_ngcontent-*` attribute on
 * every element in a selector chain, and Syncfusion builds its DOM at runtime,
 * so a scoped copy of this stylesheet matches almost nothing it styles.
 *
 * The Document Editor hid the problem better than the Spreadsheet did, because
 * it paints the document itself onto a canvas — only its surrounding chrome is
 * DOM. The visible symptom was the status bar that would not go away by CSS,
 * which is why hiding it used to need an imperative `!important` on the
 * element, on a timer.
 */
@Component({
  selector: 'app-document-editor-theme',
  template: '<ng-content />',
  styleUrl: './document-editor-theme.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentEditorTheme {}
