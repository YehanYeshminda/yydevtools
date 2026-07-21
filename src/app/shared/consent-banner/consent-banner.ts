import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ConsentService } from '../../core/consent.service';

/**
 * GDPR/UK-GDPR consent prompt for advertising cookies. Rendered only in the
 * browser (the service decides after hydration), so it never appears in the
 * prerendered HTML a crawler sees.
 *
 * If you would rather let Google collect consent, turn on a Google-certified
 * CMP message in the AdSense dashboard and remove this component — do not run
 * both.
 */
@Component({
  selector: 'app-consent-banner',
  imports: [RouterLink],
  template: `
    @if (consent.needsDecision()) {
      <div
        class="cb"
        role="dialog"
        aria-modal="false"
        aria-labelledby="cb-title"
        aria-describedby="cb-text"
      >
        <div class="cb__body">
          <h2 id="cb-title" class="cb__title">Cookies for advertising</h2>
          <p id="cb-text" class="cb__text">
            This site is free because it shows ads. With your consent, Google and its
            partners may use cookies to personalise them. The tools themselves always work
            either way, and nothing you put into a tool is ever shared.
            <a class="cb__link" routerLink="/privacy">Read the privacy policy</a>.
          </p>
        </div>
        <div class="cb__actions">
          <button type="button" class="cb__btn cb__btn--ghost" (click)="consent.set('denied')">
            Reject non-essential
          </button>
          <button type="button" class="cb__btn cb__btn--primary" (click)="consent.set('granted')">
            Accept all
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    .cb {
      position: fixed;
      right: 16px;
      bottom: 16px;
      left: 16px;
      z-index: 100;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 16px;
      max-width: 720px;
      margin-inline: auto;
      padding: 16px 18px;
      background: var(--surface);
      border: 1px solid var(--outline);
      border-radius: var(--r-card);
      box-shadow: var(--shadow-menu);
    }

    .cb__body {
      flex: 1 1 320px;
      min-width: 0;
    }

    .cb__title {
      margin: 0 0 4px;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--on);
    }

    .cb__text {
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
      color: var(--on-var);
    }

    .cb__link {
      color: var(--primary);
    }

    .cb__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .cb__btn {
      padding: 9px 14px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      border: 1px solid transparent;
      border-radius: var(--r-btn);
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .cb__btn--primary {
      color: var(--on-primary);
      background: var(--primary);
    }

    .cb__btn--primary:hover {
      background: var(--primary-strong);
    }

    .cb__btn--ghost {
      color: var(--on);
      background: var(--surface);
      border-color: var(--outline);
    }

    .cb__btn--ghost:hover {
      background: var(--surface-2);
    }

    @media (max-width: 560px) {
      .cb__actions {
        width: 100%;
      }

      .cb__btn {
        flex: 1 1 auto;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsentBanner {
  protected readonly consent = inject(ConsentService);
}
