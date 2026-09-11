import { expect, test } from '@playwright/test';

import {
  editorByLabel,
  expectClean,
  getEditorText,
  gotoTool,
  setEditorText,
  watchConsole,
} from './helpers';

/**
 * Does each text-based tool actually do its job?
 *
 * One real round trip per tool: give it input a user would give it, and assert
 * on the output it is supposed to produce — not merely that a box appeared.
 * File-based tools are in tools-files.spec.ts.
 */

test('json-formatter formats, minifies and converts to YAML', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'json-formatter', 'JSON Formatter');

  await setEditorText(
    editorByLabel(page, 'JSON input'),
    '{"service":"worker","retries":3,"cache":true}',
  );

  await page.getByRole('button', { name: 'Format', exact: true }).click();
  const result = editorByLabel(page, 'Result');
  await expect.poll(() => getEditorText(result)).toContain('"service": "worker"');

  await page.locator('.actions').getByRole('button', { name: 'Minify' }).click();
  await expect.poll(() => getEditorText(result)).toContain('{"service":"worker"');

  await page.locator('.actions').getByRole('button', { name: 'To YAML' }).click();
  await expect.poll(() => getEditorText(result)).toMatch(/service:\s*worker/);

  expectClean(watch);
});

test('json-formatter reports where a broken document failed', async ({ page }) => {
  await gotoTool(page, 'json-formatter');
  await setEditorText(editorByLabel(page, 'JSON input'), '{"a":1,}');
  await page.getByRole('button', { name: 'Format', exact: true }).click();

  // The tool reports the failure inline rather than clearing the editor.
  await expect(page.locator('.status--err, .status--error, [role="alert"]').first()).toBeVisible();
  await expect(page.locator('.panel').first()).toContainText(/invalid|unexpected|parse/i);
});

test('json-to-types turns JSON into a TypeScript interface', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'json-to-types', 'JSON to Types');

  // This tool uses a Material textarea, not the shared CodeMirror editor.
  await page.getByLabel('JSON input').fill('{"id":1,"name":"ada","tags":["x"],"active":true}');

  const out = page.locator('textarea').last();
  await expect.poll(() => out.inputValue()).toMatch(/interface|type/i);
  const code = await out.inputValue();
  expect(code).toMatch(/id\s*:\s*number/);
  expect(code).toMatch(/name\s*:\s*string/);
  expect(code).toMatch(/active\s*:\s*boolean/);

  expectClean(watch);
});

test('jwt-decoder splits a token into header and claims', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'jwt-decoder', 'JWT Decoder');

  // {"alg":"HS256","typ":"JWT"}.{"sub":"1234567890","name":"John Doe","iat":1516239022}
  const token =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.' +
    'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  await page.locator('#jwt-input').fill(token);

  await expect(page.getByText('HS256').first()).toBeVisible();
  await expect(page.getByText('John Doe').first()).toBeVisible();
  await expect(page.getByText('1234567890').first()).toBeVisible();

  expectClean(watch);
});

test('jwt-editor loads a token into editable header and payload', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'jwt-editor', 'JWT Editor');

  const token =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.' +
    'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  await page.locator('#jwt-input').fill(token);
  // Loading is explicit — pasting alone must not overwrite claims being edited.
  await page.getByRole('button', { name: 'Load into editor' }).click();

  await expect(page.locator('#jwt-payload')).toHaveValue(/John Doe/);
  await expect(page.locator('#jwt-header')).toHaveValue(/HS256/);

  expectClean(watch);
});

test('hash-generator produces the known SHA-256 of "abc"', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'hash-generator', 'Hash Generator');

  await page.locator('#hash-input').fill('abc');

  // The canonical digests, so this catches a wrong algorithm, not just "a hash".
  await expect(
    page.getByText('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'),
  ).toBeVisible();
  await expect(page.getByText('900150983cd24fb0d6963f7d28e17f72')).toBeVisible(); // MD5

  expectClean(watch);
});

