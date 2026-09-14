import { readFileSync } from 'node:fs';

import { expect, test, type JSHandle, type Page } from '@playwright/test';

import { expectClean, fixture, gotoTool, watchConsole } from './helpers';

/**
 * Dropping a file anywhere on the page. Real OS drags cannot be scripted, so
 * each test builds a DataTransfer in the page and dispatches the drag events
 * a browser would — the same path the handlers see.
 */
async function dataTransfer(page: Page, name: string, type: string): Promise<JSHandle> {
  const base64 = readFileSync(fixture(name)).toString('base64');
  return page.evaluateHandle(
    ([data, fileName, mime]) => {
      const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], fileName, { type: mime }));
      return transfer;
    },
    [base64, name, type],
  );
}

/**
 * Starts a drag and waits for the page to light up. Pages are prerendered, so
 * a drag fired the instant `goto` resolves can land before Angular has hydrated
 * and attached its listeners; the veil answering is the proof that it has.
 */
async function dragIn(page: Page, transfer: JSHandle, text: string): Promise<void> {
  await expect(async () => {
    await page.dispatchEvent('body', 'dragenter', { dataTransfer: transfer });
    await expect(page.getByRole('status').filter({ hasText: text })).toBeVisible({ timeout: 500 });
  }).toPass();
}

test('a PDF dropped on the home page opens in the PDF Viewer', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/');
  const transfer = await dataTransfer(page, 'sample.pdf', 'application/pdf');

  // The page lights up and names the destination while the drag is in flight.
  await dragIn(page, transfer, 'Drop to open in PDF Viewer');

  await page.dispatchEvent('h1', 'drop', { dataTransfer: transfer });
  await expect(page).toHaveURL(/\/tools\/pdf-viewer$/);
  await expect(page.getByText(/\b3\b/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('canvas, iframe, .pdf-preview').first()).toBeVisible();

  expectClean(watch);
});

test('a drop beside a tool’s zone still lands in that tool', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-organizer', 'PDF Organizer');
  const transfer = await dataTransfer(page, 'sample.pdf', 'application/pdf');

  await dragIn(page, transfer, 'Drop to add it here');
  await page.dispatchEvent('.head__title', 'drop', { dataTransfer: transfer });
  await expect(page.locator('.grid > *')).toHaveCount(3, { timeout: 60_000 });
  await expect(page).toHaveURL(/\/tools\/pdf-organizer$/);

  expectClean(watch);
});

test('a file no tool opens says so instead of leaving the site', async ({ page }) => {
  await page.goto('/about');
  const transfer = await dataTransfer(page, 'sample.csv', 'application/x-unknown');
  await page.evaluate((t) => {
    // Rename in place: the CSV bytes are handy, the extension must not match.
    const file = (t as DataTransfer).files[0];
    (t as DataTransfer).items.clear();
    (t as DataTransfer).items.add(new File([file], 'mystery.xyz', { type: '' }));
  }, transfer);

  await dragIn(page, transfer, 'Drop to open in the right tool');
  await page.dispatchEvent('h1', 'drop', { dataTransfer: transfer });
  await expect(page.getByText('Nothing here opens "mystery.xyz".')).toBeVisible();
  await expect(page).toHaveURL(/\/about$/);
});
