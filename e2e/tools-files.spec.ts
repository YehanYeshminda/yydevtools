import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import QRCode from 'qrcode';

import { EditablePdf } from '../src/app/core/pdf-edit/document';
import { OPEN_IN_SLUGS } from '../src/app/core/open-in';
import {
  expectClean,
  fixture,
  gotoTool,
  uploadFiles,
  waitForHydration,
  watchConsole,
} from './helpers';

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

test('document-scanner straightens a photo and builds a PDF', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'document-scanner', 'Document Scanner');

  await uploadFiles(page, ['sample-photo.jpg']);
  await expect(page.getByTestId('scan-result')).toBeVisible({ timeout: 45_000 });
  // The default corners sit 4% inside a 640×480 photo, so the scan is 92% of it.
  await expect(page.getByTestId('scan-size')).toContainText('589 × 442 px');

  // Dragging the top-left corner out to the photo's edge lengthens the top and
  // left edges (now slightly diagonal), so the scan grows to about 96% of the photo.
  const handle = page.getByRole('button', { name: 'Drag the top-left corner' });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 80, box.y - 60, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('scan-size')).toContainText('615 × 462 px', { timeout: 45_000 });

  await page.getByRole('button', { name: 'Greyscale' }).click();
  await expect(page.getByTestId('scan-size')).not.toContainText('updating', { timeout: 45_000 });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download PDF/ }).click();
  expect((await download).suggestedFilename()).toBe('sample-photo-scanned.pdf');

  // The finished PDF can be carried straight into OCR.
  await page.getByTestId('next-step').getByRole('button', { name: 'Make it searchable' }).click();
  await expect(page).toHaveURL(/\/tools\/pdf-ocr/);
  await expect(page.getByText(/sample-photo-scanned\.pdf · 1 page/)).toBeVisible({
    timeout: 45_000,
  });

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

  // Deleting is one click and undoable; the page returns to where it was.
  await page.getByRole('button', { name: 'Delete Page 1 of sample.pdf' }).click();
  await expect(page.locator('.grid > *')).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.grid > *')).toHaveCount(3);
  await expect(page.locator('.grid > *').first()).toHaveAttribute(
    'aria-label',
    'Page 1 of sample.pdf, position 1 of 3',
  );

  expectClean(watch);
});

test('favicon-generator renders the full icon set and zips it', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'favicon-generator', 'Favicon Generator');

  await uploadFiles(page, ['sample-photo.jpg']);
  await expect(page.getByTestId('icon-preview')).toHaveCount(7, { timeout: 60_000 });

  // The head snippet follows the colour picked, and the short name follows the name.
  await page.locator('#fav-name').fill('Bakery Orders Tracker');
  await expect(page.locator('#fav-short')).toHaveValue('Bakery');
  await expect(page.getByTestId('head-snippet')).toContainText('rel="manifest"');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download ZIP' }).click();
  expect((await download).suggestedFilename()).toBe('sample-photo-favicons.zip');

  expectClean(watch);
});

/**
 * Whether there is a Worker in front of whatever this suite is pointed at.
 *
 * Several tools do their real work through `/api/*` — the Office viewers, the
 * certificate decoder, PDF protect and unlock. A bare `ng serve` has no Worker
 * and therefore no `/api`, and against that the meaningful assertion is that
 * the tool degrades honestly: it says the service is not running instead of
 * hanging or throwing. Against a deployment the same test asserts the real
 * result.
 *
 * Asked of the server rather than inferred from E2E_BASE_URL being set, which
 * was the old test and was wrong the moment that variable pointed at a local
 * dev server on a spare port — seven tests then demanded a service that was
 * never there and failed for the environment rather than for the code. The
 * probe runs once per worker process and is shared by every test in it.
 *
 * `/api/warm` is a plain GET that answers in JSON. The content type is what is
 * checked: a dev server answers an unknown path with the prerendered 404 page,
 * which is HTML and, on some setups, a 200.
 */
let apiProbe: Promise<boolean> | null = null;

function hostedApi(request: APIRequestContext): Promise<boolean> {
  apiProbe ??= request
    .get('/api/warm?service=office', { timeout: 30_000 })
    .then((response) => {
      const type = response.headers()['content-type'] ?? '';
      return response.ok() && type.includes('json');
    })
    .catch(() => {
      // A thrown request is a blip, not an answer. Forget it, so the next test
      // asks again rather than running a whole worker's tests in the degraded
      // branch because one fetch happened to fail.
      apiProbe = null;
      return false;
    });
  return apiProbe;
}

test('word-viewer renders a .docx', async ({ page, request }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'word-viewer', 'Word Viewer');

  await uploadFiles(page, ['sample.docx']);

  if (await hostedApi(request)) {
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

test('excel-viewer renders an .xlsx', async ({ page, request }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'excel-viewer', 'Excel Viewer');

  await uploadFiles(page, ['sample.xlsx']);

  if (await hostedApi(request)) {
    await expect(page.getByText('Region').first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText('1284').first()).toBeVisible();
  } else {
    await expect(page.getByRole('alert')).toContainText(/conversion service is not running/i, {
      timeout: 45_000,
    });
  }

  expectClean(watch);
});

test('image-resize crops, resizes and downloads', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'image-resize', 'Image Resizer & Cropper');

  await uploadFiles(page, ['sample-photo.jpg']);
  await expect(page.getByText(/sample-photo\.jpg · 640 × 480 px/)).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByTestId('result-size')).toContainText('640 × 480 px', {
    timeout: 45_000,
  });

  // A square crop, then a 200 px output: the result follows both.
  await page.getByRole('button', { name: 'Square' }).click();
  await expect(page.locator('#crop-w')).toHaveValue('480');
  await page.locator('#out-w').fill('200');
  await page.locator('#out-w').dispatchEvent('change');
  await expect(page.getByTestId('result-size')).toContainText('200 × 200 px', {
    timeout: 45_000,
  });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toBe('sample-photo-200x200.jpg');

  expectClean(watch);
});

test('pdf-watermark stamps text and page numbers with a live preview', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-watermark', 'PDF Watermark & Page Numbers');

  await uploadFiles(page, ['sample.pdf']);
  await expect(page.getByText(/sample\.pdf · 3 pages/)).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('app-pdf-preview iframe')).toBeVisible({ timeout: 45_000 });

  await page.getByLabel('Text', { exact: true }).fill('DRAFT');
  await page.locator('#pn-on').check();
  await expect(page.getByLabel('Style')).toBeEnabled();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  expect((await download).suggestedFilename()).toBe('sample-stamped.pdf');

  // The finished file is carried into the next tool without a second upload.
  await page.getByTestId('next-step').getByRole('button', { name: 'Add a password' }).click();
  await expect(page).toHaveURL(/\/tools\/pdf-protect/);
  await expect(page.getByText(/sample-stamped\.pdf · 3 pages/)).toBeVisible({ timeout: 45_000 });

  expectClean(watch);
});

test('pdf-form-fill lists the fields, previews and downloads the filled form', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-form-fill', 'PDF Form Fill & Flatten');

  await uploadFiles(page, ['sample-form.pdf']);
  await expect(page.getByText(/sample-form\.pdf · 1 page .* 5 fields/)).toBeVisible({
    timeout: 45_000,
  });

  await page.getByLabel('Full name').fill('Ada Lovelace');
  await page.getByLabel('agree').check();
  await page.getByLabel('Blue').check();
  await page.getByLabel('size').selectOption('Large');
  await expect(page.locator('app-pdf-preview iframe')).toBeVisible({ timeout: 45_000 });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download filled PDF' }).click();
  expect((await download).suggestedFilename()).toBe('sample-form-filled.pdf');

  expectClean(watch);
});

