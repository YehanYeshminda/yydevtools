import { Injectable, afterNextRender, signal } from '@angular/core';

const STORAGE_KEY = 'ad-consent';

export type Consent = 'granted' | 'denied';

/** Set to true once the AdSense script is added to index.html. */
export const ADS_ENABLED = false;

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/**
 * Records whether the visitor agreed to personalised advertising.
 *
 * The choice is mirrored into Google Consent Mode v2 via `dataLayer`, which is
 * what AdSense reads. Consent Mode must default to denied *before* the ad script
 * loads — that default is set by the inline snippet in index.html, and this
 * service only ever sends the update. Nothing here loads or blocks ads by
 * itself; it just carries the decision.
 *
 * Like FavoritesService, the stored value is read in `afterNextRender` so the
 * first client render matches the prerendered HTML.
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  /** `null` means "not asked yet", which is what shows the banner. */
  private readonly choice = signal<Consent | null>(null);

  readonly consent = this.choice.asReadonly();
  /** Only ever true in the browser, so the prerendered HTML has no banner. */
  readonly needsDecision = signal(false);

  constructor() {
    afterNextRender(() => {
      const stored = this.read();
      this.choice.set(stored);
      this.needsDecision.set(ADS_ENABLED && stored === null);
      if (stored) {
        this.push(stored);
      }
    });
  }

  set(consent: Consent): void {
    this.choice.set(consent);
    this.needsDecision.set(false);
    this.push(consent);
    try {
      localStorage.setItem(STORAGE_KEY, consent);
    } catch {
      // Ignore storage failures; the choice still holds for this session.
    }
  }

  /** Lets the footer link re-open the banner so a choice can be changed. */
  reopen(): void {
    this.needsDecision.set(true);
  }

  private read(): Consent | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw === 'granted' || raw === 'denied' ? raw : null;
    } catch {
      return null;
    }
  }

  private push(consent: Consent): void {
    window.dataLayer = window.dataLayer ?? [];
    // Consent Mode expects the raw `arguments` object, hence the array push.
    window.dataLayer.push([
      'consent',
      'update',
      {
        ad_storage: consent,
        ad_user_data: consent,
        ad_personalization: consent,
        analytics_storage: consent,
      },
    ]);
  }
}
