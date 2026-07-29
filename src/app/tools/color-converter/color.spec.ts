import { describe, expect, it } from 'vitest';

import {
  Rgb,
  contrastRatio,
  formatLab,
  formatOklch,
  harmonies,
  labToRgb,
  oklchToRgb,
  parseColor,
  rgbToLab,
  rgbToOklch,
  tintShadeRamp,
  toHex,
} from './color';

const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: Rgb = { r: 0, g: 0, b: 0, a: 1 };

describe('parseColor', () => {
  it('reads hex, rgb and hsl', () => {
    expect(parseColor('#2f6f8f')).toEqual({ r: 47, g: 111, b: 143, a: 1 });
    expect(parseColor('rgb(47 111 143)')).toEqual({ r: 47, g: 111, b: 143, a: 1 });
    expect(parseColor('hsl(200 50% 37%)')?.r).toBeCloseTo(47, 0);
  });

  it('reads oklch and round-trips through it', () => {
    const rgb = parseColor('oklch(52.3% 0.077 233)');
    expect(rgb).not.toBeNull();
    // Close to the sRGB the OKLCH describes.
    expect(rgb!.r).toBeGreaterThan(20);
    expect(rgb!.b).toBeGreaterThan(rgb!.r);
  });

  it('reads lab with a percentage lightness', () => {
    const rgb = parseColor('lab(50% 40 -30)');
    expect(rgb).not.toBeNull();
    expect(rgb!.r).toBeGreaterThan(rgb!.g);
  });

  it('returns null for nonsense', () => {
    expect(parseColor('not-a-colour')).toBeNull();
    expect(parseColor('rgb(1 2)')).toBeNull();
    expect(parseColor('')).toBeNull();
  });
});

describe('OKLab / OKLCH reference values', () => {
  it('maps white to L≈1, C≈0', () => {
    const { l, c } = rgbToOklch(WHITE);
    expect(l).toBeCloseTo(1, 2);
    expect(c).toBeCloseTo(0, 2);
  });

  it('maps mid-grey to L≈0.6, C≈0', () => {
    const { l, c } = rgbToOklch({ r: 128, g: 128, b: 128, a: 1 });
    expect(l).toBeCloseTo(0.6, 1);
    expect(c).toBeCloseTo(0, 3);
  });

  it('round-trips a saturated colour', () => {
    const original: Rgb = { r: 47, g: 111, b: 143, a: 1 };
    const back = oklchToRgb(rgbToOklch(original));
    expect(back.r).toBeCloseTo(47, 0);
    expect(back.g).toBeCloseTo(111, 0);
    expect(back.b).toBeCloseTo(143, 0);
  });
});

describe('CIELAB reference values', () => {
  it('maps white to L=100 and grey axes to 0', () => {
    const lab = rgbToLab(WHITE);
    expect(lab.l).toBeCloseTo(100, 1);
    expect(lab.a).toBeCloseTo(0, 1);
    expect(lab.b).toBeCloseTo(0, 1);
  });

  it('maps black to L=0', () => {
    expect(rgbToLab(BLACK).l).toBeCloseTo(0, 1);
  });

  it('round-trips a colour', () => {
    const original: Rgb = { r: 200, g: 60, b: 90, a: 1 };
    const back = labToRgb(rgbToLab(original));
    expect(back.r).toBeCloseTo(200, 0);
    expect(back.g).toBeCloseTo(60, 0);
    expect(back.b).toBeCloseTo(90, 0);
  });
});

describe('formatting', () => {
  it('formats OKLCH as a percentage lightness', () => {
    expect(formatOklch({ l: 0.628, c: 0.15, h: 240 }, 1)).toBe('oklch(62.8% 0.15 240)');
    expect(formatOklch({ l: 0.5, c: 0.1, h: 30 }, 0.5)).toBe('oklch(50% 0.1 30 / 0.5)');
  });

  it('formats LAB on the 0–100 scale', () => {
    expect(formatLab({ l: 52.5, a: 40.1, b: -30.2 }, 1)).toBe('lab(52.5 40.1 -30.2)');
  });
});

describe('contrast', () => {
  it('gives 21:1 for black on white', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 0);
  });
});

describe('palette', () => {
  it('generates a 10-step ramp of valid hex colours', () => {
    const ramp = tintShadeRamp({ r: 47, g: 111, b: 143, a: 1 });
    expect(ramp).toHaveLength(10);
    expect(ramp[0].label).toBe('50');
    expect(ramp.every((s) => /^#[0-9a-f]{6}$/.test(s.hex))).toBe(true);
    // Light end reads as light, dark end does not.
    expect(ramp[0].light).toBe(true);
    expect(ramp[9].light).toBe(false);
  });

  it('generates harmonies including a complementary colour', () => {
    const set = harmonies({ r: 47, g: 111, b: 143, a: 1 });
    const labels = set.map((s) => s.label);
    expect(labels).toContain('Base');
    expect(labels).toContain('Complementary');
    // The base swatch is the input colour itself.
    expect(set[0].hex).toBe(toHex({ r: 47, g: 111, b: 143, a: 1 }));
  });
});