test('pdf-redact finds a phrase on every page and downloads the rebuilt file', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-redact', 'Redact PDF');

  await uploadFiles(page, ['sample.pdf']);
  await expect(page.getByText(/sample\.pdf · 3 pages/)).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('.sheet__page')).toBeVisible({ timeout: 45_000 });

  await page.locator('#redact-query').fill('quick brown');
  await page.getByRole('button', { name: 'Find' }).click();
  await expect(page.getByTestId('found')).toContainText('3 matches on 3 pages', {
    timeout: 45_000,
  });
  await expect(page.getByTestId('box-count')).toContainText('3 boxes on 3 pages');
  await expect(page.locator('.box')).toHaveCount(1); // only the current page's box is shown

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Redact & download/ }).click();
  expect((await download).suggestedFilename()).toBe('sample-redacted.pdf');

  expectClean(watch);
});

/** Downloads what the editor currently holds and opens it for reading. */
async function saveAndOpen(page: Page): Promise<EditablePdf> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save & download/ }).click();
  return EditablePdf.open(new Uint8Array(readFileSync(await (await download).path())));
}

/**
 * PDF Editor is the one tool here that rewrites a page rather than adding to it,
 * so the assertion has to be made on the saved bytes: the run is read back out
 * of the downloaded file with the same reader the tool edits with. A test that
 * only watched the screen would pass just as happily on an overlay.
 */
test('pdf-edit rewrites a line and the saved file really says the new words', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-edit', 'PDF Editor');

  await uploadFiles(page, ['sample.pdf']);
  await expect(page.getByText(/sample\.pdf · 3 pages/)).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('.sheet__page')).toBeVisible({ timeout: 45_000 });

  // Every run of text on the page is a button carrying what it says.
  const heading = page.getByRole('button', { name: 'Annual Report', exact: true });
  await expect(heading).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('button', { name: 'Page 1 of 3', exact: true })).toBeVisible();

  await heading.click();
  const editor = page.getByTestId('run-editor');
  await expect(editor).toHaveValue('Annual Report');
  await editor.fill('Interim Report');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();

  await expect(page.getByTestId('change-count')).toHaveText('1 change');
  await expect(page.getByRole('button', { name: 'Interim Report', exact: true })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save & download/ }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('sample-edited.pdf');

  const edited = await EditablePdf.open(new Uint8Array(readFileSync(await saved.path())));
  expect(edited.runs(0).map((run) => run.text)).toEqual([
    'Interim Report',
    'Page 1 of 3',
    'The quick brown fox jumps over the lazy dog.',
  ]);

  expectClean(watch);
});

test('pdf-edit removes a line, adds one, and refuses what no font can write', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-edit', 'PDF Editor');

  await uploadFiles(page, ['sample.pdf']);
  await expect(page.locator('.sheet__page')).toBeVisible({ timeout: 45_000 });

  // Nothing in a Standard 14 font can draw these, and the tool says so rather
  // than writing a line of blanks.
  await page.getByRole('button', { name: 'Page 1 of 3', exact: true }).click();
  await page.getByTestId('run-editor').fill('ページ');
  await expect(page.getByTestId('plan-note')).toContainText('no way to write');
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByTestId('change-count')).toHaveText('1 change');

  await page.getByRole('button', { name: 'Add text' }).click();
  await page.getByTestId('sheet').click({ position: { x: 60, y: 300 } });
  const added = page.getByLabel('Text you added');
  await expect(added).toHaveValue('New text');
  await added.fill('Added by hand');
  await expect(page.getByTestId('change-count')).toHaveText('2 changes');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save & download/ }).click();
  const edited = await EditablePdf.open(
    new Uint8Array(readFileSync(await (await download).path())),
  );
  const text = edited.runs(0).map((run) => run.text);
  expect(text).toContain('Added by hand');
  expect(text).not.toContain('Page 1 of 3');

  expectClean(watch);
});

/**
 * The case the tool exists to get right, on a file a browser really produced:
 * every font in it is subsetted, so the digits needed to change an invoice
 * number are simply not in the file. The edit still has to land, and the tool
 * still has to say what it did.
 */
test('pdf-edit re-sets a line when the font in the file has no glyph for it', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-edit', 'PDF Editor');

  await uploadFiles(page, ['sample-subset.pdf']);
  await expect(page.locator('.sheet__page')).toBeVisible({ timeout: 45_000 });

  await page.getByRole('button', { name: 'INV-2044', exact: true }).click();
  const editor = page.getByTestId('run-editor');
  await editor.fill('INV-9137');
  // Georgia-Bold is in this file only as the glyphs it already uses.
  await expect(page.getByTestId('plan-note')).toContainText('re-set in Times-Bold');

  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByTestId('change-count')).toHaveText('1 change');

  // A second edit in the same session, this one on a word the file's own
  // Georgia can spell, so the two paths are exercised in one document.
  await page.getByRole('button', { name: 'Consulting', exact: true }).click();
  await page.getByTestId('run-editor').fill('Consultancy');
  // Its own font can spell it, so the only thing worth saying is the length.
  await expect(page.getByTestId('plan-note')).toHaveText(/longer than the space/);
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByTestId('change-count')).toHaveText('2 changes');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save & download/ }).click();
  const edited = await EditablePdf.open(
    new Uint8Array(readFileSync(await (await download).path())),
  );
  const runs = edited.runs(0);
  expect(runs.map((run) => run.text)).toContain('INV-9137');
  // The one its own font could write kept that font.
  expect(runs.find((run) => run.text === 'Consultancy')?.family).toBe('Georgia');
  // Everything else is still in the typeface it started in.
  expect(runs.find((run) => run.text === 'Acme Industries')?.family).toBe('Georgia-Italic');

  expectClean(watch);
});

/**
 * The three things that make the editor usable without downloading to find
 * out: the page really zooms, the preview is the edited document, and Compare
 * puts the original back. A picture goes on at the end, because that is the
 * one addition whose bytes have to reach the file.
 */
test('pdf-edit zooms into the page, shows the change before saving, and takes a picture', async ({
  page,
}) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-edit', 'PDF Editor');

  await uploadFiles(page, ['sample.pdf']);
  const sheet = page.locator('.sheet__page');
  await expect(sheet).toBeVisible({ timeout: 45_000 });

  /**
   * Clicks a zoom button until the label says what it should. Each click waits
   * for the label to move first: reading it again straight away can still see
   * the old value, and the extra click then overshoots (50% became 25% in CI).
   */
  const zoomTo = async (label: string, button: string) => {
    const zoom = page.getByTestId('zoom');
    for (let step = 0; step < 12; step++) {
      const current = (await zoom.textContent())?.trim();
      if (current === label) break;
      await page.getByRole('button', { name: button }).click();
      await expect(zoom).not.toHaveText(current ?? '');
    }
    await expect(zoom).toHaveText(label);
  };
  const shownWidth = () => page.getByTestId('sheet-outer').evaluate((node) => node.clientWidth);
  const drawnWidth = () => sheet.evaluate((node) => (node as HTMLImageElement).naturalWidth);

  await zoomTo('50%', 'Zoom out');
  const small = { shown: await shownWidth(), drawn: await drawnWidth() };

  await zoomTo('200%', 'Zoom in');
  // Drawn again at the larger scale rather than stretched: a CSS-only zoom
  // would leave the raster exactly where it was and the type would go soft.
  await expect.poll(drawnWidth).toBeGreaterThan(small.drawn);
  expect((await shownWidth()) / small.shown).toBeCloseTo(4, 1);

  await page.getByRole('button', { name: 'Fit width' }).click();
  const shownPage = () => sheet.getAttribute('src');
  const asItArrived = await shownPage();

  const heading = page.getByRole('button', { name: 'Annual Report', exact: true });
  await heading.click();
  await page.getByTestId('run-editor').fill('Interim Report');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  // No download, no second tab: the page on screen is the edited document.
  await expect.poll(shownPage).not.toBe(asItArrived);

  await page.getByTestId('compare').click();
  await expect(page.getByText('This is the file as it arrived')).toBeVisible();
  await expect.poll(shownPage).toBe(asItArrived);
  await page.getByTestId('compare').click();
  await expect.poll(shownPage).not.toBe(asItArrived);

  // Add image shipped as a <label matButton>, which matButton does not match,
  // so it rendered as bare text beside a properly drawn sibling. Both are real
  // buttons of the same height or it has regressed.
  const addText = page.getByRole('button', { name: 'Add text' });
  const addImage = page.getByRole('button', { name: 'Add image' });
  const heightOf = (button: typeof addText) =>
    button.evaluate((node) => Math.round(node.getBoundingClientRect().height));
  expect(await heightOf(addImage)).toBe(await heightOf(addText));

  const edited = await shownPage();
  await page
    .locator('input[aria-label="Choose an image to place on the page"]')
    .setInputFiles(fixture('sample.png'));
  await expect(page.getByTestId('change-count')).toHaveText('2 changes');
  await page.getByLabel('Image width in points').fill('220');
  await expect.poll(shownPage).not.toBe(edited);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save & download/ }).click();
  const saved = readFileSync(await (await download).path());
  // The fixture carries no pictures of its own, so the one in the saved file
  // is the one that was just placed. What it is drawn at is asserted on the
  // operators in document.spec.ts.
  expect(saved.toString('latin1')).toContain('/Subtype /Image');

  expectClean(watch);
});

