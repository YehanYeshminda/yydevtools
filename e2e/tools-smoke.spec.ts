import { expect, test } from '@playwright/test';

import { TOOLS } from '../src/app/tools/tools.data';
import { expectClean, expectNoHorizontalOverflow, watchConsole } from './helpers';

/**
 * One pass over every tool in the catalogue.
 *
 * Deliberately shallow and deliberately exhaustive: it proves each of the 37
 * pages routes, renders its redesigned masthead with the right name, wires the
 * breadcrumb to its category, and boots without throwing. The per-tool
 * behaviour lives in tools-text.spec.ts and tools-files.spec.ts.
 */
const READY = TOOLS.filter((tool) => tool.ready);

test.describe('every tool page', () => {
  for (const tool of READY) {
    test(`${tool.slug} loads and identifies itself`, async ({ page }) => {
      const watch = watchConsole(page);
      await page.goto(`/tools/${tool.slug}`);

      // Masthead: name, description, icon, favourite toggle.
      await expect(page.locator('.head__title')).toHaveText(tool.name);
      await expect(page.locator('.head__sub')).not.toBeEmpty();
      await expect(page.locator('.head__icon ng-icon')).toBeVisible();
      await expect(page.getByRole('button', { name: new RegExp(`${tool.name} to favourites`) })).toBeVisible();

      // Breadcrumb: All tools / Category / This tool.
      const crumbs = page.locator('.breadcrumb');
      await expect(crumbs.getByRole('link', { name: 'All tools' })).toBeVisible();
      await expect(crumbs.getByRole('link', { name: tool.category })).toBeVisible();
      await expect(crumbs.locator('[aria-current="page"]')).toHaveText(tool.name);

      // The tool itself rendered something interactive.
      await expect(page.locator('.panel, app-code-editor, app-dropzone').first()).toBeVisible();

      // Each route carries its own SEO title. Several are deliberately written
      // for search rather than matching the catalogue name ("Image ↔ PDF" ships
      // as "Image to PDF & PDF to Image"), so the invariant is that the title
      // is branded, specific and not the shell's fallback.
      const title = await page.title();
      expect(title, `${tool.slug} has no branded title`).toMatch(/— YYDevTools$/);
      expect(title, `${tool.slug} still shows the fallback title`).not.toBe(
        'YYDevTools — Free developer utilities',
      );

      expectClean(watch);
    });
  }

  test('every tool page keeps its layout inside the viewport', async ({ page }) => {
    for (const tool of READY) {
      await page.goto(`/tools/${tool.slug}`);
      await expect(page.locator('.head__title')).toHaveText(tool.name);
      await expectNoHorizontalOverflow(page);
    }
  });

  test('the breadcrumb category link filters the home grid', async ({ page }) => {
    await page.goto('/tools/pdf-merge');
    await page.locator('.breadcrumb').getByRole('link', { name: 'Document' }).click();

    await expect(page).toHaveURL(/category=Document/);
    await expect(page.locator('.work__title')).toContainText('Documents');
  });

  test('favouriting from a tool page shows up on the home rail', async ({ page }) => {
    await page.goto('/tools/regex-tester');
    await page.getByRole('button', { name: /Add Regex Tester to favourites/ }).click();

    await page.goto('/');
    await expect(page.locator('.rail__fav').getByRole('link', { name: /Regex Tester/ })).toBeVisible();
  });
});
