import { expect, test } from '@playwright/test';

import { setTheme } from './helpers';

/**
 * Contrast enforced at the token layer, not just where AXE happens to find text.
 *
 * AXE only judges elements that are on screen, so a token can regress and go
 * unnoticed until it lands on a page nobody audited. These assertions pin the
 * rule itself: every text token must clear 4.5:1 against every surface it is
 * paired with, in both themes.
 *
 * The pairs below are the ones the stylesheets actually use — `--on-dim` is
 * never set on `--surface-3`, so demanding it would fail on a combination that
 * does not exist.
 */
const TEXT_ON_SURFACES: Array<[string, string[]]> = [
  ['--on', ['--bg', '--surface', '--surface-1', '--surface-2', '--surface-3']],
  ['--on-var', ['--bg', '--surface', '--surface-1', '--surface-2']],
  ['--on-dim', ['--bg', '--surface', '--surface-1', '--surface-2']],
  ['--primary', ['--bg', '--surface', '--surface-1']],
  ['--error', ['--bg', '--surface', '--error-bg']],
  ['--success', ['--bg', '--surface', '--success-bg']],
  ['--on-primary-c', ['--primary-c']],
  ['--on-brand', ['--brand']],
];

const AA_NORMAL = 4.5;

for (const theme of ['dark', 'light'] as const) {
  test(`every text token clears AA against its surfaces in the ${theme} theme`, async ({
    page,
  }) => {
    await page.goto('/');
    await setTheme(page, theme);

    const failures = await page.evaluate(
      ({ pairs, min }) => {
        const styles = getComputedStyle(document.documentElement);
        const read = (name: string) => styles.getPropertyValue(name).trim();

        const toRgb = (value: string): [number, number, number] | null => {
          if (value.startsWith('#')) {
            const hex = value.slice(1);
            const full =
              hex.length === 3
                ? hex
                    .split('')
                    .map((c) => c + c)
                    .join('')
                : hex;
            if (full.length < 6) return null;
            return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [
              number,
              number,
              number,
            ];
          }
          const nums = value.match(/[\d.]+/g);
          if (!nums || nums.length < 3) return null;
          return nums.slice(0, 3).map(Number) as [number, number, number];
        };

        const luminance = (rgb: [number, number, number]) => {
          const [r, g, b] = rgb.map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };

        const bad: string[] = [];
        for (const [fgName, bgNames] of pairs) {
          const fg = toRgb(read(fgName));
          if (!fg) {
            bad.push(`${fgName} is not a resolvable colour`);
            continue;
          }
          for (const bgName of bgNames) {
            const bg = toRgb(read(bgName));
            if (!bg) {
              bad.push(`${bgName} is not a resolvable colour`);
              continue;
            }
            const a = luminance(fg);
            const b = luminance(bg);
            const [hi, lo] = a > b ? [a, b] : [b, a];
            const ratio = (hi + 0.05) / (lo + 0.05);
            if (ratio < min) {
              bad.push(`${fgName} on ${bgName} is ${ratio.toFixed(2)}:1 (needs ${min}:1)`);
            }
          }
        }
        return bad;
      },
      { pairs: TEXT_ON_SURFACES, min: AA_NORMAL },
    );

    expect(failures, `contrast failures in the ${theme} theme:\n${failures.join('\n')}`).toEqual([]);
  });
}

test('the brand amber is never used as body text', async ({ page }) => {
  // --brand is a fill. As text on the light page background it is ~1.7:1, which
  // is how the guides eyebrow shipped broken. Icons and decorative glyphs are
  // aria-hidden and exempt.
  await page.goto('/guides');
  await setTheme(page, 'light');

  const offenders = await page.evaluate(() => {
    const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
    const toRgb = (hex: string) =>
      [0, 2, 4].map((i) => parseInt(hex.slice(1).slice(i, i + 2), 16)).join(', ');
    const brandRgb = `rgb(${toRgb(brand)})`;

    return [...document.querySelectorAll<HTMLElement>('main *')]
      .filter((el) => {
        if (el.getAttribute('aria-hidden') === 'true') return false;
        if (el.closest('[aria-hidden="true"]')) return false;
        // Only elements holding their own text.
        const text = [...el.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent?.trim() ?? '')
          .join('');
        if (!text) return false;
        return getComputedStyle(el).color === brandRgb;
      })
      .map((el) => `${el.tagName.toLowerCase()}.${el.className} — "${el.textContent?.trim().slice(0, 30)}"`);
  });

  expect(offenders, `--brand used as text:\n${offenders.join('\n')}`).toEqual([]);
});