/**
 * Undo, and the thing that made it worth testing on the file rather than the
 * screen: the preview saves after every change, so by the time anything is
 * taken back the page has already been rewritten once. A save with nothing
 * left to write has to put that page back, or the line you removed is still in
 * the download.
 */
test('pdf-edit takes changes back one at a time, and the file forgets them too', async ({
  page,
}) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-edit', 'PDF Editor');

  await uploadFiles(page, ['sample.pdf']);
  await expect(page.locator('.sheet__page')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('undo')).toBeDisabled();

  await page.getByRole('button', { name: 'Annual Report', exact: true }).click();
  await page.getByTestId('run-editor').fill('Interim Report');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByTestId('change-count')).toHaveText('1 change');

  await page.getByRole('button', { name: 'Page 1 of 3', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByTestId('change-count')).toHaveText('2 changes');

  // Ctrl-Z outside a text field takes the last one back.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('change-count')).toHaveText('1 change');
  await expect(page.getByRole('button', { name: 'Page 1 of 3', exact: true })).toBeVisible();

  // Add a line, let the preview save, then take it back with the button.
  await page.getByRole('button', { name: 'Add text' }).click();
  await page.getByTestId('sheet').click({ position: { x: 60, y: 300 } });
  await expect(page.getByTestId('change-count')).toHaveText('2 changes');
  await expect(page.getByLabel('Text you added')).toHaveValue('New text');
  await page.waitForTimeout(700); // long enough for the debounced save to land

  await page.getByTestId('undo').click();
  await expect(page.getByTestId('change-count')).toHaveText('1 change');
  await expect(page.getByTestId('undo')).toBeEnabled();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save & download/ }).click();
  const edited = await EditablePdf.open(
    new Uint8Array(readFileSync(await (await download).path())),
  );
  const text = edited.runs(0).map((run) => run.text);
  expect(text).toContain('Interim Report');
  // Undone, after a save had already written it to the page.
  expect(text).not.toContain('New text');
  // And the delete that was undone is back.
  expect(text).toContain('Page 1 of 3');

  expectClean(watch);
});

/**
 * Dragging text the file already contains, which is a different thing from
 * dragging something added: nothing new is drawn, an existing show operator is
 * wrapped in a matrix that puts it somewhere else. The check is on the saved
 * bytes because that is the only place the distinction is visible — an overlay
 * moved on screen would look identical.
 */
test('pdf-edit moves a line the file already had, and puts it back', async ({ page }) => {
  const watch = watchConsole(page);
  const original = await EditablePdf.open(new Uint8Array(readFileSync(fixture('sample.pdf'))));
  const was = original.runs(0)[0];
  expect(was.text).toBe('Annual Report');

  await gotoTool(page, 'pdf-edit', 'PDF Editor');
  await uploadFiles(page, ['sample.pdf']);
  await expect(page.locator('.sheet__page')).toBeVisible({ timeout: 45_000 });

  const heading = page.getByRole('button', { name: 'Annual Report', exact: true });
  await expect(heading).toBeVisible({ timeout: 45_000 });
  const from = (await heading.boundingBox())!;

  // Down and to the right, in steps: one jump would clear the slop without
  // ever producing the intermediate moves a real drag sends.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 5; step++) {
    await page.mouse.move(
      from.x + from.width / 2 + step * 20,
      from.y + from.height / 2 + step * 14,
    );
  }
  await page.mouse.up();

  // One change for the whole drag, not one per pointer move.
  await expect(page.getByTestId('change-count')).toHaveText('1 change');
  const to = (await heading.boundingBox())!;
  expect(to.x).toBeGreaterThan(from.x + 60);
  expect(to.y).toBeGreaterThan(from.y + 40);

  const moved = await saveAndOpen(page);
  const run = moved.runs(0)[0];
  expect(run.text).toBe('Annual Report');
  // Right on the page is +x; down the screen is -y in page points.
  expect(run.x).toBeGreaterThan(was.x + 20);
  expect(run.y).toBeLessThan(was.y - 15);

  // Taking it back has to reach the file too, not just the screen: the preview
  // already saved the move into the page once.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('change-count')).toHaveText('0 changes');
  expect((await heading.boundingBox())!.x).toBeCloseTo(from.x, 0);

  // Something else to change, because Save is off with nothing to save.
  await page.getByRole('button', { name: 'Page 1 of 3', exact: true }).click();
  await page.getByTestId('run-editor').fill('Page one');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();

  const back = (await saveAndOpen(page)).runs(0)[0];
  expect(back.text).toBe('Annual Report');
  expect(back.x).toBeCloseTo(was.x, 1);
  expect(back.y).toBeCloseTo(was.y, 1);

  expectClean(watch);
});

test('pdf-sign places a typed signature and downloads the signed file', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-sign', 'Sign PDF');

  await uploadFiles(page, ['sample.pdf']);
  await expect(page.getByText(/sample\.pdf · 3 pages/)).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('.sheet__page')).toBeVisible({ timeout: 45_000 });

  await page.getByRole('tab', { name: 'Type' }).click();
  await page.getByLabel('Your name').fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Use this signature' }).click();
  await expect(page.locator('.sig')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Sign & download/ }).click();
  expect((await download).suggestedFilename()).toBe('sample-signed.pdf');

  expectClean(watch);
});

test('certificate-decoder reads a chain', async ({ page, request }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'certificate-decoder', 'Certificate Decoder');

  // sample-chain.pem is a leaf for e2e.yydevtools.com signed by a self-signed
  // "YYDevTools E2E Root CA", both valid until 2036.
  await uploadFiles(page, ['sample-chain.pem']);

  if (await hostedApi(request)) {
    await expect(page.getByRole('heading', { name: /e2e\.yydevtools\.com/ })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByRole('heading', { name: /YYDevTools E2E Root CA/ })).toBeVisible();
    // Also present inside the collapsed extensions list, hence first().
    await expect(page.getByText(/DNS:www\.e2e\.yydevtools\.com/).first()).toBeVisible();
    await expect(page.getByText(/signed by the next, up to a self-signed root/)).toBeVisible();
  } else {
    await expect(page.getByRole('alert')).toContainText(/decoding service is not running/i, {
      timeout: 45_000,
    });
  }

  expectClean(watch);
});

test('powerpoint-viewer renders a .pptx', async ({ page, request }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'powerpoint-viewer', 'PowerPoint Viewer');

  await uploadFiles(page, ['sample.pptx']);

  if (await hostedApi(request)) {
    // Two slides in, two pages out — the count comes from the rendered PDF.
    await expect(page.getByText(/2 slides/)).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('app-pdf-preview iframe')).toBeVisible();
  } else {
    await expect(page.getByRole('alert')).toContainText(/conversion service is not running/i, {
      timeout: 45_000,
    });
  }

  expectClean(watch);
});

