import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { ADS_ENABLED } from '../../core/consent.service';

/**
 * A reserved space for an ad unit.
 *
 * Nothing renders while `ADS_ENABLED` is false, so the site stays clean until
 * AdSense is actually wired up. The point of the component existing now is that
 * the *positions* are decided and each slot declares a fixed height — when the
 * ad script is added, the space is already reserved and the unit cannot push
 * content down, which is what would otherwise wreck the CLS score.
 *
 * To go live: add the AdSense script to index.html, flip ADS_ENABLED to true,
 * and replace the placeholder below with the `<ins class="adsbygoogle">` unit,
 * keeping the same slot heights.
 */
@Component({
  selector: 'app-ad-slot',
  template: `
    @if (enabled) {
      <aside class="ad" [class]="'ad--' + format()" aria-label="Advertisement">
        <span class="ad__label">Advertisement</span>
        <!-- AdSense <ins class="adsbygoogle"> unit goes here. -->
      </aside>
    }
  `,
  styles: `
    .ad {
      display: grid;
      place-items: center;
      width: 100%;
      margin-block: 24px;
      overflow: hidden;
      background: var(--surface-1);
      border: 1px solid var(--outline-2);
      border-radius: var(--r-card);
    }

    /* Heights are fixed so the reserved box matches the unit that fills it. */
    .ad--leaderboard {
      min-height: 90px;
    }

    .ad--rectangle {
      min-height: 250px;
    }

    .ad__label {
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--on-var);
    }

    @media (max-width: 728px) {
      .ad--leaderboard {
        min-height: 100px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdSlot {
  /** Chooses the reserved height. */
  readonly format = input<'leaderboard' | 'rectangle'>('leaderboard');

  protected readonly enabled = ADS_ENABLED;
}
