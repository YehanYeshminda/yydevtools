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
