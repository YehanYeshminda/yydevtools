import { expect, test, type Page } from '@playwright/test';

import { UNHYDRATED, expectClean, fixture, gotoTool, watchConsole } from './helpers';

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
    await page.locator(UNHYDRATED).count(),
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
  await expect(page.locator(UNHYDRATED)).toHaveCount(0, { timeout: 45_000 });

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
 * Excel Viewer rather than a lighter tool, on the record that the loss went
 * with chunk size: measured against the unfixed app, hash-generator text and
 * the excel-viewer file were both lost where a csv-viewer file survived,
 * because `withEventReplay()` does rescue a file when the route chunk lands
 * quickly enough. Retargeting this at a small-chunk tool therefore costs the
 * coverage, and was tried and reverted.
 *
 * Be aware that this run does not reprove it. Stub `PreHydrationInput` out
 * altogether and this test still passes while the text test above fails, so
 * against `ng serve` over localhost the 3.7 MB chunk is still winning the race
 * that it loses in production. The tool is kept on the recorded measurement,
 * not on anything asserted here — see the separate question of what it would
 * take to make this fail.
 *
 * The hosted half is what made it flaky. It used to end on the name in the
 * summary bar, which appears only once a Fly machine has woken, converted the
 * workbook and answered, so a cold start read as the handover having failed.
 * Holding the conversion open drops the round trip and keeps the window:
 * `loading` and `name` are both set before the request, so `.loading` carrying
 * the file name is the file having reached the component.
 */
test('a file chosen before a tool hydrates is not thrown away', async ({ page }) => {
  const watch = watchConsole(page);
  const release = await gateScripts(page);

  // Held open, never answered. Everything under test happens before it.
  await page.route('**/api/excel/import', () => {});

  await page.goto('/tools/excel-viewer', { waitUntil: 'commit' });
  const input = page.locator('input[type="file"]').first();
  await expect(page.locator('.dropzone')).toBeVisible();
  await expectNotHydratedYet(page);

  await input.setInputFiles(fixture('sample.xlsx'));

  release();
  await expect(page.locator(UNHYDRATED)).toHaveCount(0, { timeout: 45_000 });

  await expect(page.locator('.loading')).toContainText('sample.xlsx', { timeout: 45_000 });

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
  await expect(page.locator(UNHYDRATED)).toHaveCount(0, { timeout: 45_000 });

  const queue = page.locator('.queue');
  await expect(queue).toContainText('sample.pdf', { timeout: 45_000 });
  // Settle, so a second delivery would have landed by now.
  await page.waitForTimeout(1_000);
  expect(await queue.getByText('sample.pdf').count()).toBe(1);

  expectClean(watch);
});

/**
 * A tool's long-form copy (intro, FAQ, related links) is prerendered and sits in
 * a `@defer (hydrate on interaction)` block, so a visitor who only uses the tool
 * never downloads it. It is one module holding every tool's copy — about 650 KB
 * of JS, 217 KB over the wire — and before the block was deferred every tool
 * page fetched it only to re-create text already on screen.
 *
 * The question text is read off the page, so the check does not rot as the copy
 * is edited; and the second half proves the detection can see the module at
 * all, so a pass in the first half is not vacuous.
 */
test('a tool page does not download its copy until you interact with it', async ({ page }) => {
  const bodies: Promise<string>[] = [];
  page.on('response', (response) => {
    if (/\.(m?js|ts)(\?|$)/.test(new URL(response.url()).pathname + '?')) {
      bodies.push(response.text().catch(() => ''));
    }
  });
  const shipped = async (text: string) => (await Promise.all(bodies)).some((b) => b.includes(text));

  await gotoTool(page, 'pdf-merge');
  // Under component HMR Angular loads every @defer block's dependencies
  // eagerly — measured: the copy lands in the same dev chunk as the masthead,
  // and the block never hydrates. playwright.config starts `ng serve --no-hmr`
  // for that reason, but `reuseExistingServer` will happily attach to a plain
  // `npm start` someone already has open, and then this cannot pass.
  test.skip(
    // Component HMR fetches `/@ng/component?c=…` for every component it
    // tracks; `--no-hmr` still loads `/@vite/client`, so that is no signal.
    await page.evaluate(() =>
      performance.getEntriesByType('resource').some((e) => e.name.includes('/@ng/component')),
    ),
    'dev server: HMR makes @defer eager',
  );
  const question = (await page.locator('.tc__q').first().textContent())!.trim();
  expect(question.length).toBeGreaterThan(10);
  await page.waitForTimeout(2_000); // past `on idle`, which must not fire while dehydrated
  expect(await shipped(question), 'the copy was downloaded without any interaction').toBe(false);

  await page.locator('.tc__q').first().click();
  await expect.poll(() => shipped(question), { timeout: 15_000 }).toBe(true);

  // The block's links are router links once it hydrates: following one is a
  // client-side navigation, not a page load. And on a page reached that way
  // there is no server-rendered copy to keep, so the block has to render
  // itself — through the `on idle` the compiler adds to any @defer without a
  // regular trigger. (A hidden tab never fires requestIdleCallback, so there
  // it waits until the tab is shown.)
  await page.evaluate(() => ((window as { stayed?: boolean }).stayed = true));
  const related = page.locator('.tc__related a[href^="/tools/"]').first();
  const next = (await related.getAttribute('href'))!;
  await related.click();
  await expect(page).toHaveURL(next);
  expect(await page.evaluate(() => (window as { stayed?: boolean }).stayed)).toBe(true);
  await expect(page.locator('.tc__faq')).toBeVisible({ timeout: 15_000 });
});