test('text-diff finds the changed line', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'text-diff', 'Text Diff');

  await setEditorText(editorByLabel(page, 'Original text'), 'alpha\nbravo\ncharlie');
  await setEditorText(editorByLabel(page, 'Changed text'), 'alpha\nbravo!\ncharlie');

  await expect(page.locator('.diff')).toBeVisible();
  await expect(page.locator('.diff').getByText('bravo!', { exact: false }).first()).toBeVisible();

  expectClean(watch);
});

test('regex-tester highlights matches and counts them', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'regex-tester', 'Regex Tester');

  await page.locator('#pattern').fill('\\d+');
  await setEditorText(editorByLabel(page, 'Test string'), 'order 42 and order 7');

  await expect(page.getByText(/2 match/i).first()).toBeVisible();

  expectClean(watch);
});

test('cron-explainer reads an expression in plain English', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'cron-explainer', 'Cron Explainer');

  await page.locator('#cron').fill('0 9 * * 1');
  await expect(page.getByText(/Monday/i).first()).toBeVisible();
  await expect(page.getByText(/09:00|9:00/i).first()).toBeVisible();

  expectClean(watch);
});

test('qr-generator renders a code for a URL', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'qr-generator', 'QR Code Generator');

  await page.locator('#qr-url').fill('https://yydevtools.com');

  const code = page.locator('.preview__img');
  await expect(code).toBeVisible();
  await expect(code).toHaveAttribute('src', /^data:image\/png/);
  await expect(page.getByRole('button', { name: 'PNG', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'SVG', exact: true })).toBeEnabled();

  expectClean(watch);
});

test('case-converter converts an identifier into every case', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'case-converter', 'Case Converter');

  await page.locator('#case-input').fill('get user by ID');

  const values = page.locator('.row__value');
  await expect(values.first()).toBeVisible();
  const all = (await values.allTextContents()).join('\n');
  expect(all).toContain('getUserById');
  expect(all).toContain('get_user_by_id');
  expect(all).toContain('get-user-by-id');
  expect(all).toContain('GetUserById');

  expectClean(watch);
});

test('sql-formatter beautifies a one-line query', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'sql-formatter', 'SQL Formatter');

  await setEditorText(
    editorByLabel(page, 'SQL'),
    'select id, name from users where id = 1 order by name',
  );

  const out = editorByLabel(page, 'Formatted SQL');
  await expect.poll(() => getEditorText(out)).toMatch(/FROM|from/);
  expect((await getEditorText(out)).split('\n').length).toBeGreaterThan(2);

  expectClean(watch);
});

test('code-formatter beautifies CSS', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'code-formatter', 'Code Formatter');

  await page.locator('#language').selectOption('css');
  await setEditorText(editorByLabel(page, 'Source'), 'a{color:red;background:blue}');

  // Formatting is explicit: Prettier's engine plus the language plugin is a
  // multi-hundred-kB download, so it is not run on every keystroke.
  await page.getByRole('button', { name: 'Format', exact: true }).click();

  const out = editorByLabel(page, 'Formatted code');
  await expect.poll(() => getEditorText(out), { timeout: 45_000 }).toMatch(/color:\s*red;/);

  expectClean(watch);
});

test('html-preview renders the document in its sandboxed frame', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'html-preview', 'HTML Preview');

  await setEditorText(
    editorByLabel(page, 'HTML source'),
    '<h1 id="probe">Hello from the preview</h1>',
  );

  // The frame is built imperatively so its sandbox can be fixed at creation;
  // there is only ever one on the page.
  const frame = page.frameLocator('iframe[title="HTML preview"]');
  await expect(frame.locator('#probe')).toHaveText('Hello from the preview');

  // Scripts are off by default, and the frame must stay fully sandboxed until
  // the visitor opts in — this is the tool's core safety promise.
  await expect(page.locator('iframe[title="HTML preview"]')).toHaveAttribute('sandbox', '');

  expectClean(watch);
});