test('office-to-pdf converts a .docx', async ({ page, request }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'office-to-pdf', 'Office to PDF');

  await uploadFiles(page, ['sample.docx']);
  await expect(page.getByText(/sample\.docx/).first()).toBeVisible();

  if (await hostedApi(request)) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Convert/ }).click();
    expect((await download).suggestedFilename()).toBe('sample.pdf');
  } else {
    await page.getByRole('button', { name: /Convert/ }).click();
    await expect(page.getByRole('alert')).toContainText(/conversion service is not running/i, {
      timeout: 45_000,
    });
  }

  expectClean(watch);
});

test('pdf-protect encrypts a PDF', async ({ page, request }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-protect', 'Protect PDF');

  await uploadFiles(page, ['sample.pdf']);
  await page.getByLabel('Password to open the file').fill('e2e-secret');

  if (await hostedApi(request)) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Protect & download/ }).click();
    expect((await download).suggestedFilename()).toBe('sample-protected.pdf');
  } else {
    await page.getByRole('button', { name: /Protect & download/ }).click();
    await expect(page.getByRole('alert')).toContainText(/conversion service is not running/i, {
      timeout: 45_000,
    });
  }

  expectClean(watch);
});

test('pdf-unlock removes the password from a protected PDF', async ({ page, request }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-unlock', 'Unlock PDF');

  // sample-locked.pdf is sample.pdf run through /pdf/protect with "e2e-secret".
  await uploadFiles(page, ['sample-locked.pdf']);
  await page.getByLabel('Current password').fill('e2e-secret');

  if (await hostedApi(request)) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Unlock & download/ }).click();
    expect((await download).suggestedFilename()).toBe('sample-locked-unlocked.pdf');
  } else {
    await page.getByRole('button', { name: /Unlock & download/ }).click();
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

test('file-inspector names the type, flags a lying extension, hashes and cleans a PDF', async ({
  page,
}) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'file-inspector', 'File Inspector');

  // A PDF handed over under a .docx name: the bytes win.
  const pdf = readFileSync(fixture('sample.pdf'));
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'report.docx',
    mimeType: 'application/octet-stream',
    buffer: pdf,
  });
  await expect(page.getByTestId('verdict')).toHaveText('PDF document');
  await expect(page.getByTestId('mismatch')).toContainText(
    'says .docx, but the contents are a PDF',
  );
  await expect(page.getByTestId('digest-SHA-256')).toHaveText(
    createHash('sha256').update(pdf).digest('hex'),
    { timeout: 30_000 },
  );
  await expect(page.getByTestId('digest-MD5')).toHaveText(
    createHash('md5').update(pdf).digest('hex'),
  );

  // The fixture carries a title and pdf-lib's producer string.
  await expect(page.getByText('Annual Report')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/pdf-lib/).first()).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download clean copy' }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('report-clean.docx');
  const clean = readFileSync(await saved.path());
  expect(clean.subarray(0, 5).toString()).toBe('%PDF-');
  expect(clean.includes('Annual Report')).toBe(false);
  expect(clean.includes('pdf-lib')).toBe(false);

  expectClean(watch);
});

test('file-inspector reads and strips Word document properties', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'file-inspector', 'File Inspector');

  const docx = zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    '_rels/.rels': strToU8('<Relationships/>'),
    'word/document.xml': strToU8('<w:document/>'),
    'docProps/core.xml': strToU8(
      '<cp:coreProperties><dc:creator>Priya Natarajan</dc:creator><cp:lastModifiedBy>Sam</cp:lastModifiedBy></cp:coreProperties>',
    ),
    'docProps/app.xml': strToU8(
      '<Properties><Company>Acme</Company><Words>12</Words></Properties>',
    ),
  });
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'memo.docx',
      mimeType: '',
      buffer: Buffer.from(docx),
    });

  await expect(page.getByTestId('verdict')).toHaveText('Word document (.docx)');
  await expect(page.getByText('Author: Priya Natarajan')).toBeVisible();
  await expect(page.getByText('Company: Acme')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open in Word Viewer' })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download clean copy' }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('memo-clean.docx');
  const clean = unzipSync(new Uint8Array(readFileSync(await saved.path())));
  expect(strFromU8(clean['docProps/core.xml'])).not.toContain('Priya');
  expect(strFromU8(clean['docProps/app.xml'])).toContain('<Words>12</Words>');
  expect(strFromU8(clean['docProps/app.xml'])).not.toContain('Acme');

  expectClean(watch);
});

/**
 * The background remover downloads about 19 MB of runtime and weights before it
 * can answer, so this one test is allowed several minutes. It is the only proof
 * that the model, the worker and the compositing actually meet.
 */
test('background-remover cuts a subject out and mattes it onto a colour', async ({ page }) => {
  test.slow();
  const watch = watchConsole(page);
  await gotoTool(page, 'background-remover', 'Background Remover');

  await uploadFiles(page, ['sample-photo.jpg']);

  const result = page.getByTestId('result');
  await expect(result).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText(/sample-photo\.jpg · 640 × 480/)).toBeVisible();

  // The mask has to be a mask: a cut-out that kept everything or nothing is the
  // model failing, and the page says so out loud when it happens.
  await expect(page.getByText(/subject covers \d+%/)).toBeVisible();
  await expect(page.locator('.status--warn')).toHaveCount(0);

  // Transparent by default, which is what the checkerboard behind it means.
  await expect(result).toHaveClass(/shot__image--checkered/);

  await page.getByRole('button', { name: 'Colour', exact: true }).click();
  await expect(result).not.toHaveClass(/shot__image--checkered/);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('sample-photo-background.png');
  // A real PNG, not an empty file or a canvas that never painted.
  const bytes = readFileSync(await saved.path());
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(bytes.byteLength).toBeGreaterThan(1000);

  expectClean(watch);
});

test('passport-photo crops to an official size and lays out a print sheet', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'passport-photo', 'Passport Photo Maker');

  await uploadFiles(page, ['sample-photo.jpg']);

  // UK/EU is the default: 35 x 45 mm, which is 413 x 531 pixels at 300 dpi.
  await expect(page.getByTestId('photo')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('photo-size')).toContainText('413 × 531 px');
  await expect(page.getByTestId('sheet-count')).toContainText('8 copies per sheet');

  // A 640 x 480 source cannot fill a 413-pixel-wide crop once the box is the
  // right shape, so the soft-print warning is the correct answer here.
  await expect(page.getByTestId('too-small')).toBeVisible();

  // Switching the document changes the shape, the pixels and the sheet at once.
  await page.getByRole('button', { name: 'United States', exact: true }).click();
  await expect(page.getByTestId('photo-size')).toContainText('600 × 600 px');
  await expect(page.getByTestId('sheet-count')).toContainText('2 copies per sheet');

  const photo = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download photo' }).click();
  expect((await photo).suggestedFilename()).toBe('passport-photo-50.8x50.8mm-300dpi.jpg');

  const sheet = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download sheet' }).click();
  const saved = await sheet;
  expect(saved.suggestedFilename()).toBe('passport-photo-50.8x50.8mm-sheet-6x4-300dpi.jpg');
  // A real JPEG, not an empty file or a canvas that never painted.
  const bytes = readFileSync(await saved.path());
  expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  expect(bytes.byteLength).toBeGreaterThan(1000);

  expectClean(watch);
});

/**
 * The Video Trimmer, as far as the environment allows.
 *
 * The selection logic is asserted everywhere, because it is the part with the
 * decisions in it. The transcode itself needs the ffmpeg core, which is a
 * 31 MB object served out of R2 by the Worker — so it is there against a
 * deployment or `wrangler dev`, and absent under a bare `ng serve`. Rather
 * than gate on an env var, this runs the job and branches on what came back:
 * a real GIF, or an honest failure. Both are worth asserting; neither is a
 * test that quietly does nothing.
 */
