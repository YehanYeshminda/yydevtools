import { expect, test } from '@playwright/test';

import { TOOLS } from '../src/app/tools/tools.data';
import { expectNoHorizontalOverflow, fixture, gotoTool } from './helpers';

/**
 * Runs under the `mobile` project (Pixel 7). The redesign's workbench layout
 * collapses the left rail at narrow widths, and the split-pane tools stack —
 * both are easy to break and invisible on a desktop run.
 */

test('the header collapses to the menu button and still reaches every page', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Navigation menu' })).toBeVisible();
  await page.getByRole('button', { name: 'Navigation menu' }).click();

  const menu = page.getByRole('menu', { name: 'Primary' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Guides' }).click();
  await expect(page).toHaveURL(/\/guides$/);
});

test('the home workbench stacks without sideways scroll', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // The rail's filter must still be usable at this width.
  await page.locator('.rail__input').fill('json');
  await expect(page.locator('.card').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('the split-pane tools stack rather than squeeze', async ({ page }) => {
  for (const slug of ['text-diff', 'markdown-editor', 'json-formatter', 'code-formatter']) {
    await page.goto(`/tools/${slug}`);
    await expect(page.locator('.head__title')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test('a tool page keeps its masthead and controls inside the viewport', async ({ page }) => {
  await page.goto('/tools/pdf-merge');
  await expect(page.locator('.head__title')).toBeVisible();
  await expect(page.locator('app-dropzone, input[type="file"]').first()).toBeAttached();
  await expectNoHorizontalOverflow(page);
});

test('the category pages collapse to one column without sideways scroll', async ({ page }) => {
  for (const path of ['/developer-tools', '/converter-tools', '/document-tools']) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    const columns = await page
      .locator('.tools')
      .evaluate((list) => getComputedStyle(list).gridTemplateColumns.split(' ').length);
    expect(columns, path).toBe(1);
    await expectNoHorizontalOverflow(page);
  }
});

/**
 * The desktop smoke pass runs the same check at 1440 px, where nothing below
 * 720 px applies. The Invoice Generator's visually hidden "Remove" heading
 * (position: absolute) escaped its scrolling table here and made the page
 * 446 px wide on a 375 px phone, with no desktop run able to see it.
 */
test('every tool page keeps its layout inside a phone screen', async ({ page }) => {
  test.slow();
  for (const tool of TOOLS.filter((entry) => entry.ready)) {
    await page.goto(`/tools/${tool.slug}`);
    await expect(page.locator('.head__title')).toHaveText(tool.name);
    await expectNoHorizontalOverflow(page);
  }
});

/**
 * Its controls only appear once an image is loaded. The quality slider had
 * width: 100% on top of Material's 8 px side margins, so it and its range
 * input overhung the column and the page scrolled sideways.
 */
test('the image compressor fits a phone once an image is loaded', async ({ page }) => {
  await gotoTool(page, 'image-compressor', 'Image Compressor');
  await page.locator('input[type="file"]').first().setInputFiles(fixture('sample.jpg'));
  await expect(page.locator('mat-slider')).toBeVisible({ timeout: 30_000 });
  await expectNoHorizontalOverflow(page);
});
