import { ChangeDetectionStrategy, Component } from '@angular/core';

import { AdSlot } from '../shared/ad-slot/ad-slot';
import { NewsFeed } from '../shared/news-feed/news-feed';

/**
 * The dedicated news page. Its intro is static, so the prerendered HTML carries
 * real content for crawlers; the live headlines are filled in by {@link NewsFeed}
 * after hydration from the Worker's cached /api/news feed.
 */
@Component({
  selector: 'app-news',
  imports: [NewsFeed, AdSlot],
  templateUrl: './news.html',
  styleUrl: './news.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class News {}
