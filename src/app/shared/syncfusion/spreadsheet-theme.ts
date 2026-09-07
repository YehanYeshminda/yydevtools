import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * Carries the Syncfusion Spreadsheet stylesheet, unencapsulated, around
 * whatever is projected into it.
 *
 * This exists because of a specific trap. Angular's default Emulated
 * encapsulation rewrites every selector in a component's resolved stylesheet
 * — `@import`ed content included — so that *each element in the chain* must
 * carry that component's `_ngcontent-*` attribute. Angular only stamps that
 * attribute onto elements written in a template. Syncfusion builds its entire
 * grid at runtime with `createElement`, so none of those cells, rows or
 * headers ever get it, and virtually none of the spreadsheet's own CSS
 * reached its own DOM: `.e-cell[_ngcontent-x]` matches nothing.
 *
 * The symptom was subtle rather than obviously broken — the grid drew, but
 * its cells inherited the site's 14px/21px Inter from the global stylesheet
 * while its rows kept Syncfusion's inline 20px height. Row headers drifted
 * three pixels out of step with their own rows on every row, and any cell
 * whose text overflowed wrapped to double height instead of clipping the way
 * a spreadsheet should.
 *
 * Keeping the import here rather than in `angular.json`'s global `styles`
 * preserves what the encapsulated version was worth having: the CSS is part
 * of this component's chunk, so it is downloaded and injected only once
 * something actually renders a spreadsheet, not on every page of the site.
 */
@Component({
  selector: 'app-spreadsheet-theme',
  template: '<ng-content />',
  styleUrl: './spreadsheet-theme.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpreadsheetTheme {}