test('video-trimmer selects a range and makes a GIF from it', async ({ page }) => {
  // The engine download and the transcode are both real work.
  test.setTimeout(240_000);

  await gotoTool(page, 'video-trimmer', 'Video Trimmer & GIF Maker');
  await uploadFiles(page, ['sample-video.webm']);

  // The fixture is recorded rather than authored, so its length is about three
  // seconds rather than exactly three. What matters is that a duration was
  // worked out at all — MediaRecorder writes no duration into the header, and
  // an unhandled Infinity would leave this at 0:00.0.
  const end = page.getByTestId('end');
  await expect(end).not.toHaveText('0:00.0', { timeout: 30_000 });
  await expect(page.getByTestId('start')).toHaveText('0:00.0');
  const whole = await end.textContent();

  // Moving the start handle shortens the selection.
  await page.locator('.range__slider').first().fill('1');
  await expect(page.getByTestId('start')).toHaveText('0:01.0');
  await expect(page.getByTestId('length')).not.toContainText(`${whole} selected`);

  // GIF options only exist for a GIF, and the frame count follows the choices.
  await expect(page.getByTestId('frames')).toHaveCount(0);
  await page.getByRole('button', { name: 'Make a GIF', exact: true }).click();
  await page.getByRole('button', { name: '8', exact: true }).click();
  await page.getByRole('button', { name: '240px', exact: true }).click();
  const frames = page.getByTestId('frames');
  await expect(frames).toBeVisible();
  const counted = Number((await frames.textContent())?.match(/(\d+) frames/)?.[1]);
  // Whatever is left of a ~3s clip after cutting 1s off the front, at 8 fps.
  expect(counted).toBeGreaterThan(4);
  expect(counted).toBeLessThan(25);

  await page.getByTestId('run').click();

  const result = page.getByTestId('result');
  const failed = page.getByTestId('error');
  await expect(result.or(failed).first()).toBeVisible({ timeout: 200_000 });

  if ((await result.count()) === 0) {
    // No engine here — and it has to say precisely that. Accepting any failure
    // would let a genuinely broken transcode pass as "degraded" everywhere the
    // engine is missing, which is most places this suite runs.
    await expect(failed).toContainText('video engine');
    return;
  }

  // A GIF, and a real one: check the magic number rather than the extension.
  const image = result.locator('img');
  await expect(image).toBeVisible();
  const src = await image.getAttribute('src');
  const header = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url!)).arrayBuffer());
    return String.fromCharCode(...bytes.slice(0, 6));
  }, src);
  expect(header).toBe('GIF89a');
});

test('palette-extractor pulls the colours out of an image', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'palette-extractor', 'Colour Palette Extractor');

  await uploadFiles(page, ['sample.png']);

  const swatches = page.getByTestId('swatches').locator('.swatch');
  await expect(swatches).toHaveCount(6);

  const hexes = await page.locator('.swatch__hex').allInnerTexts();
  // sample.png is a gradient over red and green with blue pinned at 128, so
  // every colour extracted from it has to end in 80. A palette that did not
  // would mean the pixels were not really being read.
  for (const hex of hexes) {
    expect(hex).toMatch(/^#[0-9a-f]{4}80$/);
  }

  const shares = await page.locator('.swatch__share').allInnerTexts();
  const total = shares.reduce((sum, text) => sum + Number.parseFloat(text), 0);
  expect(total).toBeGreaterThan(97);
  expect(total).toBeLessThan(103);

  await page.getByRole('group', { name: 'Colours' }).getByRole('button', { name: '12' }).click();
  await expect(swatches).toHaveCount(12);

  // A file that is not an image says so, and leaves the dropzone to try again.
  await page.getByRole('button', { name: 'Another image' }).click();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'broken.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not an image at all'),
    });
  await expect(page.getByRole('alert')).toContainText('could not be read as an image');

  expectClean(watch);
});

test('invoice-generator totals the lines and downloads a PDF', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'invoice-generator', 'Invoice & Receipt Generator');

  const total = page.getByTestId('grand-total');
  const rows = page.locator('.items tbody tr');

  // 1800 plus 6.5 hours at 85 is 2352.50, and 20% VAT on that is 470.50.
  await expect(rows).toHaveCount(2);
  await expect(total).toHaveText('\u00a32,823.00');

  // Currency is not just a symbol swap: yen has no minor units at all, so
  // every figure on the page reformats.
  await page.locator('#inv-currency').selectOption('JPY');
  await expect(total).toHaveText('\u00a52,824');
  await page.locator('#inv-currency').selectOption('GBP');

  // A line added, priced and removed leaves the total where it started.
  await page.getByRole('button', { name: 'Add a line' }).click();
  await expect(rows).toHaveCount(3);
  await page.getByLabel('Unit price, line 3').fill('0.1');
  await page.getByLabel('Quantity, line 3').fill('2');
  await expect(total).toHaveText('\u00a32,823.24');
  await page.getByRole('button', { name: 'Remove line 3' }).click();
  await expect(total).toHaveText('\u00a32,823.00');

  // A zero rate drops the tax row rather than printing "VAT 0%".
  await page.locator('#inv-tax-rate').fill('0');
  await expect(page.getByTestId('totals').locator('.totals__row')).toHaveCount(2);
  await expect(total).toHaveText('\u00a32,352.50');
  await page.locator('#inv-tax-rate').fill('20');

  // Receipt is the same form with the two labels that change.
  await page
    .getByRole('group', { name: 'Document' })
    .getByRole('button', { name: 'Receipt' })
    .click();
  await expect(page.getByText('Paid on', { exact: true })).toBeVisible();
  await expect(page.getByText('Received from', { exact: true })).toBeVisible();
  await page
    .getByRole('group', { name: 'Document' })
    .getByRole('button', { name: 'Invoice' })
    .click();

  // Next keeps the padding: INV-0001 becomes INV-0002, not INV-2.
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('#inv-number')).toHaveValue('INV-0002');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('invoice-inv-0002.pdf');

  const path = await file.path();
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(1000);

  expectClean(watch);
});

/** Pixels drawn in the diff overlay's red on the visible page canvas. */
async function countRedPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="page-canvas"]');
    const context = canvas?.getContext('2d');
    if (!canvas || !context || canvas.width === 0) return -1;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let at = 0; at < data.length; at += 4) {
      if (data[at] === 214 && data[at + 1] === 40 && data[at + 2] === 40) count++;
    }
    return count;
  });
}

/**
 * Two PDFs built here rather than taken from the fixtures, so the difference
 * between them is exactly one known word on one known page.
 */
async function threePager(secondPageExtra: string): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import('@cantoo/pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let number = 1; number <= 3; number++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Clause ${number}`, { x: 60, y: 760, size: 24, font, color: rgb(0, 0, 0) });
    if (number === 2 && secondPageExtra) {
      page.drawText(secondPageExtra, { x: 60, y: 700, size: 24, font, color: rgb(0, 0, 0) });
    }
  }
  return Buffer.from(await doc.save());
}

