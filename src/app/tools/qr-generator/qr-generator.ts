import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import QRCode, { type QRCodeErrorCorrectionLevel } from 'qrcode';
import { syncToolState } from '../../core/tool-state';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { EMPTY_FIELDS, buildPayload, type QrFields, type QrKind } from './qr-payload';

interface LevelOption {
  key: QRCodeErrorCorrectionLevel;
  label: string;
  hint: string;
}

interface KindOption {
  key: QrKind;
  label: string;
  icon: string;
}

/** The payload types offered, in the order people reach for them. */
const KINDS: KindOption[] = [
  { key: 'url', label: 'Link', icon: 'matLinkOutline' },
  { key: 'text', label: 'Text', icon: 'matNotesOutline' },
  { key: 'wifi', label: 'Wi-Fi', icon: 'matWifiOutline' },
  { key: 'vcard', label: 'Contact', icon: 'matContactPageOutline' },
  { key: 'email', label: 'Email', icon: 'matMailOutline' },
  { key: 'sms', label: 'SMS', icon: 'matSmsOutline' },
  { key: 'tel', label: 'Phone', icon: 'matCallOutline' },
  { key: 'geo', label: 'Location', icon: 'matLocationOnOutline' },
  { key: 'event', label: 'Event', icon: 'matEventOutline' },
];

const LEVELS: LevelOption[] = [
  { key: 'L', label: 'L', hint: 'Low — ~7% recovery' },
  { key: 'M', label: 'M', hint: 'Medium — ~15% recovery' },
  { key: 'Q', label: 'Q', hint: 'Quartile — ~25% recovery' },
  { key: 'H', label: 'H', hint: 'High — ~30% recovery' },
];

const MIN_SIZE = 128;
const MAX_SIZE = 1024;

/**
 * Fills any gaps in a restored `fields` object from the defaults.
 *
 * Stored state can predate a field being added, and the payload builders read
 * every property of their group — one `undefined` would render `"undefined"`
 * into a vCard rather than failing loudly.
 */
