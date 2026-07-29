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
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import QRCode, { type QRCodeErrorCorrectionLevel } from 'qrcode';
import { ToolContent } from '../../shared/tool-content/tool-content';

interface LevelOption {
  key: QRCodeErrorCorrectionLevel;
  label: string;
  hint: string;
}

const LEVELS: LevelOption[] = [
  { key: 'L', label: 'L', hint: 'Low — ~7% recovery' },
  { key: 'M', label: 'M', hint: 'Medium — ~15% recovery' },
  { key: 'Q', label: 'Q', hint: 'Quartile — ~25% recovery' },
  { key: 'H', label: 'H', hint: 'High — ~30% recovery' },
];

const MIN_SIZE = 128;
const MAX_SIZE = 1024;

@Component({
  selector: 'app-qr-generator',
  imports: [ToolContent, RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './qr-generator.html',
  styleUrls: ['../tool-shell.css', './qr-generator.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrGeneratorTool {
  private readonly snackBar = inject(MatSnackBar);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly levels = LEVELS;
  protected readonly minSize = MIN_SIZE;
  protected readonly maxSize = MAX_SIZE;

  protected readonly text = signal('https://yydevtools.com');
  protected readonly size = signal(320);
  protected readonly level = signal<QRCodeErrorCorrectionLevel>('M');
  protected readonly margin = signal(2);
  protected readonly dark = signal('#000000');
  protected readonly light = signal('#ffffff');

  /** Rendered outputs, refreshed by the effect below whenever an input changes. */
  protected readonly pngUrl = signal('');
  protected readonly svgMarkup = signal('');
  protected readonly error = signal<string | null>(null);

  protected readonly hasText = computed(() => this.text().trim().length > 0);
  protected readonly hasCode = computed(() => this.pngUrl().length > 0);

  /** A stable, filesystem-friendly stem for the downloaded files. */
  private readonly fileStem = computed(() => {
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

  protected onTextInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
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
