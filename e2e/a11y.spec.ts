import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { gotoTool, setTheme, uploadFiles } from './helpers';

/**
 * CLAUDE.md sets the bar: the site must pass AXE and meet WCAG AA. The redesign
 * repainted every surface, so contrast and focus are exactly what is at risk —
 * this runs the audit in both themes.
 *
 * AdSense injects third-party iframes and markup that fail rules the app does
 * not control, so the ad slots are excluded and everything else is in scope.
 */
const audit = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('app-ad-slot')
    .exclude('iframe[title="Advertisement"]')
    .exclude('iframe[name^="aswift"]')
    .exclude('#google_esf');

/**
 * Waits for the loading veil to take itself out of the DOM.
 *
 *  is a fixed, decorative full-screen layer that fades and removes
 * itself about a second and a half in. An audit that lands while it is still
 * fading measures text blended through a partial opacity and reports a
 * contrast failure against the veil rather than against the page — which is
 * what made this suite fail on a different surface every run.
 */
async function expectSplashGone(page: Page): Promise<void> {
  await expect(page.locator('#splash')).toHaveCount(0);
}

const SURFACES: Array<[string, string]> = [
  ['home', '/'],
  ['tool (text)', '/tools/json-formatter'],
  ['tool (file)', '/tools/pdf-merge'],
  // Two columns, a file picker and a canvas carrying a rendered document —
  // none of which the other two tool surfaces have.
  ['tool (live preview)', '/tools/invoice-generator'],
  ['guides index', '/guides'],
  ['about', '/about'],
  ['privacy', '/privacy'],
  ['terms', '/terms'],
  ['contact', '/contact'],
];

for (const theme of ['dark', 'light'] as const) {
  for (const [name, path] of SURFACES) {
    test(`${name} has no AXE violations in the ${theme} theme`, async ({ page }) => {
      await page.goto(path);
      await setTheme(page, theme);
      await expect(page.locator('h1').first()).toBeVisible();
      await expectSplashGone(page);

      const results = await audit(page).analyze();
      const summary = results.violations.map(
        (violation) =>
          `${violation.id} (${violation.impact}): ${violation.help}\n  ` +
          violation.nodes
            .slice(0, 3)
            .map((node) => node.target.join(' '))
            .join('\n  '),
      );
      expect(summary, `AXE violations on ${path} [${theme}]:\n${summary.join('\n')}`).toEqual([]);
    });
  }
}

test('the command palette dialog is accessible when open', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('dialog')).toBeVisible();

  const results = await audit(page).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help}`);
  expect(summary, `AXE violations with the palette open:\n${summary.join('\n')}`).toEqual([]);
});

test('the whole header is reachable and operable from the keyboard', async ({ page }) => {
  await page.goto('/');
  await page.locator('body').press('Tab');

  // Walk the first dozen stops and make sure focus stays visible and inside the
  // document rather than disappearing into an element with no focus style.
  const reached: string[] = [];
  for (let i = 0; i < 12; i++) {
    const active = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
        outline: style.outlineStyle,
      };
    });
    if (!active) break;
    reached.push(`${active.tag}:${active.label}`);
    await page.keyboard.press('Tab');
  }

  expect(reached.length, 'nothing was focusable from the top of the page').toBeGreaterThan(5);
  // Every stop must carry an accessible name — an unnamed control is a dead end
  // for a screen-reader user.
  const unnamed = reached.filter((entry) => entry.endsWith(':'));
  expect(unnamed, `focusable controls with no accessible name: ${unnamed.join(', ')}`).toEqual([]);
});

/**
 * The one surface whose colours are not the palette's.
 *
 * Every swatch paints itself with a colour out of the uploaded image and
 * writes its hex across it, so contrast here is decided at runtime by
 * readableOn() rather than by a token anyone can inspect. A regression would
 * be invisible until someone dropped in the wrong photograph.
 */
for (const theme of ['dark', 'light'] as const) {
  test(`extracted palette swatches have no AXE violations in the ${theme} theme`, async ({
    page,
  }) => {
    await gotoTool(page, 'palette-extractor', 'Colour Palette Extractor');
    await setTheme(page, theme);
    await expectSplashGone(page);
    await uploadFiles(page, ['sample.png']);
    await expect(page.locator('.swatch').first()).toBeVisible();

    const results = await audit(page).analyze();
    expect(
      results.violations.map(
        (violation) =>
          `${violation.id}: ${violation.nodes
            .map((node) => node.target.join(' '))
            .slice(0, 6)
            .join(' | ')}`,
      ),
    ).toEqual([]);
  });
}

/**
 * The passport tool's action row, which only exists once a photo is loaded.
 *
 * Its guides toggle is a Material button wearing the .chip--on class, and that
 * combination shipped unreadable: the class set `color`, but
 * `.mat-mdc-button:not(:disabled)` sets the label colour and outranks it, so
 * the label stayed brand-yellow on a brand-yellow fill at 1.04:1. Nothing
 * audited that surface, because the audits all ran on an empty page.
 */
for (const theme of ['dark', 'light'] as const) {
  test(`passport-photo's result controls have no AXE violations in the ${theme} theme`, async ({
    page,
  }) => {
    await gotoTool(page, 'passport-photo', 'Passport Photo Maker');
    await setTheme(page, theme);
    await expectSplashGone(page);
    await uploadFiles(page, ['sample-photo.jpg']);
    await expect(page.getByTestId('photo')).toBeVisible({ timeout: 45_000 });

    // Both states of the toggle: it is the "on" one that was unreadable.
    const guides = page.getByRole('button', { name: /guides/ });
    for (let pass = 0; pass < 2; pass++) {
      const results = await audit(page).analyze();
      expect(
        results.violations.map(
          (violation) =>
            `${violation.id}: ${violation.nodes
              .map((node) => node.target.join(' '))
              .slice(0, 6)
              .join(' | ')}`,
        ),
      ).toEqual([]);
      await guides.click();
    }
  });
}

/**
 * The site's one confirmation, which only exists while a timer is running.
 *
 * A modal is the surface where accessibility is easiest to get wrong — the
 * focus trap, the name, the description, and a filled button whose label takes
 * its colour from a token rather than from the class beside it, which is how
 * the passport toggle came to ship at 1.04:1.
 */
for (const theme of ['dark', 'light'] as const) {
  test(`the confirmation dialog has no AXE violations in the ${theme} theme`, async ({ page }) => {
    await gotoTool(page, 'pomodoro', 'Pomodoro Timer & Stopwatch');
    await setTheme(page, theme);
    await expectSplashGone(page);

    await page.getByTestId('toggle').click();
    await page
      .getByRole('group', { name: 'Phase' })
      .getByRole('button', { name: 'Short break' })
      .click();
    await expect(page.getByRole('alertdialog')).toBeVisible();

    const results = await audit(page).analyze();
    expect(
      results.violations.map(
        (violation) =>
          `${violation.id}: ${violation.nodes
            .map((node) => node.target.join(' '))
            .slice(0, 6)
            .join(' | ')}`,
      ),
    ).toEqual([]);
  });
}
