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

/**
 * The same window, given a file rather than typed text.
 *
 * Deliberately a local tool. This opened the workbook in Excel Viewer until it
 * became the one test in the suite that failed on a clean tree: Excel Viewer is
 * hosted, so the name it ended on only appeared once a Fly machine had woken,
 * converted the file and answered — and past the timeout that reads as the
 * handover having failed when nothing was wrong with it. CSV Viewer goes
 * through the same window and then parses the file here, so what is asserted
 * is the handover rather than someone else's cold start. `tools-files.spec.ts`
 * draws the same line, stopping hosted tools at upload and pre-flight.
 *
 * What carries a file across is `withEventReplay()`, not the file branch of
 * `PreHydrationInput`. Measured, because the wording used to imply otherwise:
 * stub that branch out and this still passes; disable the whole of
 * `PreHydrationInput` and this still passes while the text test above fails.
 * So the property under test is the one in the name — a file chosen early is
 * not lost — and not the belt-and-braces that also exists for it.
 */
test('a file chosen before a tool hydrates is not thrown away', async ({ page }) => {
  const watch = watchConsole(page);
  const release = await gateScripts(page);

  await page.goto('/tools/csv-viewer', { waitUntil: 'commit' });
  const input = page.locator('input[type="file"]').first();
  await expect(page.locator('.dropzone')).toBeVisible();
  await expectNotHydratedYet(page);

  await input.setInputFiles(fixture('sample.csv'));

  release();
  await expect(page.locator('[ngh]')).toHaveCount(0, { timeout: 45_000 });

  // Cells, not the file name: the bytes were read, not merely held on to.
  const grid = page.locator('table.grid');
  await expect(grid).toContainText('region', { timeout: 45_000 });
  await expect(grid).toContainText('1284');

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
