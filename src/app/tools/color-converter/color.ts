/**
 * Colour maths for the converter, kept free of Angular so it is testable on its
 * own. Everything hangs off an 8-bit sRGB value with a 0–1 alpha; the wider
 * spaces (OKLCH, CIELAB) convert to and from that.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  /** 0–1 */
  a: number;
}

/** OKLCH — perceptual lightness (0–1), chroma (≥0) and hue (degrees). */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** CIELAB (D65) — lightness (0–100) and the a/b opponent axes. */
export interface Lab {
  l: number;
  a: number;
  b: number;
}

// --- Parsing ------------------------------------------------------------

/**
 * Accepts #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba(), hsl()/hsla(),
 * oklch()/oklab() and lab()/lch(). Returns null when the input is unparseable.
 */
export function parseColor(raw: string): Rgb | null {
  const value = raw.trim().toLowerCase();
  if (value === '') {
    return null;
  }

  const hex = /^#?([0-9a-f]{3,8})$/.exec(value);
  if (hex) {
    return parseHex(hex[1]);
  }

  const fn = /^([a-z]+)\(([^)]+)\)$/.exec(value);
  if (!fn) {
    return null;
  }
  const [, name, body] = fn;
  const parts = splitArgs(body);
  if (parts.length < 3) {
    return null;
  }

  switch (name) {
    case 'rgb':
    case 'rgba': {
      const channels = parts.slice(0, 3).map(channel);
      if (channels.some((c) => c === null)) {
        return null;
      }
      const [r, g, b] = channels as number[];
      return { r, g, b, a: parts.length > 3 ? alpha(parts[3]) : 1 };
    }
    case 'hsl':
    case 'hsla': {
      const [h, s, l] = parts.map(Number.parseFloat);
      if (![h, s, l].every(Number.isFinite)) {
        return null;
      }
      return { ...fromHsl(h, s, l), a: parts.length > 3 ? alpha(parts[3]) : 1 };
    }
    case 'oklch':
    case 'oklab': {
      const nums = parseNumbers(parts, 3);
      if (!nums) {
        return null;
      }
      const a = parts.length > 3 ? alpha(parts[3]) : 1;
      const l = lightness(parts[0], 1);
      const rgb =
        name === 'oklch'
          ? oklchToRgb({ l, c: nums[1], h: nums[2] })
          : oklabToRgb({ l, aa: nums[1], bb: nums[2] });
      return { ...rgb, a };
    }
    case 'lab':
    case 'lch': {
      const nums = parseNumbers(parts, 3);
      if (!nums) {
        return null;
      }
      const a = parts.length > 3 ? alpha(parts[3]) : 1;
      const l = lightness(parts[0], 100);
      const rgb =
        name === 'lab'
          ? labToRgb({ l, a: nums[1], b: nums[2] })
          : lchToRgb(l, nums[1], nums[2]);
      return { ...rgb, a };
    }
    default:
      return null;
  }
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

/** Lightness where a percentage maps onto `scale` (1 for OKLCH, 100 for LAB). */
function lightness(part: string, scale: number): number {
  const numeric = Number.parseFloat(part);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return part.endsWith('%') ? (numeric / 100) * scale : numeric;
}

/** Parses the first `count` args as finite numbers, or null if any is not. */
function parseNumbers(parts: string[], count: number): number[] | null {
  const nums = parts.slice(0, count).map(Number.parseFloat);
  return nums.every(Number.isFinite) ? nums : null;
}

// --- HEX / HSL ----------------------------------------------------------

export function toHex({ r, g, b, a }: Rgb): string {
  const pair = (value: number) => value.toString(16).padStart(2, '0');
  const base = `#${pair(r)}${pair(g)}${pair(b)}`;
  return a < 1 ? `${base}${pair(Math.round(a * 255))}` : base;
}

export function toHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
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

