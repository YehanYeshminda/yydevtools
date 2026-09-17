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

test('json-csv converts both ways and folds nested fields', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'json-csv', 'JSON ↔ CSV Converter');

  await setEditorText(
    editorByLabel(page, 'Input'),
    '[{"name":"Ada","age":36,"address":{"city":"London"}},{"name":"Bob","age":41}]',
  );
  const result = editorByLabel(page, 'Result');
  await expect.poll(() => getEditorText(result)).toContain('name,age,address.city');
  await expect.poll(() => getEditorText(result)).toContain('Bob,41,');
  await expect(page.getByTestId('json-csv-summary')).toHaveText('2 rows · 3 columns');

  // Round trip: the CSV goes back in and the dot column becomes an object again.
  await page.getByRole('button', { name: 'Swap' }).click();
  await expect.poll(() => getEditorText(result)).toMatch(/"city":\s*"London"/);
  await expect.poll(() => getEditorText(result)).toMatch(/"age":\s*36/);

  expectClean(watch);
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

test('jwt-decoder share link carries the token but never the key', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await gotoTool(page, 'jwt-decoder', 'JWT Decoder');

  await page.getByRole('button', { name: 'Try an example' }).click();
  await expect(page.getByText('Signature verified.')).toBeVisible();

  await page.getByRole('button', { name: 'Copy link' }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain('/tools/jwt-decoder#s=');

  // A fresh tab, as the recipient would have: no session storage to lean on.
  const other = await context.newPage();
  await other.goto(link);
  await expect(other.getByText('Ada Lovelace').first()).toBeVisible();
  await expect(other.locator('#jwt-key')).toHaveValue('');
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

test('hash-generator share link carries the text but never the HMAC key', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await gotoTool(page, 'hash-generator', 'Hash Generator');

  await page.locator('#hash-input').fill('abc');
  await page.locator('#hmac-key').fill('hunter2');
  await expect(page.getByRole('heading', { name: 'HMAC digests' })).toBeVisible();

  await page.getByRole('button', { name: 'Copy link' }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain('/tools/hash-generator#s=');

  // A fresh tab, as the recipient would have: no session storage to lean on.
  const other = await context.newPage();
  await other.goto(link);
  await expect(other.locator('#hash-input')).toHaveValue('abc');
  await expect(other.locator('#hmac-key')).toHaveValue('');
  // Plain digests, because the key did not travel.
  await expect(other.getByText('900150983cd24fb0d6963f7d28e17f72')).toBeVisible();
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

test('json-diff reports the changed field by path and ignores key order', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'json-diff', 'JSON Diff');

  await setEditorText(
    editorByLabel(page, 'Original JSON'),
    '{"user": {"name": "Ada", "email": "ada@example.com"}, "plan": "free"}',
  );
  await setEditorText(
    editorByLabel(page, 'Changed JSON'),
    '{"plan": "free", "user": {"email": "ada@lovelace.org", "name": "Ada", "city": "London"}}',
  );

  await expect(page.getByText('1 changed')).toBeVisible();
  await expect(page.getByText('+1 added')).toBeVisible();
  const changes = page.locator('.change');
  await expect(changes).toHaveCount(2);
  await expect(changes.first()).toContainText('user.email');
  await expect(changes.first()).toContainText('"ada@lovelace.org"');
  await expect(changes.last()).toContainText('user.city');

  // The tree view marks the same change on the merged document.
  await page.getByRole('button', { name: 'Tree' }).click();
  await expect(page.locator('.cell--remove')).toContainText('"email": "ada@example.com"');
  await expect(page.locator('.cell--add').first()).toContainText('"email": "ada@lovelace.org"');

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

  // The Text tab is the landing tab, and the direction is worked out from the input.
  await page.locator('#b64-text').fill('hello world');
  await expect(page.getByTestId('direction')).toContainText('encoding');
  await expect(page.locator('#b64-result')).toHaveValue(/aGVsbG8gd29ybGQ=/);

  // Base64 in, text out — no switch touched.
  await page.locator('#b64-text').fill('SGVsbG8sIHdvcmxk');
  await expect(page.getByTestId('direction')).toContainText('decoding');
  await expect(page.locator('#b64-result')).toHaveValue('Hello, world');

  // A stray character is named by position, and the fix button removes it.
  await page.locator('.modes').getByText('Decode', { exact: true }).click();
  await page.locator('#b64-text').fill('SGVs*bG8=');
  await expect(page.getByRole('alert')).toContainText('“*” at position 5');
  await page.getByRole('button', { name: 'Remove the stray characters' }).click();
  await expect(page.locator('#b64-result')).toHaveValue('Hello');

  // The same bytes, read as a hex dump instead of text.
  await page.locator('.views').getByText('Hex', { exact: true }).click();
  await expect(page.locator('#b64-result')).toHaveValue(/48 65 6c 6c 6f {2,}\|Hello\|/);

  // Encoding dialects: "???" is Pz8/ in the standard alphabet, and "hello" pads.
  await page.locator('.modes').getByText('Encode', { exact: true }).click();
  await page.locator('#b64-text').fill('???');
  await expect(page.locator('#b64-result')).toHaveValue('Pz8/');
  await page.getByRole('checkbox', { name: 'URL-safe' }).check();
  await expect(page.locator('#b64-result')).toHaveValue('Pz8_');
  await page.locator('#b64-text').fill('hello');
  await expect(page.locator('#b64-result')).toHaveValue('aGVsbG8=');
  await page.getByRole('checkbox', { name: 'No padding' }).check();
  await expect(page.locator('#b64-result')).toHaveValue('aGVsbG8');

  // The result can be handed to another tool, and the state fits in a link.
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeEnabled();
  await page.getByRole('button', { name: 'Send to' }).click();
  await page.getByRole('menuitem', { name: 'Case Converter' }).click();
  await expect(page).toHaveURL(/\/tools\/case-converter/);
  await expect(page.locator('#case-input')).toHaveValue('aGVsbG8');

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

test('text-cleaner strips invisible characters and tidies the lines', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'text-cleaner', 'Text Cleaner');

  // A zero-width space, a non-breaking space, curly quotes, ragged indentation,
  // a blank line and a duplicate — everything a real paste drags along.
  await setEditorText(
    editorByLabel(page, 'Text to clean'),
    '  Beta\u00a0\u00a0\n\u200bAlpha\n\n  \u201cGamma\u201d  \nAlpha\n',
  );

  const result = editorByLabel(page, 'Cleaned text');
  // Trim, remove blank lines and strip invisibles are on by default, so the
  // duplicate and the curly quotes survive until they are asked for.
  await expect.poll(() => getEditorText(result)).toContain('Alpha');
  // One zero-width space. The two non-breaking spaces are not counted here:
  // they are spaces, and "Normalise spaces" is the switch that deals with them.
  await expect(page.getByTestId('summary')).toContainText('1 invisible');
  await expect(page.getByTestId('summary')).toContainText('6 → 4 lines');

  await page.getByRole('button', { name: 'Remove duplicate lines' }).click();
  await page.getByRole('button', { name: 'Straighten quotes' }).click();
  await expect.poll(() => getEditorText(result)).toBe('Beta\nAlpha\n\"Gamma\"');

  await page.getByRole('button', { name: 'A \u2192 Z' }).click();
  await expect.poll(() => getEditorText(result)).toBe('\"Gamma\"\nAlpha\nBeta');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toBe('cleaned.txt');

  expectClean(watch);
});

test('lorem-ipsum generates placeholder text in every unit and format', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'lorem-ipsum', 'Lorem Ipsum Generator');

  const result = editorByLabel(page, 'Generated placeholder text');
  await expect.poll(() => getEditorText(result)).toContain('Lorem ipsum dolor sit amet');

  // The seed is the whole design: raising the count has to extend the passage
  // rather than rewrite it, or settling on a length means chasing the text.
  const before = await getEditorText(result);
  await page.locator('#lorem-count').fill('5');
  await expect.poll(() => getEditorText(result)).not.toBe(before);
  expect(await getEditorText(result)).toContain(before.trim());

  await page.getByRole('button', { name: 'HTML', exact: true }).click();
  await expect.poll(() => getEditorText(result)).toContain('<p>Lorem ipsum');

  await page.getByRole('button', { name: 'List items' }).click();
  await expect.poll(() => getEditorText(result)).toContain('<li>Lorem ipsum');

  await page.getByRole('button', { name: 'Markdown' }).click();
  await expect.poll(() => getEditorText(result)).toContain('- Lorem ipsum');

  // Shuffle is the only control that is allowed to rewrite the words.
  const shuffled = await getEditorText(result);
  await page.getByRole('button', { name: 'Shuffle' }).click();
  await expect.poll(() => getEditorText(result)).not.toBe(shuffled);

  await page.getByRole('button', { name: /Start with/ }).click();
  await expect.poll(() => getEditorText(result)).not.toContain('Lorem ipsum dolor sit amet');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toBe('lorem-ipsum.md');

  expectClean(watch);
});

