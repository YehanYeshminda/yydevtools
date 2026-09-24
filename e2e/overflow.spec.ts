import { expect, test, type Page } from '@playwright/test';

import { editorByLabel, expectNoClippedContent, gotoTool, setEditorText } from './helpers';

/**
 * Long unbroken tokens must never push a box open.
 *
 * Base64, hashes, JWTs and URLs are everyday input here, and tools echo them
 * back into cards, labels, lists and previews. A 56-character Base64 string
 * once ran straight out of the Word Counter's "longest word" card. Each test
 * feeds a tool a token with no break opportunities, then checks that no element
 * on the page overflows its box — at desktop width and at phone width.
 */

/** No spaces, hyphens or slashes: nothing a browser would break on by itself. */
const TOKEN = 'SGV5IG1hbiB3aGF0cyB1cCBpIGp1c3Qgd2FudGVkIHRvIHNheSBoaSBicm8'.repeat(5);

/** The same check twice: the desktop layout, then the phone one. */
async function expectFitsAtEveryWidth(page: Page): Promise<void> {
  await expectNoClippedContent(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await expectNoClippedContent(page);
}

test('word-counter keeps the longest word inside its card', async ({ page }) => {
  await gotoTool(page, 'word-counter', 'Word & Character Counter');
  await page.locator('#wc-input').fill(TOKEN);
  await expect(page.getByText(/longest/i)).toBeVisible();
  await expectFitsAtEveryWidth(page);
});

test('case-converter keeps every case row inside the panel', async ({ page }) => {
  await gotoTool(page, 'case-converter', 'Case Converter');
  await page.locator('#case-input').fill(TOKEN);
  await expect(page.locator('.row__value').first()).toBeVisible();
  await expectFitsAtEveryWidth(page);
});

test('hash-generator keeps the digests inside the panel', async ({ page }) => {
  await gotoTool(page, 'hash-generator', 'Hash Generator');
  await page.locator('#hash-input').fill(TOKEN);
  await expect(page.locator('.row__value').first()).toBeVisible();
  await expectFitsAtEveryWidth(page);
});

test('url-encoder keeps a long path segment inside the parts table', async ({ page }) => {
  await gotoTool(page, 'url-encoder', 'URL Encoder / Decoder');
  await page.locator('#url-input').fill(`https://example.com/${TOKEN}?q=${TOKEN}`);
  await expect(page.getByText('example.com').first()).toBeVisible();
  await expectFitsAtEveryWidth(page);
});

test('json-csv keeps a long cell inside the result editor', async ({ page }) => {
  await gotoTool(page, 'json-csv', 'JSON ↔ CSV Converter');
  await setEditorText(editorByLabel(page, 'Input'), `[{"token":"${TOKEN}"}]`);
  await expect(page.getByTestId('json-csv-summary')).toHaveText('1 row · 1 column');
  await expectFitsAtEveryWidth(page);
});

test('base64-converter keeps the result and the hints inside the panes', async ({ page }) => {
  await gotoTool(page, 'base64-converter', 'Base64 Converter');
  await page.locator('#b64-text').fill(TOKEN);
  await expect(page.locator('#b64-result')).not.toHaveValue('');
  await expectFitsAtEveryWidth(page);
});

test('jwt-decoder keeps a long claim inside the claims table', async ({ page }) => {
  await gotoTool(page, 'jwt-decoder', 'JWT Decoder');
  const b64url = (json: string) =>
    Buffer.from(json).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const token = `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(`{"sub":"${TOKEN}"}`)}.${TOKEN}`;
  await page.locator('#jwt-input').fill(token);
  await expect(page.getByText('HS256').first()).toBeVisible();
  await expectFitsAtEveryWidth(page);
});

test('regex-tester keeps a long match inside the match list', async ({ page }) => {
  await gotoTool(page, 'regex-tester', 'Regex Tester');
  await page.locator('#pattern').fill('\\w+');
  await setEditorText(editorByLabel(page, 'Test string'), TOKEN);
  await expect(page.getByText(/1 match/i).first()).toBeVisible();
  await expectFitsAtEveryWidth(page);
});

test('text-diff keeps a long changed line inside the diff', async ({ page }) => {
  await gotoTool(page, 'text-diff', 'Text Diff');
  await setEditorText(editorByLabel(page, 'Original text'), `${TOKEN}\nsame`);
  await setEditorText(editorByLabel(page, 'Changed text'), `${TOKEN}!\nsame`);
  await expect(page.locator('.diff')).toBeVisible();
  await expectFitsAtEveryWidth(page);
});

test('json-diff keeps a long changed value inside the change list', async ({ page }) => {
  await gotoTool(page, 'json-diff', 'JSON Diff');
  await setEditorText(editorByLabel(page, 'Original JSON'), `{"token": "${TOKEN}"}`);
  await setEditorText(editorByLabel(page, 'Changed JSON'), `{"token": "${TOKEN}!"}`);
  await expect(page.locator('.change')).toHaveCount(1);
  await expectFitsAtEveryWidth(page);
});

test('json-formatter keeps a long string value inside the result', async ({ page }) => {
  await gotoTool(page, 'json-formatter', 'JSON Formatter');
  await setEditorText(editorByLabel(page, 'JSON input'), `{"token":"${TOKEN}"}`);
  await page.getByRole('button', { name: 'Format', exact: true }).click();
  await expect(editorByLabel(page, 'Result')).toBeVisible();
  await expectFitsAtEveryWidth(page);
});

test('markdown-editor keeps a long word inside the preview', async ({ page }) => {
  await gotoTool(page, 'markdown-editor', 'Markdown Editor');
  await setEditorText(editorByLabel(page, 'Markdown source'), `# Title\n\n${TOKEN}`);
  await expect(page.getByRole('heading', { name: 'Title' })).toBeVisible();
  await expectFitsAtEveryWidth(page);
});

test('xml-viewer keeps a long text node inside the tree', async ({ page }) => {
  await gotoTool(page, 'xml-viewer', 'XML Viewer');
  await setEditorText(editorByLabel(page, 'XML source'), `<root><v>${TOKEN}</v></root>`);
  await expect(page.locator('.tree')).toBeVisible();
  await expectFitsAtEveryWidth(page);
});

test('jwt-editor keeps a long claim inside the payload editor', async ({ page }) => {
  await gotoTool(page, 'jwt-editor', 'JWT Editor');
  const b64url = (json: string) =>
    Buffer.from(json).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const token = `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(`{"sub":"${TOKEN}"}`)}.${TOKEN}`;
  await page.locator('#jwt-input').fill(token);
  await page.getByRole('button', { name: 'Load into editor' }).click();
  await expect(page.locator('#jwt-payload')).toHaveValue(/sub/);
  await expectFitsAtEveryWidth(page);
});

test('text-cleaner keeps a long token inside both editors', async ({ page }) => {
  await gotoTool(page, 'text-cleaner', 'Text Cleaner');
  await setEditorText(editorByLabel(page, 'Text to clean'), TOKEN);
  await expect(page.getByTestId('summary')).toBeVisible();
  await expectFitsAtEveryWidth(page);
});

test('base-converter keeps a 256-bit value inside every row', async ({ page }) => {
  await gotoTool(page, 'base-converter', 'Number Base Converter');
  // A 64-hex-digit value: unbreakable, and the binary row it produces is 256
  // characters long, which is the widest thing this tool can ever render.
  await page.getByRole('button', { name: 'Hexadecimal', exact: true }).click();
  await page.locator('#base-input').fill('f'.repeat(64));
  await expect(page.locator('.row__value').first()).toBeVisible();
  await expectFitsAtEveryWidth(page);
});

test('barcode-generator keeps a very wide barcode inside the preview', async ({ page }) => {
  await gotoTool(page, 'barcode-generator', 'Barcode Generator');
  // Code 128 takes any text, so a long token produces a barcode several
  // thousand pixels wide. It has to scroll or scale, not push the page open.
  await page.locator('#barcode-value').fill(TOKEN);
  await expect(page.getByTestId('barcode').locator('rect').first()).toBeVisible();
  await expectFitsAtEveryWidth(page);
});

test('slug-generator keeps a long slug inside its row', async ({ page }) => {
  await gotoTool(page, 'slug-generator', 'Slug Generator');
  await page.locator('#slug-input').fill(TOKEN);
  await expect(page.locator('.slug-row__slug').first()).toBeVisible();
  await expectFitsAtEveryWidth(page);
});

test('invoice-generator keeps a long line description inside the table', async ({ page }) => {
  await gotoTool(page, 'invoice-generator', 'Invoice & Receipt Generator');
  // The one table here that cannot stack: a line item only means anything as a
  // row, so it scrolls in its own box rather than pushing the page open.
  await page.getByLabel('Description, line 1').fill(TOKEN);
  await page.locator('#inv-to').fill(TOKEN);
  await expect(page.getByTestId('grand-total')).toBeVisible();
  await expectFitsAtEveryWidth(page);
});

test('email-template keeps a long link inside the message column', async ({ page }) => {
  await gotoTool(page, 'email-template', 'Email Template Generator');
  await setEditorText(editorByLabel(page, 'Your text'), `Hi,\n\nSee https://example.com/${TOKEN}`);

  const body = page.frameLocator('iframe[title="Email preview"]').locator('body');
  await expect(body).toContainText('example.com');

  // The tool's own page first — the walker only sees this document, not the
  // preview's.
  await expectFitsAtEveryWidth(page);

  // Then the email itself, which is the box that actually matters and is a
  // separate document. An unbreakable URL is what splits a message column
  // open, and 600 pixels is the one measurement every mail client agrees on.
  // Checked at 375px, which expectFitsAtEveryWidth has just left us at.
  const spill = await body.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(spill).toBeLessThanOrEqual(1);
});

test('image-viewer keeps a long pasted token inside the page', async ({ page }) => {
  await gotoTool(page, 'image-viewer', 'Image Viewer');
  // Valid Base64 of text, so it also puts up the "not an image" message and
  // the Open in button beside the box.
  await page.locator('#iv-paste').fill(TOKEN);
  await expect(page.getByRole('alert')).toContainText('not an image');
  await expectFitsAtEveryWidth(page);
});

test('jsonpath-tester keeps a long key and value inside the matches', async ({ page }) => {
  await gotoTool(page, 'jsonpath-tester', 'JSONPath Tester');
  await setEditorText(editorByLabel(page, 'JSON'), `{"${TOKEN}": "${TOKEN}"}`);
  await page.locator('#jsonpath').fill('$.*');
  await expect(page.locator('.match__path')).toHaveCount(1);
  await expectFitsAtEveryWidth(page);
});
