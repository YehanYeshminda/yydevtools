import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TOOLS } from '../tools/tools.data';

@Component({
  selector: 'app-about',
  imports: [RouterLink],
  templateUrl: './about.html',
  styleUrl: './about.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class About {
  protected readonly readyCount = TOOLS.filter((tool) => tool.ready).length;
  protected readonly totalCount = TOOLS.length;
}