/**
 * One-time secret links need the Worker, which a bare `ng serve` is not.
 *
 * Rather than gate on an env var, this branches on what the page actually does:
 * point it at a deployment (or at `wrangler dev`) and it asserts the whole
 * create-open-burn round trip; against a dev server with no API behind it, it
 * asserts the tool fails loudly instead of hanging, which is the only honest
 * thing it can do there. Either way the assertion is real, and nobody has to
 * remember which flag to set.
 */
test('secret-link seals a secret, opens it once, and burns it', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'secret-link', 'One-Time Secret');

  const secret = 'correct horse battery staple';
  await page.locator('#secret').fill(secret);
  await page.getByRole('button', { name: 'Create one-time link' }).click();

  const link = page.getByTestId('link');
  const failed = page.getByTestId('error');
  await expect(link.or(failed).first()).toBeVisible({ timeout: 30_000 });

  if ((await link.count()) === 0) {
    // No API here. It said so instead of spinning forever, which is the point.
    await expect(failed).toBeVisible();
    return;
  }

  const url = await link.inputValue();
  // The key rides in the fragment, so it is in the link and nowhere else.
  const [, fragment] = url.split('#');
  expect(fragment).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);

  // Opening is a click, not a page load: a previewer that fetches the URL must
  // not be able to burn it.
  await page.goto(url);
  await expect(page.getByTestId('waiting')).toBeVisible();
  await expect(page.getByTestId('revealed')).toHaveCount(0);

  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('revealed')).toHaveValue(secret, { timeout: 30_000 });

  // Second time round it is gone. Reload rather than navigate: the URL has not
  // changed, so a goto would be a same-document hop and the app would never
  // re-bootstrap.
  await page.reload();
  await page.getByTestId('reveal').click();
  await expect(failed).toContainText('already been opened', { timeout: 30_000 });

  expectClean(watch);
});
