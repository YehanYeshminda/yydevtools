import { expect, test, type Page } from '@playwright/test';

import { expectClean, fixture, watchConsole } from './helpers';

/**
 * Input given to a tool before its code arrives.
 *
 * Every tool route is prerendered, so the controls are on screen and usable
 * from the first frame while the component bound to them is still coming down
 * as a lazy chunk. Anything done in that window used to vanish: a chosen file
 * reached an input nobody was listening to, and typed text was overwritten the
 * moment the component hydrated and wrote its own empty signal to `[value]`.
 * No spinner, no error — it simply read as a broken tool.
 *
 * These tests deliberately do NOT use `gotoTool` or `uploadFiles`, because
 * those wait for hydration first and so can never see the window at all. They
 * hold every script back instead, which makes the window as wide as needed.
 */

/** Holds back every script until `release` is called, and reports on it. */
async function gateScripts(page: Page): Promise<() => void> {
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => (open = resolve));
  await page.route(
    (url) => url.pathname.endsWith('.js') || url.pathname.endsWith('.mjs'),
    async (route) => {
      await gate;
      await route.continue();
    },
  );
  return open;
}

/** Fails unless the page really is still un-hydrated. */
async function expectNotHydratedYet(page: Page): Promise<void> {
  expect(
    await page.locator('[ngh]').count(),
    'the page had already hydrated, so this proves nothing',
  ).toBeGreaterThan(0);
}

test('text typed before a tool hydrates is not thrown away', async ({ page }) => {
  const watch = watchConsole(page);
  const release = await gateScripts(page);

  await page.goto('/tools/hash-generator', { waitUntil: 'commit' });
  const input = page.locator('#hash-input');
  await expect(input).toBeVisible();
  await expectNotHydratedYet(page);

  await input.fill('abc');

  release();
  await expect(page.locator('[ngh]')).toHaveCount(0, { timeout: 45_000 });

  // Still in the box, and the tool acted on it rather than just holding it.
  await expect(input).toHaveValue('abc');
  await expect(
    page.getByText('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'),
  ).toBeVisible({ timeout: 45_000 });

  expectClean(watch);
});

test('a file chosen before a tool hydrates is not thrown away', async ({ page }) => {
  const watch = watchConsole(page);
  const release = await gateScripts(page);

  await page.goto('/tools/excel-viewer', { waitUntil: 'commit' });
  const input = page.locator('input[type="file"]').first();
  await expect(page.locator('.dropzone')).toBeVisible();
  await expectNotHydratedYet(page);

  await input.setInputFiles(fixture('sample.xlsx'));

  release();
  await expect(page.locator('[ngh]')).toHaveCount(0, { timeout: 45_000 });

  await expect(page.getByText(/sample.xlsx/)).toBeVisible({ timeout: 60_000 });

  expectClean(watch);
});

/**
 * The handed-back input must not arrive twice.
 *
 * `withEventReplay()` may already have delivered the same event, so a box
 * whose value survived is left alone and a file input is only re-fired while
 * it is still holding files. PDF Merge is the tool that can show the
 * difference: it queues what it is given, so a file delivered twice would be
 * two rows rather than one.
 */
test('a file handed back is queued once, not twice', async ({ page }) => {
  const watch = watchConsole(page);
  const release = await gateScripts(page);

  await page.goto('/tools/pdf-merge', { waitUntil: 'commit' });
  await expect(page.locator('.dropzone')).toBeVisible();
  await expectNotHydratedYet(page);

  await page.locator('input[type="file"]').first().setInputFiles(fixture('sample.pdf'));

  release();
  await expect(page.locator('[ngh]')).toHaveCount(0, { timeout: 45_000 });

  const queue = page.locator('.queue');
  await expect(queue).toContainText('sample.pdf', { timeout: 45_000 });
  // Settle, so a second delivery would have landed by now.
  await page.waitForTimeout(1_000);
  expect(await queue.getByText('sample.pdf').count()).toBe(1);

  expectClean(watch);
});
