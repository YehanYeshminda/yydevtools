import { expect, test } from '@playwright/test';

import { expectClean, expectNoHorizontalOverflow, setTheme, watchConsole } from './helpers';

/**
 * The app shell: header, nav, browse menu, theme control, palette trigger and
 * footer. These are the pieces the redesign rebuilt, and the pieces every other
 * page inherits — a break here breaks all 37 tool pages at once.
 */
test.describe('app shell', () => {
  test('header renders the brand, primary nav and controls', async ({ page }) => {
    const watch = watchConsole(page);
    await page.goto('/');

    await expect(page.locator('.brand__name')).toContainText('YYDevTools');
    await expect(page.locator('.brand__mark')).toBeVisible();

    const nav = page.locator('nav[aria-label="Primary"]').first();
    for (const label of ['Tools', 'Browse', 'Guides', 'News', 'About', 'GitHub']) {
      await expect(nav.getByText(label, { exact: true }).first()).toBeVisible();
    }

    await expect(page.getByRole('button', { name: 'Search tools' })).toBeVisible();
    expectClean(watch);
  });

  test('Browse menu opens and lists every category with a count', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Browse/ }).click();

    const menu = page.getByRole('menu', { name: 'Browse tools' });
    await expect(menu).toBeVisible();
    for (const category of ['Developer', 'Converter', 'Document']) {
      await expect(menu.getByRole('menuitem', { name: new RegExp(category) })).toBeVisible();
    }
    await expect(menu.getByRole('menuitem', { name: /All tools/ })).toBeVisible();
  });

  test('Browse menu navigates to a filtered home', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Browse/ }).click();
    await page.getByRole('menuitem', { name: /Document/ }).click();

    await expect(page).toHaveURL(/category=Document/);
    await expect(page.locator('.work__title')).toContainText('Documents');
  });

  test('theme menu switches the painted theme, and the choice survives a reload', async ({
    page,
  }) => {
    await page.goto('/');
    const html = page.locator('html');

    await page.getByRole('button', { name: /Colour theme/ }).click();
    await page.getByRole('menuitemradio', { name: 'Dark' }).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('button', { name: /Colour theme/ }).click();
    await page.getByRole('menuitemradio', { name: 'Light' }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('both themes define every core token', async ({ page }) => {
    await page.goto('/');

    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme);
      const missing = await page.evaluate(() => {
        const names = [
          '--bg',
          '--surface',
          '--surface-1',
          '--surface-2',
          '--surface-3',
          '--on',
          '--on-var',
          '--on-dim',
          '--outline',
          '--outline-2',
          '--rule',
          '--brand',
          '--on-brand',
          '--primary',
          '--on-primary',
          '--primary-c',
          '--on-primary-c',
          '--cat-dev',
          '--cat-dev-bg',
          '--cat-conv',
          '--cat-conv-bg',
          '--cat-doc',
          '--cat-doc-bg',
          '--error',
          '--error-bg',
          '--success',
          '--success-bg',
          '--star',
          '--font',
          '--mono',
        ];
        const styles = getComputedStyle(document.documentElement);
        return names.filter((name) => styles.getPropertyValue(name).trim() === '');
      });
      expect(missing, `${theme} theme is missing tokens`).toEqual([]);
    }
  });

  test('the command palette opens on the button and on the keyboard shortcut', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Search tools' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.keyboard.press('ControlOrMeta+k');
    await expect(dialog).toBeVisible();
  });

  test('the palette finds a tool and opens it', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('ControlOrMeta+k');

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox').or(dialog.locator('input')).first().fill('cron');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/tools\/cron-explainer/);
    await expect(page.locator('.head__title')).toHaveText('Cron Explainer');
  });

  test('footer links reach every top-level page', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('.footer');

    for (const [label, path] of [
      ['Guides', '/guides'],
      ['News', '/news'],
      ['About', '/about'],
      ['Contact', '/contact'],
      ['Privacy', '/privacy'],
    ] as const) {
      await footer.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator('h1')).toBeVisible();
    }
  });

  test('no page scrolls sideways at this viewport', async ({ page }) => {
    for (const path of ['/', '/guides', '/about', '/news', '/tools/json-formatter']) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });
});