function mergeFields(stored: Partial<QrFields>): QrFields {
  return {
    text: text(stored.text, EMPTY_FIELDS.text),
    url: text(stored.url, EMPTY_FIELDS.url),
    tel: text(stored.tel, EMPTY_FIELDS.tel),
    wifi: { ...EMPTY_FIELDS.wifi, ...group(stored.wifi) },
    vcard: { ...EMPTY_FIELDS.vcard, ...group(stored.vcard) },
    email: { ...EMPTY_FIELDS.email, ...group(stored.email) },
    sms: { ...EMPTY_FIELDS.sms, ...group(stored.sms) },
    geo: { ...EMPTY_FIELDS.geo, ...group(stored.geo) },
    event: { ...EMPTY_FIELDS.event, ...group(stored.event) },
  };
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function group<T extends object>(value: T | undefined): Partial<T> {
  return typeof value === 'object' && value !== null ? value : {};
}

@Component({
  selector: 'app-qr-generator',
  imports: [ToolPage, ToolContent, MatButtonModule, NgIcon],
  templateUrl: './qr-generator.html',
  styleUrls: ['../tool-shell.css', './qr-generator.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrGeneratorTool {
  private readonly snackBar = inject(MatSnackBar);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly levels = LEVELS;
  protected readonly kinds = KINDS;
  protected readonly minSize = MIN_SIZE;
  protected readonly maxSize = MAX_SIZE;

  protected readonly kind = signal<QrKind>('url');
  /**
   * Every type's fields at once, so switching between them and back does not
   * throw away what was typed.
   */
  protected readonly fields = signal<QrFields>(EMPTY_FIELDS);

  /** What actually gets encoded — derived, never edited directly. */
  protected readonly text = computed(() => buildPayload(this.kind(), this.fields()));

  protected readonly size = signal(320);
  protected readonly level = signal<QRCodeErrorCorrectionLevel>('M');
  protected readonly margin = signal(2);
  protected readonly dark = signal('#000000');
  protected readonly light = signal('#ffffff');

  /**
   * Restored within the session, but **never shareable** — deliberately no
   * "Copy link" button here, for two reasons.
   *
   * The fields routinely hold a Wi-Fi password or someone's home address, and a
   * URL is exactly the wrong container for those: it survives in chat history
   * and over anyone's shoulder long after the QR code has been scanned. And
   * there is nothing to gain by it — what you share from this tool is the PNG
   * or SVG, not a link to a generator with the fields pre-filled.
   */
  private readonly restored = syncToolState({
    key: 'qr-generator',
    shareable: false,
    snapshot: () => ({
      kind: this.kind(),
      fields: this.fields(),
      size: this.size(),
      level: this.level(),
      margin: this.margin(),
      dark: this.dark(),
      light: this.light(),
    }),
    restore: (state) => {
      if (KINDS.some((option) => option.key === state.kind)) {
        this.kind.set(state.kind as QrKind);
      }
      // Merge onto the defaults so a stored value from an older shape cannot
      // leave a field undefined and break the payload builder.
      if (state.fields && typeof state.fields === 'object') {
        this.fields.set(mergeFields(state.fields as Partial<QrFields>));
      }
      if (typeof state.size === 'number' && Number.isFinite(state.size)) {
        this.size.set(Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(state.size))));
      }
      if (LEVELS.some((option) => option.key === state.level)) {
        this.level.set(state.level as QRCodeErrorCorrectionLevel);
      }
      if (typeof state.margin === 'number' && Number.isFinite(state.margin)) {
        this.margin.set(Math.min(10, Math.max(0, Math.round(state.margin))));
      }
      if (typeof state.dark === 'string') {
        this.dark.set(state.dark);
      }
      if (typeof state.light === 'string') {
        this.light.set(state.light);
      }
    },
  });

  /** Rendered outputs, refreshed by the effect below whenever an input changes. */
  protected readonly pngUrl = signal('');
  protected readonly svgMarkup = signal('');
  protected readonly error = signal<string | null>(null);

  protected readonly hasText = computed(() => this.text().trim().length > 0);
  protected readonly hasCode = computed(() => this.pngUrl().length > 0);

  /**
   * A stable, filesystem-friendly stem for the downloaded files.
   *
   * Structured payloads begin with a marker rather than anything readable
   * ("WIFI:T:WPA…", "BEGIN:VCARD…"), so those are named after the type instead
   * of after a slug of the payload.
   */
  private readonly fileStem = computed(() => {
    const kind = this.kind();
    if (kind !== 'text' && kind !== 'url') {
      return `qr-${kind}`;
    }
    const slug = this.text()
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return slug || 'qr-code';
  });

  constructor() {
    // Rendering needs a DOM canvas, so it only runs in the browser. The request
    // guard drops results from a superseded render if the user keeps typing.
    let requestId = 0;
    effect(() => {
      const text = this.text().trim();
      const options = {
        errorCorrectionLevel: this.level(),
        margin: this.margin(),
        width: this.size(),
        color: { dark: this.dark(), light: this.light() },
      };

      if (!this.isBrowser) {
        return;
      }
      if (text === '') {
        this.pngUrl.set('');
        this.svgMarkup.set('');
        this.error.set(null);
        return;
      }

      const current = ++requestId;
      Promise.all([
        QRCode.toDataURL(text, { ...options, type: 'image/png' }),
        QRCode.toString(text, { ...options, type: 'svg' }),
      ])
        .then(([png, svg]) => {
          if (current !== requestId) {
            return;
          }
          this.pngUrl.set(png);
          this.svgMarkup.set(svg);
          this.error.set(null);
        })
        .catch((err: unknown) => {
          if (current !== requestId) {
            return;
          }
          this.pngUrl.set('');
          this.svgMarkup.set('');
          this.error.set(err instanceof Error ? err.message : 'Could not generate a QR code.');
        });
    });
  }

  protected setKind(kind: QrKind): void {
    this.kind.set(kind);
  }

  /** Update one top-level field (`text`, `url`, `tel`). */
  protected setField<K extends 'text' | 'url' | 'tel'>(key: K, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.fields.update((current) => ({ ...current, [key]: value }));
  }

  /** Update one field inside a grouped section (`wifi.ssid`, `vcard.email`, …). */
  protected setGroupField<G extends 'wifi' | 'vcard' | 'email' | 'sms' | 'geo' | 'event'>(
    group: G,
    key: keyof QrFields[G],
    event: Event,
  ): void {
    const target = event.target as HTMLInputElement;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    this.fields.update((current) => ({
      ...current,
      [group]: { ...current[group], [key]: value },
    }));
  }

  protected setWifiSecurity(security: 'WPA' | 'WEP' | 'nopass'): void {
    this.fields.update((current) => ({ ...current, wifi: { ...current.wifi, security } }));
  }

  protected toggleWifiHidden(): void {
    this.fields.update((current) => ({
      ...current,
      wifi: { ...current.wifi, hidden: !current.wifi.hidden },
    }));
  }

  protected onSizeInput(event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(parsed)) {
      this.size.set(Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(parsed))));
    }
  }

  protected onMarginInput(event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(parsed)) {
      this.margin.set(Math.min(10, Math.max(0, Math.round(parsed))));
    }
  }

  protected setLevel(level: QRCodeErrorCorrectionLevel): void {
    this.level.set(level);
  }

  protected onDarkInput(event: Event): void {
    this.dark.set((event.target as HTMLInputElement).value);
  }

  protected onLightInput(event: Event): void {
    this.light.set((event.target as HTMLInputElement).value);
  }

  protected downloadPng(): void {
    const url = this.pngUrl();
    if (!url) {
      return;
    }
    this.saveBlob(url, `${this.fileStem()}.png`);
  }

  protected downloadSvg(): void {
    const svg = this.svgMarkup();
    if (!svg) {
      return;
    }
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    this.saveBlob(url, `${this.fileStem()}.svg`, true);
  }

  private saveBlob(href: string, filename: string, revoke = false): void {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    anchor.click();
    if (revoke) {
      URL.revokeObjectURL(href);
    }
  }
}
