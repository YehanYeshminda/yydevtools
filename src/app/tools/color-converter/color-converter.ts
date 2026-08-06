import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import {
  Rgb,
  Swatch,
  contrastRatio,
  formatLab,
  formatOklch,
  harmonies,
  luminance,
  parseColor,
  rgbToLab,
  rgbToOklch,
  round,
  tintShadeRamp,
  toHex,
  toHsl,
} from './color';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';

export interface Format {
  key: string;
  label: string;
  value: string;
}

export interface ColorView {
  /** Non-null once the input parses; drives the swatch and every conversion. */
  rgb: Rgb | null;
  hex: string;
  formats: Format[];
  ramp: Swatch[];
  harmonies: Swatch[];
}

export interface ContrastCheck {
  key: string;
  label: string;
  required: number;
  passes: boolean;
}

@Component({
  selector: 'app-color-converter',
  imports: [ToolContent, ShareLink, RouterLink, MatButtonModule, NgIcon],
  templateUrl: './color-converter.html',
  styleUrls: ['../tool-shell.css', './color-converter.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColorConverterTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly foreground = signal('#2f6f8f');
  protected readonly background = signal('#ffffff');

  protected readonly shared = syncToolState({
    key: 'color-converter',
    snapshot: () => ({ foreground: this.foreground(), background: this.background() }),
    restore: (state) => {
      if (typeof state.foreground === 'string') {
        this.foreground.set(state.foreground);
      }
      if (typeof state.background === 'string') {
        this.background.set(state.background);
      }
    },
  });

  protected readonly foregroundView = computed(() => view(this.foreground()));
  protected readonly backgroundView = computed(() => view(this.background()));

  /** `<input type="color">` only accepts opaque six-digit hex. */
  protected readonly foregroundSwatch = computed(() => swatchHex(this.foregroundView(), '#000000'));
  protected readonly backgroundSwatch = computed(() => swatchHex(this.backgroundView(), '#ffffff'));

  /** WCAG contrast ratio, 1–21, or null while either colour is unparseable. */
  protected readonly ratio = computed(() => {
    const fg = this.foregroundView().rgb;
    const bg = this.backgroundView().rgb;
    if (!fg || !bg) {
      return null;
    }
    return contrastRatio(fg, bg);
  });

  protected readonly ratioLabel = computed(() => {
    const value = this.ratio();
    return value === null ? '—' : `${value.toFixed(2)}:1`;
  });

  protected readonly checks = computed<ContrastCheck[]>(() => {
    const value = this.ratio();
    const thresholds = [
      { key: 'aa-normal', label: 'AA · normal text', required: 4.5 },
      { key: 'aa-large', label: 'AA · large text', required: 3 },
      { key: 'aaa-normal', label: 'AAA · normal text', required: 7 },
      { key: 'aaa-large', label: 'AAA · large text', required: 4.5 },
      { key: 'aa-ui', label: 'AA · UI components', required: 3 },
    ];
    return thresholds.map((threshold) => ({
      ...threshold,
      passes: value !== null && value >= threshold.required,
    }));
  });

  // --- Input handling ---------------------------------------------------
  protected onForegroundInput(event: Event): void {
    this.foreground.set((event.target as HTMLInputElement).value);
  }

  protected onBackgroundInput(event: Event): void {
    this.background.set((event.target as HTMLInputElement).value);
  }

  protected swap(): void {
    const fg = this.foregroundView().hex || this.foreground();
    const bg = this.backgroundView().hex || this.background();
    this.foreground.set(bg);
    this.background.set(fg);
  }

  /** Clicking a palette swatch loads it as the foreground colour to explore further. */
  protected pick(hex: string): void {
    this.foreground.set(hex);
  }

  protected copy(value: string, label: string): void {
    void this.clipboard.copy(value, { label });
  }
}

// --- Pure helpers -------------------------------------------------------

function swatchHex(view: ColorView, fallback: string): string {
  return view.hex === '' ? fallback : view.hex.slice(0, 7);
}

function view(raw: string): ColorView {
  const rgb = parseColor(raw);
  if (!rgb) {
    return { rgb: null, hex: '', formats: [], ramp: [], harmonies: [] };
  }

  const hex = toHex(rgb);
  const hsl = toHsl(rgb);
  const oklch = rgbToOklch(rgb);
  const lab = rgbToLab(rgb);
  const hasAlpha = rgb.a < 1;
  const withAlpha = (base: string) => (hasAlpha ? `${base} / ${round(rgb.a, 2)}` : base);

  const formats: Format[] = [
    { key: 'hex', label: 'HEX', value: hex },
    { key: 'rgb', label: 'RGB', value: withAlpha(`rgb(${rgb.r} ${rgb.g} ${rgb.b})`) },
    { key: 'hsl', label: 'HSL', value: withAlpha(`hsl(${hsl.h} ${hsl.s}% ${hsl.l}%)`) },
    { key: 'oklch', label: 'OKLCH', value: formatOklch(oklch, rgb.a) },
    { key: 'lab', label: 'LAB', value: formatLab(lab, rgb.a) },
    {
      key: 'rgb-legacy',
      label: 'RGB (legacy)',
      value: hasAlpha
        ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${round(rgb.a, 2)})`
        : `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    },
    { key: 'luminance', label: 'Rel. luminance', value: round(luminance(rgb), 4).toFixed(4) },
  ];

  return { rgb, hex, formats, ramp: tintShadeRamp(rgb), harmonies: harmonies(rgb) };
}
