import { expect, test } from '@playwright/test';

import { GUIDES, GUIDES_BY_TOOL } from '../src/app/guides/guides.data';
import { expectClean, watchConsole } from './helpers';

/** Guides, news and the static pages — everything that is prose rather than UI. */

test('guides index lists every guide and filters by category', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/guides');

  await expect(page.locator('h1')).toBeVisible();
  const cards = page.locator('a[href^="/guides/"]');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(GUIDES.length);

  expectClean(watch);
});

test('a guide article renders its body, and links back', async ({ page }) => {
  const watch = watchConsole(page);
  const guide = GUIDES[0];
  await page.goto(`/guides/${guide.slug}`);

  await expect(page.locator('h1')).toContainText(guide.title);
  await expect(page.locator('article, .prose, main').first()).not.toBeEmpty();
  await expect(page.locator('.breadcrumb, nav[aria-label="Breadcrumb"]').first()).toBeVisible();

  expectClean(watch);
});

test('every guide route resolves', async ({ page }) => {
  for (const guide of GUIDES) {
    const response = await page.request.get(`/guides/${guide.slug}`);
    expect(response.status(), `${guide.slug} responded ${response.status()}`).toBeLessThan(400);
  }
});

test('news page renders without error', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/news');
  await expect(page.locator('h1')).toBeVisible();
  expectClean(watch);
});

for (const [path, heading] of [
  ['/about', /About|Thirty|tools/i],
  ['/privacy', /Privacy/i],
  ['/contact', /Contact/i],
] as const) {
  test(`${path} renders its heading and content`, async ({ page }) => {
    const watch = watchConsole(page);
    await page.goto(path);
    await expect(page.locator('h1')).toContainText(heading);
    expectClean(watch);
  });
}

test('an unknown route shows the not-found page rather than crashing', async ({ page }) => {
  await page.goto('/this-route-does-not-exist');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('body')).toContainText(/not found|404|doesn.t exist/i);
});

test('every tool a guide covers links back to that guide', async ({ page }) => {
  // The link graph used to run one way. Twenty-five guides pointed at the
  // tools; not one of the sixty-eight tool pages pointed back, so 16,775 words
  // were reachable only from the guides index and 21 of the 25 had never been
  // opened. This asserts the rendered HTML, not the data, because the link is
  // worth nothing to a crawler unless it is in the prerendered page.
  const pairs = Object.entries(GUIDES_BY_TOOL);
  expect(pairs.length).toBeGreaterThan(40);

  for (const [tool, guides] of pairs) {
    const response = await page.request.get(`/tools/${tool}`);
    expect(response.status(), `/tools/${tool} responded ${response.status()}`).toBeLessThan(400);
    const html = await response.text();
    for (const guide of guides) {
      expect(html, `/tools/${tool} does not link to /guides/${guide.slug}`).toContain(
        `href="/guides/${guide.slug}"`,
      );
    }
  }
});