test('uuid-generator produces the requested number of valid v4 UUIDs', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'uuid-generator', 'UUID Generator');

  await page.locator('#uuid-count').fill('5');
  await page.getByRole('button', { name: /^Generate/ }).click();

  const values = page.locator('.row__value');
  await expect(values).toHaveCount(5);
  for (const text of await values.allTextContents()) {
    expect(text.trim()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  }

  expectClean(watch);
});

test('key-generator produces a usable RSA key pair', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'key-generator', 'Key Generator');

  await page.getByRole('button', { name: /^Generate/ }).click();

  await expect(page.getByText('-----BEGIN PRIVATE KEY-----').first()).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByText('-----BEGIN PUBLIC KEY-----').first()).toBeVisible();

  expectClean(watch);
});

test('password-generator produces a password of the requested length', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'password-generator', 'Password Generator');

  await page.locator('#pw-length').fill('24');
  await page.getByRole('button', { name: /^Generate/ }).click();

  const value = page.locator('.result__value').first();
  await expect(value).toBeVisible();
  expect((await value.textContent())!.trim()).toHaveLength(24);

  expectClean(watch);
});

test('color-converter converts a hex colour and checks contrast', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'color-converter', 'Color Converter');

  await page.locator('#fg-text').fill('#2f68f5');

  const body = page.locator('.panel').first();
  await expect(body).toContainText('rgb(47, 104, 245)');
  await expect(page.getByText(/oklch/i).first()).toBeVisible();

  expectClean(watch);
});

test('base64-converter round-trips text', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'base64-converter', 'Base64 Converter');

  // The tool opens on the File tab; text encoding lives behind the Text tab.
  await page.getByRole('tab', { name: 'Text' }).click();
  await page.locator('#b64-text').fill('hello world');

  await expect(page.locator('#b64-result')).toHaveValue(/aGVsbG8gd29ybGQ=/);

  expectClean(watch);
});

test('xml-viewer formats a document and shows it as a tree', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'xml-viewer', 'XML Viewer');

  await setEditorText(
    editorByLabel(page, 'XML source'),
    '<catalog><book id="1"><title>Dune</title></book></catalog>',
  );

  await expect(page.locator('.tree')).toBeVisible();
  await expect(page.locator('.tree')).toContainText('catalog');
  await expect(page.locator('.tree')).toContainText('Dune');

  expectClean(watch);
});

test('url-encoder encodes a value and breaks a URL into parts', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'url-encoder', 'URL Encoder / Decoder');

  await page.locator('#url-input').fill('https://example.com/a b?q=x&y=1#frag');

  const panel = page.locator('.panel').first();
  await expect(panel).toContainText('a%20b');
  await expect(panel).toContainText('example.com');

  expectClean(watch);
});

test('timestamp-converter converts a known epoch second', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'timestamp-converter', 'Timestamp Converter');

  await page.locator('#ts-input').fill('1700000000');

  const values = page.locator('.row__value');
  await expect(values.first()).toBeVisible();
  const all = (await values.allTextContents()).join('\n');
  expect(all).toContain('2023'); // 2023-11-14T22:13:20Z
  expect(all).toMatch(/2023-11-14/);

  expectClean(watch);
});

test('word-counter counts words, characters and sentences', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'word-counter', 'Word & Character Counter');

  await page.locator('#wc-input').fill('One two three. Four five!');

  const panel = page.locator('.panel').first();
  await expect(panel).toContainText('5'); // words
  await expect(panel).toContainText('25'); // characters
  await expect(page.getByText(/reading time/i).first()).toBeVisible();

  expectClean(watch);
});

test('markdown-editor previews what was typed', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'markdown-editor', 'Markdown Editor');

  await setEditorText(editorByLabel(page, 'Markdown source'), '# Title\n\nSome **bold** text.');

  const preview = page.locator('section[aria-label="Preview"]');
  await expect(preview.locator('h1')).toHaveText('Title');
  await expect(preview.locator('strong')).toHaveText('bold');

  expectClean(watch);
});