test('pdf-diff finds the one page that changed', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-diff', 'PDF Visual Diff');

  const inputs = page.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles({
    name: 'original.pdf',
    mimeType: 'application/pdf',
    buffer: await threePager(''),
  });
  await inputs.nth(1).setInputFiles({
    name: 'revised.pdf',
    mimeType: 'application/pdf',
    buffer: await threePager('and also this'),
  });

  await expect(page.getByTestId('summary')).toHaveText('1 of 3 pages differs.', {
    timeout: 60_000,
  });

  // It opens on the page that changed, not on page one.
  await expect(page.getByTestId('page-note')).toContainText('Page 2');
  await expect(page.locator('.pager__page--changed')).toHaveCount(1);

  // The overlay really is marked: count the red pixels on the canvas. Polled
  // rather than read once — the page on screen is re-rendered at a larger
  // scale after the comparison finishes, so it lands a moment later.
  await expect.poll(() => countRedPixels(page), { timeout: 30_000 }).toBeGreaterThan(100);

  // Original and Revised show the page itself, with nothing marked on it.
  await page
    .getByRole('group', { name: 'Showing' })
    .getByRole('button', { name: 'Original' })
    .click();
  await expect.poll(() => countRedPixels(page), { timeout: 30_000 }).toBe(0);

  // An unchanged page has nothing marked on it either.
  await page
    .getByRole('group', { name: 'Showing' })
    .getByRole('button', { name: 'Difference' })
    .click();
  await page.getByRole('button', { name: /^Page 1,/ }).click();
  await expect(page.getByTestId('page-note')).toContainText('unchanged');
  await expect.poll(() => countRedPixels(page), { timeout: 30_000 }).toBe(0);

  expectClean(watch);
});

test('pdf-diff calls out a page that exists in only one file', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-diff', 'PDF Visual Diff');

  // Three pages against two, and different content on every one of them.
  const inputs = page.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles(fixture('sample.pdf'));
  await inputs.nth(1).setInputFiles(fixture('sample-2.pdf'));

  await expect(page.getByTestId('summary')).toHaveText('3 of 3 pages differ.', {
    timeout: 60_000,
  });

  await page.getByRole('button', { name: /^Page 3,/ }).click();
  await expect(page.getByTestId('page-note')).toContainText('in the original only');

  // The Difference view has nothing to diff a missing page against, so it
  // shows the side that has it rather than an empty box.
  const drawn = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="page-canvas"]');
    return canvas ? canvas.width * canvas.height : 0;
  });
  expect(drawn).toBeGreaterThan(0);

  expectClean(watch);
});

/** Pixels on the invoice preview that are not paper-white. */
async function previewInk(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="preview"]');
    const context = canvas?.getContext('2d');
    // A canvas still at its 300x150 default has not been drawn into yet.
    if (!canvas || !context || canvas.width <= 300) return -1;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let marked = 0;
    for (let at = 0; at < data.length; at += 4) {
      if (data[at] < 245 || data[at + 1] < 245 || data[at + 2] < 245) marked++;
    }
    return marked;
  });
}

/** Clicks Download PDF and hands back the bytes that arrived. */
async function downloadedPdf(page: Page): Promise<Buffer> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  return readFileSync(await (await download).path());
}

test('invoice-generator previews the real PDF and takes a logo', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'invoice-generator', 'Invoice & Receipt Generator');

  // The preview is the document itself, rasterised — A4 at 1.5x is 892 x 1262.
  await expect.poll(() => previewInk(page), { timeout: 45_000 }).toBeGreaterThan(1000);
  expect(
    await page.getByTestId('preview').evaluate((el: HTMLCanvasElement) => [el.width, el.height]),
  ).toEqual([892, 1262]);
  await expect(page.getByTestId('preview-pages')).toHaveText('One page');

  // It follows the form: more on the page is more ink on the preview.
  const plain = await previewInk(page);
  await page.locator('#inv-notes').fill(`${'Terms and conditions apply. '.repeat(12)}`);
  await expect.poll(() => previewInk(page), { timeout: 20_000 }).toBeGreaterThan(plain);

  // A file that is not a PNG or a JPEG is refused on its bytes, whatever the
  // name on it says — pdf-lib would otherwise throw part-way through and lose
  // the whole invoice rather than the logo.
  await page.getByTestId('logo-input').setInputFiles({
    name: 'letterhead.png',
    mimeType: 'image/png',
    buffer: readFileSync(fixture('sample.csv')),
  });
  await expect(page.getByRole('alert')).toContainText('PNG or a JPEG');
  await expect(page.getByTestId('logo-name')).toHaveCount(0);

  // The same document without a logo, to weigh the next one against.
  const plainPdf = await downloadedPdf(page);
  expect(plainPdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');

  // A real image is taken on, and turns up in the preview.
  const withoutLogo = await previewInk(page);
  await page.getByTestId('logo-input').setInputFiles(fixture('sample-photo.jpg'));
  await expect(page.getByTestId('logo-name')).toHaveText('sample-photo.jpg');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => previewInk(page), { timeout: 20_000 }).toBeGreaterThan(withoutLogo);

  // And in the file, which is bigger for carrying it. Weighed against the
  // same invoice rather than a round number, so the assertion is "the image
  // is in there" and not "a PDF is about this big".
  const withLogo = await downloadedPdf(page);
  expect(withLogo.length).toBeGreaterThan(plainPdf.length + 1000);

  // Removing it puts the page back the way it was.
  await page.getByRole('button', { name: 'Remove the logo' }).click();
  await expect(page.getByTestId('logo-name')).toHaveCount(0);
  await expect.poll(() => previewInk(page), { timeout: 20_000 }).toBeLessThan(withoutLogo + 500);

  expectClean(watch);
});

test('invoice-generator says so when the invoice runs to a second page', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'invoice-generator', 'Invoice & Receipt Generator');
  await expect(page.getByTestId('preview-pages')).toHaveText('One page', { timeout: 45_000 });

  // Enough lines to push the totals off the bottom of the first page.
  for (let line = 0; line < 34; line++) {
    await page.getByRole('button', { name: 'Add a line' }).click();
  }
  await expect(page.getByTestId('preview-pages')).toHaveText('Page 1 of 2', { timeout: 30_000 });

  expectClean(watch);
});

/** A fixture as a data URI, the way someone would paste it into Base64. */
function dataUri(name: string, mime: string): string {
  return `data:${mime};base64,${readFileSync(fixture(name)).toString('base64')}`;
}

/** Decode `uri` in the Base64 converter and hand the file on with Open in. */
async function openViaBase64(page: Page, uri: string, target: string): Promise<void> {
  await gotoTool(page, 'base64-converter', 'Base64 Converter');
  await page.getByRole('tab', { name: 'Decode file' }).click();
  await page.locator('#b64-in').fill(uri);
  await page.getByRole('button', { name: 'Render preview' }).click();
  await page.getByRole('button', { name: 'Open in' }).click();
  await page.getByRole('menuitem', { name: target, exact: true }).click();
}

