import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { StructuredDataService } from '../core/structured-data.service';
import { GUIDES } from './guides.data';

/**
 * The Guides index: a directory of the long-form articles. Pure prerendered
 * content — the list comes straight from {@link GUIDES}, and the same data emits
 * the page's CollectionPage/ItemList structured data.
 */
@Component({
  selector: 'app-guides',
  imports: [RouterLink],
  templateUrl: './guides.html',
  styleUrl: './guides.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Guides implements OnInit, OnDestroy {
  private readonly structuredData = inject(StructuredDataService);

  protected readonly guides = GUIDES;

  ngOnInit(): void {
    this.structuredData.setGuidesIndex(GUIDES);
  }

  ngOnDestroy(): void {
    this.structuredData.clear();
  }
}
