import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';

export interface Rgb {
  r: number;
  g: number;
  b: number;
  /** 0–1 */
  a: number;
}

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
}

export interface ContrastCheck {
  key: string;
  label: string;
  required: number;
  passes: boolean;
}

@Component({
  selector: 'app-color-converter',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './color-converter.html',
  styleUrls: ['../tool-shell.css', './color-converter.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColorConverterTool {
  private readonly snackBar = inject(MatSnackBar);

  protected readonly foreground = signal('#2f6f8f');
  protected readonly background = signal('#ffffff');

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

  protected async copy(value: string, label: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    this.snackBar.open(`${label} copied to clipboard`, undefined, { duration: 2000 });
  }
}

// --- Pure helpers -------------------------------------------------------

function swatchHex(view: ColorView, fallback: string): string {
  return view.hex === '' ? fallback : view.hex.slice(0, 7);
}

function view(raw: string): ColorView {
  const rgb = parseColor(raw);
  if (!rgb) {
    return { rgb: null, hex: '', formats: [] };
  }

  const hex = toHex(rgb);
  const hsl = toHsl(rgb);
  const hasAlpha = rgb.a < 1;

  const formats: Format[] = [
    { key: 'hex', label: 'HEX', value: hex },
    {
      key: 'rgb',
      label: 'RGB',
      value: hasAlpha
        ? `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${round(rgb.a, 2)})`
        : `rgb(${rgb.r} ${rgb.g} ${rgb.b})`,
    },
    {
      key: 'hsl',
      label: 'HSL',
      value: hasAlpha
        ? `hsl(${hsl.h} ${hsl.s}% ${hsl.l}% / ${round(rgb.a, 2)})`
        : `hsl(${hsl.h} ${hsl.s}% ${hsl.l}%)`,
    },
    {
      key: 'rgb-legacy',
      label: 'RGB (legacy)',
      value: hasAlpha
        ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${round(rgb.a, 2)})`
        : `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    },
    { key: 'luminance', label: 'Rel. luminance', value: round(luminance(rgb), 4).toFixed(4) },
  ];

  return { rgb, hex, formats };
}

/** Accepts #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() and hsl()/hsla(). */
function parseColor(raw: string): Rgb | null {
  const value = raw.trim().toLowerCase();
  if (value === '') {
    return null;
  }

  const hex = /^#?([0-9a-f]{3,8})$/.exec(value);
  if (hex) {
    return parseHex(hex[1]);
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgb) {
    const parts = splitArgs(rgb[1]);
    if (parts.length < 3) {
      return null;
    }
    const channels = parts.slice(0, 3).map((part) => channel(part));
    if (channels.some((c) => c === null)) {
      return null;
    }
    const [r, g, b] = channels as number[];
    return { r, g, b, a: parts.length > 3 ? alpha(parts[3]) : 1 };
  }

  const hsl = /^hsla?\(([^)]+)\)$/.exec(value);
  if (hsl) {
    const parts = splitArgs(hsl[1]);
    if (parts.length < 3) {
      return null;
    }
    const h = Number.parseFloat(parts[0]);
    const s = Number.parseFloat(parts[1]);
    const l = Number.parseFloat(parts[2]);
    if (![h, s, l].every(Number.isFinite)) {
      return null;
    }
    return { ...fromHsl(h, s, l), a: parts.length > 3 ? alpha(parts[3]) : 1 };
  }

  return null;
}

function parseHex(digits: string): Rgb | null {
  const expand = (pair: string) => Number.parseInt(pair, 16);
  if (digits.length === 3 || digits.length === 4) {
    const [r, g, b, a] = digits.split('');
    return {
      r: expand(r + r),
      g: expand(g + g),
      b: expand(b + b),
      a: a === undefined ? 1 : expand(a + a) / 255,
    };
  }
  if (digits.length === 6 || digits.length === 8) {
    return {
      r: expand(digits.slice(0, 2)),
      g: expand(digits.slice(2, 4)),
      b: expand(digits.slice(4, 6)),
      a: digits.length === 8 ? expand(digits.slice(6, 8)) / 255 : 1,
    };
  }
  return null;
}

/** Splits `1 2 3 / 0.5` or `1, 2, 3, 0.5` into its component parts. */
function splitArgs(body: string): string[] {
  return body
    .replace(/\//g, ' ')
    .split(/[\s,]+/)
    .filter((part) => part !== '');
}

function channel(part: string): number | null {
  const numeric = Number.parseFloat(part);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const scaled = part.endsWith('%') ? (numeric / 100) * 255 : numeric;
  return clamp(Math.round(scaled), 0, 255);
}

function alpha(part: string): number {
  const numeric = Number.parseFloat(part);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return clamp(part.endsWith('%') ? numeric / 100 : numeric, 0, 1);
}

function toHex({ r, g, b, a }: Rgb): string {
  const pair = (value: number) => value.toString(16).padStart(2, '0');
  const base = `#${pair(r)}${pair(g)}${pair(b)}`;
  return a < 1 ? `${base}${pair(Math.round(a * 255))}` : base;
}

function toHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  if (delta !== 0) {
    if (max === red) {
      h = ((green - blue) / delta) % 6;
    } else if (max === green) {
      h = (blue - red) / delta + 2;
    } else {
      h = (red - green) / delta + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }

  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function fromHsl(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  const sector = Math.floor(hue / 60) % 6;
  const table: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = table[sector];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/** WCAG 2.x relative luminance. */
function luminance({ r, g, b }: Rgb): number {
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatio(fg: Rgb, bg: Rgb): number {
  // Alpha is ignored: WCAG contrast is defined for opaque colours, and a
  // translucent foreground's effective colour depends on what sits behind it.
  const a = luminance(fg);
  const b = luminance(bg);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