test('base64-converter opens a decoded PDF in the PDF Viewer', async ({ page }) => {
  const watch = watchConsole(page);
  await openViaBase64(page, dataUri('sample.pdf', 'application/pdf'), 'PDF Viewer');

  await expect(page).toHaveURL(/\/tools\/pdf-viewer#from=base64-converter$/);
  // The same 3-page fixture the viewer's own test drops in.
  await expect(page.getByText(/\b3\b/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('canvas, iframe, .pdf-preview').first()).toBeVisible();

  expectClean(watch);
});

test('base64-converter opens a decoded image in the Image Viewer', async ({ page }) => {
  const watch = watchConsole(page);
  const png = readFileSync(fixture('sample.png'));
  // Read off the PNG header rather than hard-coded, so this stays true to the fixture.
  const size = `${png.readUInt32BE(16)} × ${png.readUInt32BE(20)}`;

  await openViaBase64(page, dataUri('sample.png', 'image/png'), 'Image Viewer');

  await expect(page).toHaveURL(/\/tools\/image-viewer#from=base64-converter$/);
  await expect(page.getByTestId('image-view')).toBeVisible();
  await expect(page.getByTestId('image-dimensions')).toHaveText(size);

  // Back finds the Decode file tab as it was left: the Base64, and its preview.
  await page.getByRole('button', { name: 'Back to Base64 Converter' }).click();
  await expect(page).toHaveURL(/\/tools\/base64-converter$/);
  await waitForHydration(page);
  await expect(page.getByRole('tab', { name: 'Decode file' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#b64-in')).toHaveValue(/^data:image\/png;base64,iVBOR/);
  await expect(page.getByRole('button', { name: 'Open in' })).toBeEnabled();

  expectClean(watch);
});

test('image-viewer opens a file or pasted Base64, zooms, and hands a PDF on', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'image-viewer', 'Image Viewer');

  await uploadFiles(page, ['sample-photo.jpg']);
  const img = page.getByTestId('image-view');
  await expect(img).toBeVisible();
  const natural = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
  expect(natural).toBeGreaterThan(0);
  await expect(page.getByTestId('image-dimensions')).toContainText(`${natural} ×`);

  // 100% draws it pixel for pixel; zooming in steps to 150%.
  await page.getByRole('button', { name: '100%' }).click();
  await expect(page.locator('.zoom')).toHaveText('100%');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.locator('.zoom')).toHaveText('150%');
  expect(await img.evaluate((el) => el.getBoundingClientRect().width)).toBeCloseTo(natural * 1.5, 0);
  // Fit gives the sizing back to the pane.
  await page.getByRole('button', { name: 'Fit' }).click();
  await expect(page.getByRole('button', { name: 'Fit' })).toHaveAttribute('aria-pressed', 'true');

  const transparency = page.getByRole('button', { name: 'Transparency' });
  await transparency.click();
  await expect(transparency).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('image-stage')).toHaveClass(/stage--checker/);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('sample-photo.jpg');

  // Pasted, bare Base64 with no data: prefix — the type comes from the bytes.
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.locator('#iv-paste').fill(readFileSync(fixture('sample.png')).toString('base64'));
  await expect(page.getByTestId('image-view')).toBeVisible();
  await expect(page.locator('.fact').filter({ hasText: 'Format' })).toContainText('PNG');

  // A PDF is recognised as one and offered to the right tool, not refused blankly.
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.locator('#iv-paste').fill(readFileSync(fixture('sample.pdf')).toString('base64'));
  await expect(page.getByRole('alert')).toContainText('PDF, not an image');
  await page.getByRole('button', { name: 'Open in' }).click();
  await expect(page.getByRole('menuitem').first()).toHaveText('PDF Viewer');

  expectClean(watch);
});

/**
 * Every tool "Open in" can send a file to must actually take it.
 *
 * The file travels through FileHandoff, and the only thing that picks it up is
 * an <app-dropzone> rendered when the page opens. A tool whose dropzone appears
 * only in a second mode navigates fine and drops the file on the floor — the
 * Hash Generator, which opens on its Text tab, was exactly that.
 *
 * Handing a real file to all of them (tried first) shows the same thing more
 * slowly and less clearly: several tools take a file without printing its name,
 * and the Office viewers need the hosted converter.
 */
test('every Open-in target has a dropzone waiting when it opens', async ({ page }) => {
  test.setTimeout(180_000);
  const missing: string[] = [];
  for (const slug of OPEN_IN_SLUGS) {
    await page.goto(`/tools/${slug}`);
    await waitForHydration(page);
    if ((await page.locator('app-dropzone').count()) === 0) {
      missing.push(slug);
    }
  }
  expect(missing, 'these would drop a handed-over file').toEqual([]);
});

/**
 * A PNG of `lines`, rendered by the browser itself, so the test knows exactly
 * what the image says. Sinhala and Tamil come from the system's Indic fonts
 * (Nirmala UI on Windows).
 */
async function textImage(page: Page, lines: string[], px: number): Promise<Buffer> {
  const shot = await page.context().newPage();
  await shot.setContent(
    `<body style="margin:0;background:#fff"><div id="t" style="display:inline-block;padding:12px;` +
      `font:${px}px 'Segoe UI','Nirmala UI','Iskoola Pota',sans-serif;color:#111">` +
      lines.map((line) => `<p style="margin:0 0 .4em">${line}</p>`).join('') +
      `</div></body>`,
  );
  const png = await shot.locator('#t').screenshot();
  await shot.close();
  return png;
}

test('image-ocr reads a small screenshot, and never asks another site for anything', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const watch = watchConsole(page);
  const origin = new URL(test.info().project.use.baseURL!).origin;
  // The engine, its WebAssembly core and the language models. (Ads load from
  // elsewhere on every page; they are not what this promise is about.)
  const engine: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/tesseract|traineddata|\.wasm/i.test(url)) engine.push(url);
  });
  await gotoTool(page, 'image-ocr', 'Image OCR');

  // Small text reads cleanly only enlarged: 10 px Segoe UI read as it is came
  // back with "£521" for 4821 and "127.00.15432" for the address. 10 px is too
  // small to rely on, though: on Linux the fallback DejaVu Sans reads "Error" as
  // "Emor" even enlarged. From 12 to 18 px it reads exactly, so 16 sits clear of
  // the edge; the image is still well under 1500 px and is still enlarged.
  const png = await textImage(
    page,
    [
      'Invoice 4821 was paid on 23 September 2026.',
      'The quick brown fox jumps over the lazy dog.',
      'Error: ECONNREFUSED 127.0.0.1:5432 (retry 3/5)',
    ],
    16,
  );
  await waitForHydration(page);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: png });

  const text = page.getByTestId('ocr-text');
  await expect(page.getByTestId('ocr-summary')).toContainText('confidence', { timeout: 60_000 });
  await expect(text).toHaveValue(/Invoice 4821 was paid on 23 September 2026\./);
  await expect(text).toHaveValue(/quick brown fox jumps over the lazy dog/);
  await expect(text).toHaveValue(/Error: ECONNREFUSED 127\.0\.0\.1:5432 \(retry 3\/5\)/);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download .txt' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('receipt.txt');

  // Tesseract's own CDN default would show up here.
  expect(engine.length, 'the engine was fetched at all').toBeGreaterThan(0);
  expect(engine.filter((url) => !url.startsWith(origin) && !url.startsWith('blob:'))).toEqual([]);
  expectClean(watch);
});

for (const { label, lines, expected } of [
  { label: 'Sinhala', lines: ['ශ්‍රී ලංකාව', 'ආයුබෝවන්'], expected: /ලංකාව[\s\S]*ආයුබෝවන්/ },
  { label: 'Tamil', lines: ['இலங்கை', 'வணக்கம்'], expected: /இலங்கை[\s\S]*வணக்கம்/ },
]) {
  test(`image-ocr reads ${label} from a pasted screenshot`, async ({ page }) => {
    test.setTimeout(90_000);
    const watch = watchConsole(page);
    await gotoTool(page, 'image-ocr', 'Image OCR');
    await waitForHydration(page);
    await page.getByLabel('Text language').selectOption({ label });

    // Ctrl+V of an image: a paste event carrying a file, sent to the document.
    const base64 = (await textImage(page, lines, 32)).toString('base64');
    await page.evaluate((data) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'screenshot.png', { type: 'image/png' }));
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer }));
    }, base64);

    await expect(page.getByTestId('ocr-summary')).toContainText('confidence', { timeout: 60_000 });
    await expect(page.getByTestId('ocr-text')).toHaveValue(expected);
    expectClean(watch);
  });
}

/** A QR code for `text`, as a PNG data URL, drawn by the same library the generator uses. */
const qr = (text: string) => QRCode.toDataURL(text, { margin: 2, width: 280 });

/** Several codes side by side in one screenshot. */
async function qrSheet(page: Page, texts: string[]): Promise<Buffer> {
  const images = await Promise.all(texts.map(qr));
  const shot = await page.context().newPage();
  await shot.setContent(
    `<body style="margin:0;background:#fff"><div id="s" style="display:inline-flex;gap:40px;padding:20px">` +
      images.map((src) => `<img src="${src}">`).join('') +
      `</div></body>`,
  );
  const png = await shot.locator('#s').screenshot();
  await shot.close();
  return png;
}

async function pasteImage(page: Page, png: Buffer): Promise<void> {
  await page.evaluate((data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'screenshot.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer }));
  }, png.toString('base64'));
}

