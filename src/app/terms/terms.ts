import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Terms of Use. Same single-column document layout as the privacy policy. */
@Component({
  selector: 'app-terms',
  imports: [RouterLink],
  templateUrl: './terms.html',
  styleUrl: '../privacy/privacy.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Terms {}
