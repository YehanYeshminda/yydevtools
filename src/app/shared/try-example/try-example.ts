import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

/**
 * The "Try an example" button shown by tools whose input starts empty.
 *
 * A first-time visitor landing on a blank textarea has to invent input before
 * the tool shows them anything; one click here drops in a realistic sample so
 * the tool demonstrates itself. Each tool owns its sample — it lives next to
 * the component that uses it, like the tool's copy does — and this component is
 * only the consistent, recognisable trigger.
 *
 * Shaped like ShareLink: a plain Material button and `display: contents`, so it
 * sits in a tool's existing `.actions` row indistinguishably from the buttons
 * around it. Deliberately stateless — the tool decides what "an example" means
 * (several fill more than one field).
 */
@Component({
  selector: 'app-try-example',
  imports: [MatButtonModule, NgIcon],
  template: `
    <button matButton type="button" (click)="loadExample.emit()">
      <ng-icon aria-hidden="true" name="matAutoFixHighOutline" />
      {{ label() }}
    </button>
  `,
  styles: ':host { display: contents; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TryExample {
  /** Override when "an example" reads oddly, e.g. "Try a sample token". */
  readonly label = input('Try an example');

  /** The tool fills its input(s) with a realistic sample. */
  readonly loadExample = output<void>();
}