test('qr-reader explains a Wi-Fi code and a link, and loads its decoder from this site', async ({
  page,
}) => {
  const watch = watchConsole(page);
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const decoder: string[] = [];
  page.on('request', (request) => {
    if (/zxing|\.wasm/i.test(request.url())) decoder.push(request.url());
  });
  await gotoTool(page, 'qr-reader', 'QR Code Reader');
  await waitForHydration(page);

  // Two codes in one image; the Wi-Fi name and password need escaping.
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'codes.png',
      mimeType: 'image/png',
      buffer: await qrSheet(page, [
        'WIFI:T:WPA;S:Cafe\\;Bar;P:lat\\:te\\\\1;;',
        'https://example.com/menu?table=12',
      ]),
    });

  const results = page.getByTestId('qr-results');
  await expect(results).toContainText('Found 2 codes.');
  const wifi = page.getByTestId('qr-code').filter({ hasText: 'Wi-Fi network' });
  await expect(wifi.locator('dd')).toHaveText(['Cafe;Bar', 'WPA', 'lat:te\\1']);

  const link = page.getByTestId('qr-code').filter({ hasText: 'Link' });
  await expect(link.locator('dd').first()).toHaveText('example.com');
  const open = link.getByRole('link', { name: 'Open link' });
  await expect(open).toHaveAttribute('href', 'https://example.com/menu?table=12');
  await expect(open).toHaveAttribute('target', '_blank');
  await expect(open).toHaveAttribute('rel', 'noopener noreferrer');

  expect(decoder.length, 'the decoder was fetched at all').toBeGreaterThan(0);
  expect(decoder.filter((url) => !url.startsWith(origin) && !url.startsWith('blob:'))).toEqual([]);
  expectClean(watch);
});

test('qr-reader never offers a script link, and says so when there is no code', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'qr-reader', 'QR Code Reader');
  await waitForHydration(page);

  await pasteImage(page, await qrSheet(page, ['javascript:alert(document.cookie)']));
  const code = page.getByTestId('qr-code');
  await expect(code).toContainText('Text');
  await expect(code.locator('textarea')).toHaveValue('javascript:alert(document.cookie)');
  await expect(code.getByRole('link')).toHaveCount(0);

  await uploadFiles(page, ['sample-photo.jpg']);
  await expect(page.getByTestId('qr-results')).toContainText('No QR code or barcode was found');
  expectClean(watch);
});

/**
 * The camera, fed a QR code: getUserMedia is replaced by a canvas stream, so
 * the real frame loop — <video>, grab, decode, stop — runs against a known
 * picture without a physical camera.
 */
test('qr-reader scans from the camera and turns it off once it reads a code', async ({ page }) => {
  const watch = watchConsole(page);
  const code = await qr('tel:+94112345678');
  await page.addInitScript((src) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext('2d')!;
      const img = new Image();
      img.src = src;
      await img.decode();
      const paint = () => {
        context.fillStyle = '#777';
        context.fillRect(0, 0, 640, 480);
        context.drawImage(img, 180, 100);
      };
      paint();
      setInterval(paint, 100);
      const stream = canvas.captureStream(10);
      (window as unknown as { cameraStream: MediaStream }).cameraStream = stream;
      return stream;
    };
  }, code);
  await gotoTool(page, 'qr-reader', 'QR Code Reader');
  await waitForHydration(page);

  // The stub above takes the place of getUserMedia, so it would work even where
  // the page's Permissions-Policy forbids the camera. That is how `camera=()` in
  // the Worker's headers once shipped: the button failed for every visitor on
  // production while this test passed. Ask the document itself. Chromium has
  // `featurePolicy`; an engine without it proves nothing, so it is skipped.
  const cameraAllowed = await page.evaluate(() => {
    const policy = (document as unknown as { featurePolicy?: { allowsFeature(f: string): boolean } })
      .featurePolicy;
    return policy ? policy.allowsFeature('camera') : null;
  });
  if (cameraAllowed !== null) {
    expect(cameraAllowed, 'Permissions-Policy blocks the camera on this page').toBe(true);
  }

  await page.getByRole('button', { name: 'Scan with camera' }).click();
  const found = page.getByTestId('qr-code');
  await expect(found).toContainText('Phone number');
  await expect(found.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+94112345678');

  // The camera is off, not just hidden.
  await expect(page.getByTestId('qr-camera')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Scan with camera' })).toBeVisible();
  const live = await page.evaluate(() =>
    (window as unknown as { cameraStream: MediaStream }).cameraStream
      .getTracks()
      .some((track) => track.readyState === 'live'),
  );
  expect(live).toBe(false);
  expectClean(watch);
});

/**
 * Back after Send to or Open in, for tools whose state is an image. It cannot
 * go in session storage, so it is handed back in memory and read again.
 */
test('image-ocr comes back from Send to with its image, language and text', async ({ page }) => {
  test.setTimeout(120_000);
  const watch = watchConsole(page);
  await gotoTool(page, 'image-ocr', 'Image OCR');
  await page.getByLabel('Text language').selectOption({ label: 'Sinhala + English' });
  await pasteImage(page, await textImage(page, ['The quick brown fox jumps over the lazy dog.'], 32));
  const text = page.getByTestId('ocr-text');
  await expect(page.getByTestId('ocr-summary')).toContainText('confidence', { timeout: 60_000 });
  await expect(text).toHaveValue(/quick brown fox/);

  await page.getByRole('button', { name: 'Send to' }).click();
  await page.getByRole('menuitem', { name: 'Word Counter' }).click();
  await expect(page).toHaveURL(/\/tools\/word-counter#s=[^&]+&from=image-ocr$/);
  await waitForHydration(page);
  await expect(page.locator('#wc-input')).toHaveValue(/quick brown fox/);

  await page.getByRole('button', { name: 'Back to Image OCR' }).click();
  await expect(page).toHaveURL(/\/tools\/image-ocr$/);
  await expect(page.getByLabel('Text language')).toHaveValue('sin+eng');
  await expect(page.getByTestId('ocr-summary')).toContainText('confidence', { timeout: 60_000 });
  await expect(text).toHaveValue(/quick brown fox/);
  expectClean(watch);
});

test('qr-reader comes back from Send to with the codes it found', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'qr-reader', 'QR Code Reader');
  await pasteImage(page, await qrSheet(page, ['https://example.com/menu?table=12']));
  const link = page.getByTestId('qr-code').filter({ hasText: 'Link' });
  await expect(link.locator('dd').first()).toHaveText('example.com');

  await link.getByRole('button', { name: 'Send to' }).click();
  await page.getByRole('menuitem', { name: 'URL Encoder' }).click();
  await expect(page).toHaveURL(/\/tools\/url-encoder#s=[^&]+&from=qr-reader$/);
  await waitForHydration(page);

  await page.getByRole('button', { name: 'Back to QR Code Reader' }).click();
  await expect(page).toHaveURL(/\/tools\/qr-reader$/);
  await expect(link.locator('dd').first()).toHaveText('example.com');
  await expect(page.getByTestId('qr-results')).toContainText('Found 1 code');
  expectClean(watch);
});

test('image-viewer comes back from Open in with its image', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'image-viewer', 'Image Viewer');
  await uploadFiles(page, ['sample-photo.jpg']);
  await expect(page.getByTestId('image-view')).toBeVisible();

  await page.getByRole('button', { name: 'Open in' }).click();
  await page.getByRole('menuitem', { name: 'QR Code Reader' }).click();
  await expect(page).toHaveURL(/\/tools\/qr-reader#from=image-viewer$/);
  await expect(page.getByTestId('qr-results')).toContainText('No QR code or barcode was found');

  await page.getByRole('button', { name: 'Back to Image Viewer' }).click();
  await expect(page).toHaveURL(/\/tools\/image-viewer$/);
  await expect(page.getByTestId('image-view')).toBeVisible();
  await expect(page.locator('.fact__name')).toHaveText('sample-photo.jpg');
  expectClean(watch);
});
