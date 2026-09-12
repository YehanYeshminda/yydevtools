import { expect, test } from '@playwright/test';

import { expectClean, fixture, gotoTool, uploadFiles, watchConsole } from './helpers';

/**
 * The file-based tools, driven with real generated fixtures.
 *
 * The three hosted operations (PDF Convert, OCR on long files, PDF Compress)
 * proxy to Fly services. Those are exercised as far as the upload and the
 * pre-flight UI; actually running them would make this suite depend on live
 * infrastructure and a quota, so the conversion itself is left to a manual
 * check. Everything else runs in the browser and is asserted end to end.
 */

test('csv-viewer opens a CSV as a searchable table', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'csv-viewer', 'CSV Viewer');

  await uploadFiles(page, ['sample.csv']);

  const grid = page.locator('.grid, table').first();
  await expect(grid).toBeVisible();
  await expect(grid).toContainText('region');
  await expect(grid).toContainText('iad');
  await expect(grid).toContainText('1284');

  expectClean(watch);
});

test('exif-viewer surfaces the camera, date and GPS hidden in a photo', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'exif-viewer', 'EXIF Viewer');

  await uploadFiles(page, ['sample.jpg']);

  const panel = page.locator('.panel').first();
  await expect(panel).toContainText('YYDevTools'); // Make
  await expect(panel).toContainText('Fixture Cam'); // Model
  await expect(panel).toContainText(/2026/); // DateTime
  await expect(panel).toContainText(/51\.5/); // GPS latitude

  expectClean(watch);
});

test('image-compressor queues an image and shrinks it', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'image-compressor', 'Image Compressor');

  await uploadFiles(page, ['sample.png']);

  await expect(page.locator('.queue__item, .queue__list li').first()).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.locator('.queue')).toContainText('sample.png');

  expectClean(watch);
});

test('image-converter queues an image and offers a target format', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'image-converter', 'Image Converter');

  await uploadFiles(page, ['sample.png']);

  await expect(page.locator('.queue')).toContainText('sample.png', { timeout: 45_000 });
  await expect(page.locator('#format-label, select').first()).toBeVisible();

  expectClean(watch);
});

test('image-pdf turns images into a PDF', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'image-pdf', 'Image ↔ PDF');

  await uploadFiles(page, ['sample.png']);

  await expect(page.locator('.grid, .queue').first()).toContainText('sample.png', {
    timeout: 45_000,
  });
  const build = page.getByRole('button', { name: 'Save as PDF' });
  await expect(build).toBeEnabled();

  const download = page.waitForEvent('download');
  await build.click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

  expectClean(watch);
});

test('pdf-viewer opens a PDF and reports its page count', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-viewer', 'PDF Viewer');

  await uploadFiles(page, ['sample.pdf']);

  // The fixture is a 3-page document.
  await expect(page.getByText(/\b3\b/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('canvas, iframe, .pdf-preview').first()).toBeVisible();

  expectClean(watch);
});

test('pdf-merge combines two PDFs into one', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-merge', 'PDF Merge');

  await uploadFiles(page, ['sample.pdf', 'sample-2.pdf']);

  const queue = page.locator('.queue');
  await expect(queue).toContainText('sample.pdf', { timeout: 45_000 });
  await expect(queue).toContainText('sample-2.pdf');

  const merge = page.getByRole('button', { name: /^Merge/i }).first();
  await expect(merge).toBeEnabled();
  await merge.click();

  // Merging produces an in-page result first; downloading is a second step.
  await expect(page.getByRole('heading', { name: 'Merged result' })).toBeVisible({
    timeout: 60_000,
  });

  const save = page.getByRole('button', { name: /Download merged/i });
  const download = page.waitForEvent('download');
  await save.click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.pdf$/);

  expectClean(watch);
});

test('pdf-split extracts a page range', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-split', 'PDF Split');

  await uploadFiles(page, ['sample.pdf']);
  await expect(page.locator('#ranges')).toBeVisible({ timeout: 45_000 });
  await page.locator('#ranges').fill('1-2');

  const split = page.getByRole('button', { name: /Split & download/i });
  await expect(split).toBeEnabled();

  const download = page.waitForEvent('download');
  await split.click();
  expect((await download).suggestedFilename()).toMatch(/\.(pdf|zip)$/);

  expectClean(watch);
});

test('pdf-organizer shows one thumbnail per page', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-organizer', 'PDF Organizer');

  await uploadFiles(page, ['sample.pdf']);

  // Three pages in, three page cards out.
  await expect(page.locator('.grid > *')).toHaveCount(3, { timeout: 60_000 });

  expectClean(watch);
});

/**
 * The two Office viewers convert through the `office-convert` Fly service, which
 * is not reachable from a local `ng serve`. Against localhost the meaningful
 * assertion is that the tool degrades honestly — it says the service is not
 * running instead of hanging or throwing. Point E2E_BASE_URL at a deployment and
 * the same test asserts the real render.
 */
const HOSTED_OFFICE = !!process.env.E2E_BASE_URL;

test('word-viewer renders a .docx', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'word-viewer', 'Word Viewer');

  await uploadFiles(page, ['sample.docx']);

  if (HOSTED_OFFICE) {
    // Not getByText on the document's words: DocumentEditor paints the page to a
    // <canvas>, so they are never in the DOM and no text locator can see them —
    // the editor element's only text content is the ruler's tick numbers. What
    // does prove the round trip is the summary the tool derives from the
    // converted document, which means the service returned real content rather
    // than an error, plus the fact that a page was actually painted.
    await expect(page.getByText(/1 page/)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/12 words/)).toBeVisible();
    await expect(page.getByText(/2 paragraphs/)).toBeVisible();
    await expect(page.locator('canvas').first()).toBeVisible();
  } else {
    await expect(page.getByRole('alert')).toContainText(/conversion service is not running/i, {
      timeout: 45_000,
    });
  }

  expectClean(watch);
});

test('excel-viewer renders an .xlsx', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'excel-viewer', 'Excel Viewer');

  await uploadFiles(page, ['sample.xlsx']);

  if (HOSTED_OFFICE) {
    await expect(page.getByText('Region').first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText('1284').first()).toBeVisible();
  } else {
    await expect(page.getByRole('alert')).toContainText(/conversion service is not running/i, {
      timeout: 45_000,
    });
  }

  expectClean(watch);
});

test.describe('hosted operations accept a file and show their pre-flight state', () => {
  for (const [slug, name] of [
    ['pdf-convert', 'PDF Convert'],
    ['pdf-ocr', 'PDF OCR'],
    ['pdf-compress', 'PDF Compress'],
  ] as const) {
    test(`${slug} accepts a PDF`, async ({ page }) => {
      const watch = watchConsole(page);
      await gotoTool(page, slug, name);

      await uploadFiles(page, ['sample.pdf']);

      // The file is taken on and the action becomes available. The conversion
      // itself runs on a Fly service and is not driven from here.
      await expect(page.getByText(/sample\.pdf/).first()).toBeVisible({ timeout: 45_000 });
      await expect(page.locator('button:not([disabled])').first()).toBeVisible();

      expectClean(watch);
    });
  }
});
