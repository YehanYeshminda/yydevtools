import { expect, test } from '@playwright/test';

import { GUIDES } from '../src/app/guides/guides.data';
import { expectClean, seedFavorites, watchConsole } from './helpers';

/**
 * The home "workbench": the left rail (filter, categories, favourites) and the
 * catalogue grid it drives. The redesign replaced a hero + chip row with this,
 * so every assertion here is about the new structure.
 */
test.describe('home workbench', () => {
  test('renders the rail, the heading and the full catalogue', async ({ page }) => {
    const watch = watchConsole(page);
    await page.goto('/');

    await expect(page.locator('.rail')).toBeVisible();
    await expect(page.locator('.work__title')).toContainText('All tools');

    const count = page.locator('.work__count');
    await expect(count).toBeVisible();
    const text = (await count.textContent()) ?? '';
    const [shown, total] = text
      .match(/(\d+)\s*\/\s*(\d+)/)!
      .slice(1)
      .map(Number);
    expect(shown).toBe(total);
    expect(await page.locator('.card').count()).toBe(shown);

    expectClean(watch);
  });

  test("the rail's privacy claim matches the catalogue", async ({ page }) => {
    await page.goto('/');
    const note = page.locator('.rail__note');
    const claim = (await note.textContent())!.match(/(\d+) of (\d+)/)!;
    const [local, total] = claim.slice(1).map(Number);

    // The catalogue is the source of truth; this line used to be typed by hand
    // and said "31 of 36" long after the catalogue had grown past it.
    const catalogTotal = Number(
      (await page.locator('.work__count').textContent())!.match(/\/\s*(\d+)/)![1],
    );
    expect(total).toBe(catalogTotal);
    expect(local).toBeLessThan(total);
    // The privacy story only holds while the hosted tools stay the minority.
    expect(local).toBeGreaterThan(total / 2);
  });

  test('the rail lists every category, and the totals add up to the catalogue', async ({
    page,
  }) => {
    await page.goto('/');
    const items = page.locator('.rail__item');
    await expect(items).toHaveCount(4); // All + three categories

    const counts = await items.locator('.rail__item-count').allTextContents();
    const [all, ...categories] = counts.map(Number);
    expect(categories.reduce((a, b) => a + b, 0)).toBe(all);
  });

  test('a category filter narrows the grid and retitles the page', async ({ page }) => {
    await page.goto('/');
    const total = Number(
      (await page.locator('.work__count').textContent())!.match(/\/\s*(\d+)/)![1],
    );

    await page.locator('.rail__item', { hasText: 'Documents' }).click();

    await expect(page.locator('.work__title')).toContainText('Documents');
    await expect(page).toHaveURL(/category=Document/);
    const shown = await page.locator('.card').count();
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(total);
    await expect(page.locator('.section')).toHaveCount(1);
  });

  test('the filter box narrows the grid live and the count follows', async ({ page }) => {
    await page.goto('/');
    await page.locator('.rail__input').fill('pdf');

    const cards = page.locator('.card');
    await expect(cards.first()).toBeVisible();
    const shown = await cards.count();
    expect(shown).toBeGreaterThan(3);
    await expect(page.locator('.work__count')).toContainText(`showing ${shown}`);

    // The filter reads the name *and* the description, so the invariant is
    // that the term is somewhere on every card left standing — not that every
    // one of them is called something PDF-shaped. Asserting the latter made
    // this fail the day a tool's description mentioned the PDF it produces.
    for (const card of await page.locator('.card').all()) {
      expect((await card.innerText()).toLowerCase()).toContain('pdf');
    }
  });

  test('a search with no matches shows the empty state and recovers', async ({ page }) => {
    await page.goto('/');
    await page.locator('.rail__input').fill('zzzzzzzz');

    const empty = page.locator('.empty');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('zzzzzzzz');
    await expect(page.locator('.card')).toHaveCount(0);

    await empty.getByRole('button', { name: /Clear/ }).click();
    await expect(page.locator('.card').first()).toBeVisible();
    await expect(page.locator('.rail__input')).toHaveValue('');
  });

  test('starring a tool adds it to the rail and survives a reload', async ({ page }) => {
    await page.goto('/');

    const card = page.locator('.card', { hasText: 'Cron Explainer' }).first();
    await card.getByRole('button', { name: /Add Cron Explainer to favorites/ }).click();

    const rail = page.locator('.rail__fav');
    await expect(rail).toBeVisible();
    await expect(rail.getByRole('link', { name: /Cron Explainer/ })).toBeVisible();

    await page.reload();
    await expect(
      page.locator('.rail__fav').getByRole('link', { name: /Cron Explainer/ }),
    ).toBeVisible();

    await card.getByRole('button', { name: /Remove Cron Explainer from favorites/ }).click();
    await expect(page.locator('.rail__fav')).toBeHidden();
  });

  test('a starred tool stays in its own category cell rather than being lifted out', async ({
    page,
  }) => {
    await seedFavorites(page, ['cron-explainer']);
    await page.goto('/');

    await expect(page.locator('.rail__fav')).toBeVisible();
    // One card only — the redesign dropped the separate favourites section.
    await expect(page.locator('.card', { hasText: 'Cron Explainer' })).toHaveCount(1);
    const section = page.locator('.section', {
      has: page.locator('.card', { hasText: 'Cron Explainer' }),
    });
    await expect(section.locator('.section__tag')).toHaveText('Developer');
  });

  test('a rail favourite opens its tool', async ({ page }) => {
    await seedFavorites(page, ['json-formatter']);
    await page.goto('/');

    await page
      .locator('.rail__fav')
      .getByRole('link', { name: /JSON Formatter/ })
      .click();
    await expect(page).toHaveURL(/\/tools\/json-formatter/);
  });

  test('every card links to a route that resolves', async ({ page }) => {
    await page.goto('/');
    const hrefs = await page
      .locator('.card__link')
      .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).getAttribute('href')!));
    expect(hrefs.length).toBeGreaterThan(30);

    for (const href of hrefs) {
      const response = await page.request.get(href!);
      expect(response.status(), `${href} responded ${response.status()}`).toBeLessThan(400);
    }
  });

  test('the guides teaser links through to the guides index', async ({ page }) => {
    await page.goto('/');
    const teaser = page.locator('.guides-teaser');
    await expect(teaser).toBeVisible();
    await expect(teaser.locator('.guides-teaser__card').first()).toBeVisible();

    // The teaser used to be GUIDES.slice(0, 3) — the same three articles for as
    // long as the page existed, and they were three of the only four guides
    // anyone ever opened. It now shows the six most recently updated, so the
    // count and the order are both the point of the section.
    const expected = [...GUIDES].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 6);
    await expect(teaser.locator('.guides-teaser__card')).toHaveCount(expected.length);
    await expect(teaser.locator('.guides-teaser__name')).toHaveText(
      expected.map((guide) => guide.title),
    );

    await teaser.getByRole('link', { name: /All \d+ guides/ }).click();
    await expect(page).toHaveURL(/\/guides$/);
  });

  test('the category deep link from a URL is honoured on first load', async ({ page }) => {
    await page.goto('/?category=Converter');
    await expect(page.locator('.work__title')).toContainText('Converters');
    await expect(page.locator('.rail__item--active')).toContainText('Converters');
  });

  test('the sticky rail clears the app bar when scrolled', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.rail__search')).toBeVisible();

    // Scroll far enough that the rail is fully pinned, then confirm its top
    // edge sits below the sticky header rather than behind it. Regression guard
    // for the rail's sticky `top` being smaller than the app bar's height.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const { railTop, headerBottom } = await page.evaluate(() => ({
      railTop: document.querySelector('.rail__search')!.getBoundingClientRect().top,
      headerBottom: document.querySelector('.appbar')!.getBoundingClientRect().bottom,
    }));
    expect(
      railTop,
      `rail (${railTop}) is tucked under the app bar (${headerBottom})`,
    ).toBeGreaterThanOrEqual(headerBottom);
  });
});