export function fromHsl(h: number, s: number, l: number): { r: number; g: number; b: number } {
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

// --- Luminance / contrast ----------------------------------------------

/** WCAG 2.x relative luminance. Uses the threshold spelled out in the WCAG formula. */
export function luminance({ r, g, b }: Rgb): number {
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(fg: Rgb, bg: Rgb): number {
  // Alpha is ignored: WCAG contrast is defined for opaque colours, and a
  // translucent foreground's effective colour depends on what sits behind it.
  const a = luminance(fg);
  const b = luminance(bg);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

// --- OKLab / OKLCH (Björn Ottosson) ------------------------------------

export function rgbToOklab({ r, g, b }: Rgb): { l: number; aa: number; bb: number } {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    aa: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    bb: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToRgb({ l, aa, bb }: { l: number; aa: number; bb: number }): Rgb {
  const l_ = (l + 0.3963377774 * aa + 0.2158037573 * bb) ** 3;
  const m_ = (l - 0.1055613458 * aa - 0.0638541728 * bb) ** 3;
  const s_ = (l - 0.0894841775 * aa - 1.291485548 * bb) ** 3;

  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const b = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;

  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b), a: 1 };
}

export function rgbToOklch(rgb: Rgb): Oklch {
  const { l, aa, bb } = rgbToOklab(rgb);
  const c = Math.hypot(aa, bb);
  let h = (Math.atan2(bb, aa) * 180) / Math.PI;
  if (h < 0) {
    h += 360;
  }
  return { l, c, h };
}

export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  return oklabToRgb({ l, aa: c * Math.cos(rad), bb: c * Math.sin(rad) });
}

// --- CIELAB (D65) -------------------------------------------------------

// D65 reference white.
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

export function rgbToLab({ r, g, b }: Rgb): Lab {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / XN;
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) / YN;
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / ZN;

  const fx = pivot(x);
  const fy = pivot(y);
  const fz = pivot(z);

  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToRgb({ l, a, b }: Lab): Rgb {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  const xr = unpivot(fx);
  const yr = l > KAPPA * EPS ? fy ** 3 : l / KAPPA;
  const zr = unpivot(fz);

  const x = xr * XN;
  const y = yr * YN;
  const z = zr * ZN;

  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;

  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(bl), a: 1 };
}

function lchToRgb(l: number, c: number, h: number): Rgb {
  const rad = (h * Math.PI) / 180;
  return labToRgb({ l, a: c * Math.cos(rad), b: c * Math.sin(rad) });
}

function pivot(t: number): number {
  return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

function unpivot(f: number): number {
  const cubed = f ** 3;
  return cubed > EPS ? cubed : (116 * f - 16) / KAPPA;
}

// --- Formatting ---------------------------------------------------------

export function formatOklch(oklch: Oklch, a: number): string {
  const base = `oklch(${round(oklch.l * 100, 1)}% ${round(oklch.c, 4)} ${round(oklch.h, 1)})`;
  return a < 1 ? base.replace(')', ` / ${round(a, 2)})`) : base;
}

export function formatLab(lab: Lab, a: number): string {
  const base = `lab(${round(lab.l, 1)} ${round(lab.a, 1)} ${round(lab.b, 1)})`;
  return a < 1 ? base.replace(')', ` / ${round(a, 2)})`) : base;
}

// --- Palette generation -------------------------------------------------

export interface Swatch {
  /** e.g. "500" for the ramp, or "Complementary" for a harmony. */
  label: string;
  hex: string;
  /** True when the swatch is light enough to want dark text drawn over it. */
  light: boolean;
}

// A Tailwind-style tint/shade scale. Perceptual lightness is set per step and
// the input's hue and chroma are carried across, so the ramp reads as one
// family rather than a naive RGB lighten/darken.
const RAMP_STEPS: { label: string; l: number }[] = [
  { label: '50', l: 0.97 },
  { label: '100', l: 0.93 },
  { label: '200', l: 0.85 },
  { label: '300', l: 0.76 },
  { label: '400', l: 0.68 },
  { label: '500', l: 0.6 },
  { label: '600', l: 0.52 },
  { label: '700', l: 0.44 },
  { label: '800', l: 0.36 },
  { label: '900', l: 0.28 },
];

export function tintShadeRamp(rgb: Rgb): Swatch[] {
  const { c, h } = rgbToOklch(rgb);
  return RAMP_STEPS.map(({ label, l }) => {
    // Ease the chroma off at the very light and very dark ends, where a high
    // chroma would clip hard and look muddy.
    const scale = 1 - Math.abs(l - 0.6) * 0.45;
    const swatch = clampRgb(oklchToRgb({ l, c: c * scale, h }));
    return { label, hex: toHex(swatch), light: l >= 0.62 };
  });
}

const HARMONIES: { label: string; delta: number }[] = [
  { label: 'Base', delta: 0 },
  { label: 'Complementary', delta: 180 },
  { label: 'Analogous +30°', delta: 30 },
  { label: 'Analogous −30°', delta: -30 },
  { label: 'Triadic +120°', delta: 120 },
  { label: 'Triadic −120°', delta: -120 },
];

export function harmonies(rgb: Rgb): Swatch[] {
  const { l, c, h } = rgbToOklch(rgb);
  return HARMONIES.map(({ label, delta }) => {
    const swatch = clampRgb(oklchToRgb({ l, c, h: (((h + delta) % 360) + 360) % 360 }));
    return { label, hex: toHex(swatch), light: l >= 0.62 };
  });
}

// --- Shared helpers -----------------------------------------------------

function srgbToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  const c = clamp(value, 0, 1);
  const srgb = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return clamp(Math.round(srgb * 255), 0, 255);
}

function clampRgb(rgb: Rgb): Rgb {
  return { r: clamp(rgb.r, 0, 255), g: clamp(rgb.g, 0, 255), b: clamp(rgb.b, 0, 255), a: rgb.a };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
