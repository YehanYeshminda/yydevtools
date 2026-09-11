import { expect, test } from '@playwright/test';

import { setTheme } from './helpers';

/**
 * The custom cursors: a themed amber arrow by default, an amber crosshair
 * reticle on interactive elements, and the native I-beam left alone in text
 * fields. Both cursor images are baked SVGs, so they are identical in both
 * themes — the assertions run once, but the visibility rationale (a dark outline
 * baked into each) is what makes them work on light paper and dark alike.
 */

/** The computed `cursor` of a selector on the home page. */
async function cursorOf(page: import('@playwright/test').Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => getComputedStyle(el).cursor);
}

test('the page default is the custom arrow cursor', async ({ page }) => {
  await page.goto('/');
  const cursor = await page.evaluate(() => getComputedStyle(document.body).cursor);
  expect(cursor).toContain('data:image/svg+xml');
  // Hotspot 4 3 is the arrow's tip — distinguishes it from the reticle (14 14).
  expect(cursor).toContain('4 3');
});

test('interactive elements use the reticle, not the native pointer', async ({ page }) => {
  await page.goto('/');

  for (const selector of ['.rail__item', '.search-trigger', '.card__link', '.fav', '.nav__link']) {
    const cursor = await cursorOf(page, selector);
    expect(cursor, `${selector} did not get the reticle`).toContain('data:image/svg+xml');
    expect(cursor, `${selector} used the wrong hotspot`).toContain('14 14');
  }
});

test('text fields keep the native I-beam', async ({ page }) => {
  await page.goto('/');
  expect(await cursorOf(page, '.rail__input')).toBe('text');

  await page.goto('/tools/json-formatter');
  await expect(page.locator('.head__title')).toBeVisible();
  // The CodeMirror surface (and its textarea fallback) must stay text, not the
  // reticle — a crosshair over an editor reads as wrong.
  const editorCursor = await page
    .locator('.cm-content, textarea.editor__fallback')
    .first()
    .evaluate((el) => getComputedStyle(el).cursor);
  expect(editorCursor).toBe('text');
});

test('the cursor is identical in both themes (baked, not token-driven)', async ({ page }) => {
  await page.goto('/');

  await setTheme(page, 'light');
  const light = await cursorOf(page, '.rail__item');
  await setTheme(page, 'dark');
  const dark = await cursorOf(page, '.rail__item');

  expect(light).toBe(dark);
  expect(light).toContain('data:image/svg+xml');
});

test('the cursor SVGs decode to a real image', async ({ page }) => {
  await page.goto('/');
  const sizes = await page.evaluate(async () => {
    const css = getComputedStyle(document.body).cursor + getComputedStyle(document.querySelector('.card__link')!).cursor;
    const urls = [...css.matchAll(/url\("([^"]+)"/g)].map((m) => m[1]);
    const load = (src: string) =>
      new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(`${img.naturalWidth}x${img.naturalHeight}`);
        img.onerror = () => resolve('FAIL');
        img.src = src;
      });
    return Promise.all(urls.map(load));
  });
  expect(sizes.length).toBeGreaterThanOrEqual(2);
  for (const size of sizes) expect(size).not.toBe('FAIL');
});
