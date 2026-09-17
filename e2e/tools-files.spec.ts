import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

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

test('certificate-decoder reads a chain', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'certificate-decoder', 'Certificate Decoder');

  // sample-chain.pem is a leaf for e2e.yydevtools.com signed by a self-signed
  // "YYDevTools E2E Root CA", both valid until 2036.
  await uploadFiles(page, ['sample-chain.pem']);

  if (HOSTED_OFFICE) {
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

test('powerpoint-viewer renders a .pptx', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'powerpoint-viewer', 'PowerPoint Viewer');

  await uploadFiles(page, ['sample.pptx']);

  if (HOSTED_OFFICE) {
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

test('office-to-pdf converts a .docx', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'office-to-pdf', 'Office to PDF');

  await uploadFiles(page, ['sample.docx']);
  await expect(page.getByText(/sample\.docx/).first()).toBeVisible();

  if (HOSTED_OFFICE) {
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

test('pdf-protect encrypts a PDF', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-protect', 'Protect PDF');

  await uploadFiles(page, ['sample.pdf']);
  await page.getByLabel('Password to open the file').fill('e2e-secret');

  if (HOSTED_OFFICE) {
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

test('pdf-unlock removes the password from a protected PDF', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pdf-unlock', 'Unlock PDF');

  // sample-locked.pdf is sample.pdf run through /pdf/protect with "e2e-secret".
  await uploadFiles(page, ['sample-locked.pdf']);
  await page.getByLabel('Current password').fill('e2e-secret');

  if (HOSTED_OFFICE) {
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
