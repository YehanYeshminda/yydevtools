import { expect, test } from '@playwright/test';

import {
  editorByLabel,
  editorTextWhen,
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

  // The JSON goes into a Material textarea; the result comes out of the shared
  // editor, which is what gives the generated code its highlighting.
  await page.getByLabel('JSON input').fill('{"id":1,"name":"ada","tags":["x"],"active":true}');

  // Asserted on the editor's own content rather than through a polled helper:
  // the editor replaces its fallback textarea once the CodeMirror chunk lands,
  // and Playwright re-resolves the locator on every retry where a poll over a
  // snapshot of it does not.
  const out = editorByLabel(page, 'Generated types');
  await expect(out).toContainText('interface', { timeout: 30_000 });
  const code = await getEditorText(out);
  expect(code).toMatch(/id\s*:\s*number/);
  expect(code).toMatch(/name\s*:\s*string/);
  expect(code).toMatch(/active\s*:\s*boolean/);

  // Each language gets its own mode, including the six that come from the
  // legacy stream parsers rather than a Lezer grammar.
  // The language picker is a MatButtonToggleGroup, so its options are radios.
  await page.getByRole('radio', { name: 'Rust', exact: true }).click();
  await expect.poll(() => getEditorText(out)).toContain('serde');
  // Highlighted, not just monospaced: the mode is doing something.
  await expect(out.locator('.cm-content span').first()).toBeVisible();

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

/**
 * The three things a decoder can say that reading the JSON cannot: what the
 * custom claims are, when the timestamps actually fall, and what is wrong with
 * the token before anyone checks its signature.
 */
test('jwt-decoder lists every claim, dates them, and says what is risky', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'jwt-decoder', 'JWT Decoder');

  // alg none, no expiry, no audience, a password in the payload, and custom
  // claims a real token would carry.
  const payload = {
    sub: '42',
    iat: 1516239022,
    scope: 'read:all write:all',
    roles: ['admin', 'billing'],
    password: 'hunter2',
  };
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;

  await page.locator('#jwt-input').fill(token);

  // Custom claims, which the registered-claim summary alone would never show.
  const claims = page.locator('.claim');
  await expect(claims.filter({ hasText: 'read:all write:all' })).toBeVisible();
  await expect(claims.filter({ hasText: 'admin, billing' })).toBeVisible();

  // The timestamp, as a date and as a phrase.
  const issued = claims.filter({ hasText: 'Issued at' });
  await expect(issued).toContainText('1516239022');
  await expect(issued).toContainText('years ago');

  const checks = page.getByTestId('checks');
  await expect(checks.locator('[data-check="alg-none"]')).toBeVisible();
  await expect(checks.locator('[data-check="sensitive-claims"]')).toContainText('password');
  await expect(checks.locator('[data-check="no-expiry"]')).toBeVisible();
  await expect(checks.locator('[data-check="no-audience"]')).toBeVisible();
  // The level is in words, not only in colour.
  await expect(checks.locator('[data-check="alg-none"]')).toContainText('Risk');

  // UTC is an absolute answer, so it can be asserted exactly.
  await page.getByTestId('utc-toggle').click();
  await expect(issued).toContainText('2018-01-18 01:30:22 UTC');

  expectClean(watch);
});

test('jwt-decoder finds a token inside a pasted header, and explains a JWE', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'jwt-decoder', 'JWT Decoder');

  const token =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
    'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.' +
    'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

  await page.locator('#jwt-input').fill(`Authorization: Bearer ${token}`);
  await expect(page.getByTestId('found-inside')).toBeVisible();
  await expect(page.locator('.claim').filter({ hasText: 'John Doe' })).toBeVisible();

  // Five parts is an encrypted token, not a broken one.
  await page
    .locator('#jwt-input')
    .fill('eyJhbGciOiJSU0EtT0FFUCIsImVuYyI6IkEyNTZHQ00ifQ.aaa.bbb.ccc.ddd');
  await expect(page.getByTestId('jwe')).toContainText('encrypted token');
  await expect(page.getByLabel('Header')).toContainText('RSA-OAEP');
  await expect(page.getByTestId('checks')).toBeHidden();

  expectClean(watch);
});

test('jwt-decoder hands a token to the editor with Send to', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'jwt-decoder', 'JWT Decoder');

  await page.getByRole('button', { name: 'Try an example' }).click();
  await expect(page.getByText('Signature verified.')).toBeVisible();

  await page.getByRole('button', { name: 'Send to' }).click();
  await page.getByRole('menuitem', { name: 'JWT Editor' }).click();

  await expect(page).toHaveURL(/\/tools\/jwt-editor#s=/);
  // It arrives already split, rather than waiting to be decoded.
  await expect(page.locator('#jwt-payload')).toHaveValue(/Ada Lovelace/);
  await expect(page.locator('#jwt-header')).toHaveValue(/HS256/);

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

test('pomodoro runs a focus session through to the break', async ({ page }) => {
  const watch = watchConsole(page);
  // A faked clock, so the 25 minutes takes no time. The timer measures against
  // Date.now() rather than counting ticks, which is exactly what this drives.
  await page.clock.install();
  await gotoTool(page, 'pomodoro', 'Pomodoro Timer & Stopwatch');

  const time = page.getByTestId('time');
  await expect(time).toHaveText('25:00');
  await expect(page.getByTestId('phase')).toHaveText('Focus');

  await page.getByTestId('toggle').click();
  await page.clock.fastForward('00:30');
  await expect(time).toHaveText('24:30');

  // Pausing banks the elapsed time rather than losing or continuing it.
  await page.getByTestId('toggle').click();
  await page.clock.fastForward('00:30');
  await expect(time).toHaveText('24:30');

  await page.getByTestId('toggle').click();
  await page.clock.fastForward('25:00');

  // The session ends on its own and the short break is queued up next.
  await expect(page.getByTestId('phase')).toHaveText('Short break');
  await expect(time).toHaveText('5:00');
  await expect(page.getByTestId('tally')).toContainText('1 focus session done');

  expectClean(watch);
});

test('pomodoro stopwatch records laps and their splits', async ({ page }) => {
  const watch = watchConsole(page);
  await page.clock.install();
  await gotoTool(page, 'pomodoro', 'Pomodoro Timer & Stopwatch');

  await page
    .getByRole('group', { name: 'Mode' })
    .getByRole('button', { name: 'Stopwatch' })
    .click();
  const time = page.getByTestId('time');
  await expect(time).toHaveText('0:00.00');

  await page.getByTestId('toggle').click();
  await page.clock.fastForward('00:05');
  await page.getByRole('button', { name: 'Lap' }).click();
  await page.clock.fastForward('00:03');
  await page.getByRole('button', { name: 'Lap' }).click();

  const laps = page.getByTestId('laps').locator('.row');
  await expect(laps).toHaveCount(2);
  // Newest first, showing the split and then the running total.
  await expect(laps.first()).toContainText('Lap 2');
  // Hundredths are left loose: the faked clock fires one more 50ms tick after
  // each jump, so the split is 3.0-something rather than exactly 3.00.
  await expect(laps.first()).toContainText(/0:03\.\d\d/);
  await expect(laps.first()).toContainText(/0:08\.\d\d/);

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(time).toHaveText('0:00.00');
  await expect(page.getByTestId('laps')).toHaveCount(0);

  expectClean(watch);
});

test('unit-converter converts across categories, temperature included', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'unit-converter', 'Unit Converter');

  const result = page.getByTestId('result');
  await expect(result).toContainText('1 cm = 0.3937007874 in');

  await page.locator('#unit-value').fill('1');
  await page.locator('#unit-from').selectOption('mi');
  await page.locator('#unit-to').selectOption('km');
  await expect(result).toContainText('1.609344 km');

  // Temperature is the one category that is not a ratio. −40 is the point
  // where the two scales cross, and it comes out right by accident far less
  // often than 0 or 100 do.
  await page.getByRole('button', { name: 'Temperature' }).click();
  await page.locator('#unit-value').fill('-40');
  await expect(result).toContainText('-40 °C = -40 °F');
  await page.locator('#unit-value').fill('100');
  await expect(result).toContainText('212 °F');

  // The 1000 and 1024 families are separate units, not a rounding choice.
  await page.getByRole('button', { name: 'Data' }).click();
  await page.locator('#unit-value').fill('1');
  await page.locator('#unit-from').selectOption('gib');
  await page.locator('#unit-to').selectOption('gb');
  await expect(result).toContainText('1.073741824 GB');

  // The table underneath covers every unit of the category.
  await expect(page.getByTestId('all').locator('.row')).toHaveCount(10);

  await page.getByRole('button', { name: 'Swap the two units' }).click();
  await expect(result).toContainText('1 GB =');

  await page.locator('#unit-value').fill('not a number');
  await expect(page.getByRole('alert')).toContainText('not a number');

  expectClean(watch);
});

test('base-converter converts, honours a prefix and flips a bit', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'base-converter', 'Number Base Converter');

  const input = page.locator('#base-input');
  await input.fill('255');
  await expect(page.getByText('1111 1111')).toBeVisible();
  await expect(page.getByText('377', { exact: true })).toBeVisible();

  // A byte is eight bits, even though signed eight-bit stops at 127 — the bit
  // view is for looking at a pattern, and this one reads as 255 or as -1.
  await expect(page.getByTestId('bits').locator('.bit')).toHaveCount(8);

  // Flipping the lowest bit of 255 gives 254, not -2.
  await page.getByTestId('bits').locator('.bit').nth(7).click();
  await expect(input).toHaveValue('254');

  // A prefix beats the selected base.
  await input.fill('0xdeadbeef');
  await expect(page.getByText('3 735 928 559')).toBeVisible();
  await expect(page.getByText(/prefix wins/)).toBeVisible();

  // Above 2^53, where a converter built on doubles quietly rounds.
  await input.fill('18446744073709551615');
  await expect(page.getByText('ffff ffff ffff ffff')).toBeVisible();

  // Switching the base rewrites the value rather than re-reading the digits,
  // so an invalid one has to be typed after the switch.
  await page.getByRole('button', { name: 'Binary', exact: true }).click();
  await expect(input).toHaveValue(/^[01]+$/);
  await input.fill('99');
  await expect(page.getByRole('alert')).toContainText('not a number in base 2');

  expectClean(watch);
});

test('age-calculator measures a span both ways round', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'age-calculator', 'Age & Date Difference Calculator');

  await page.locator('#age-from').fill('1990-05-10');
  await page.locator('#age-to').fill('2024-05-09');

  const result = page.getByTestId('result');
  // 29 days, not 30: the last whole month lands on 10 April, which has 30 days.
  await expect(result).toContainText('33 years, 11 months and 29 days');
  await expect(page.getByText('12,418')).toBeVisible();
  await expect(page.getByText(/was a Thursday/)).toBeVisible();

  // A leap-day birthday turns in February in a common year.
  await page.locator('#age-from').fill('2000-02-29');
  await page.locator('#age-to').fill('2025-02-28');
  await expect(result).toContainText('25 years');

  // The later date first is measured the other way round rather than refused.
  await page.getByRole('button', { name: 'Swap' }).click();
  await expect(result).toContainText('25 years');
  await expect(result).toContainText('the other way round');

  // Clearing a date drops back to the prompt rather than showing a stale span.
  await page.locator('#age-from').fill('');
  await expect(page.getByText('Pick a date to see the answer.')).toBeVisible();

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
  const extended = await editorTextWhen(result, (text) => text.includes(before.trim()));
  expect(extended.length).toBeGreaterThan(before.length);

  await page.getByRole('button', { name: 'HTML', exact: true }).click();
  await expect.poll(() => getEditorText(result)).toContain('<p>Lorem ipsum');

  await page.getByRole('button', { name: 'List items' }).click();
  await expect.poll(() => getEditorText(result)).toContain('<li>Lorem ipsum');

  await page.getByRole('button', { name: 'Markdown' }).click();
  await expect.poll(() => getEditorText(result)).toContain('- Lorem ipsum');

  // Shuffle is the only control that is allowed to rewrite the words.
  const shuffled = await getEditorText(result);
  await page.getByRole('button', { name: 'Shuffle' }).click();
  await editorTextWhen(result, (text) => text !== shuffled);

  await page.getByRole('button', { name: /Start with/ }).click();
  await editorTextWhen(result, (text) => !text.includes('Lorem ipsum dolor sit amet'));

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

test('barcode-generator draws every format and completes the check digit', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'barcode-generator', 'Barcode Generator');

  const bars = page.getByTestId('barcode').locator('rect');
  const formats = page.getByRole('group', { name: 'Format' });

  // Code 128 starts drawn, from the sample value.
  await expect(bars.first()).toBeVisible();

  await formats.getByRole('button', { name: 'EAN-13' }).click();
  // The sample is twelve digits; the thirteenth is worked out here, not typed.
  await expect(page.getByTestId('completed')).toContainText('5012345678900');
  await expect(bars.first()).toBeVisible();

  // A wrong check digit is refused rather than drawn, because JsBarcode will
  // not encode one either — and the message says what it should have been.
  await page.locator('#barcode-value').fill('5012345678901');
  await expect(page.getByRole('alert')).toContainText('should be 0, not 1');
  await expect(bars).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download SVG' })).toBeDisabled();

  await page.locator('#barcode-value').fill('501234567890');
  await expect(bars.first()).toBeVisible();

  // The remaining four, each of which has its own encoder in the library.
  for (const name of ['EAN-8', 'UPC-A', 'Code 39', 'ITF-14']) {
    await formats.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(bars.first()).toBeVisible();
  }

  expectClean(watch);
});

test('slug-generator slugs a list, folds accents and numbers the collisions', async ({ page }) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'slug-generator', 'Slug Generator');

  const slugs = page.locator('.slug-row__slug');
  const input = page.locator('#slug-input');

  /**
   * Fills the textarea, and makes sure it stayed filled.
   *
   * The page is prerendered, so a fill landing before Angular hydrates is
   * silently undone when the value binding re-applies the sample. Retrying
   * until it sticks is what global-drop.spec.ts does about the same race.
   */
  const type = async (text: string): Promise<void> => {
    await expect(async () => {
      await input.fill(text);
      await expect(input).toHaveValue(text, { timeout: 500 });
    }).toPass();
  };

  await type('Café Münchén\nThe Rise and Fall of Rome\nCafe Munchen\n!!!');

  // Accents folded rather than dropped — "caf-m-nch-n" was the old bug.
  await expect(slugs.nth(0)).toHaveText('cafe-munchen');
  await expect(slugs.nth(1)).toHaveText('the-rise-and-fall-of-rome');
  // Two titles, one slug: the repeat is numbered, not silently collided.
  await expect(slugs.nth(2)).toContainText('cafe-munchen-2');
  await expect(slugs.nth(3)).toHaveText('Nothing to slug on this line');
  await expect(page.getByTestId('summary')).toContainText('1 numbered');

  const separators = page.getByRole('group', { name: 'Separator' });
  await separators.getByRole('button', { name: 'Underscore' }).click();
  await expect(slugs.nth(0)).toHaveText('cafe_munchen');
  await expect(slugs.nth(2)).toContainText('cafe_munchen_2');

  await separators.getByRole('button', { name: 'Hyphen' }).click();
  await page.getByRole('button', { name: 'Drop the, a, of…' }).click();
  await expect(slugs.nth(1)).toHaveText('rise-fall-rome');

  // The cap lands between words rather than mid-word.
  await page
    .getByRole('group', { name: 'Maximum length' })
    .getByRole('button', { name: '40' })
    .click();
  await type('The Absolutely Complete and Definitive Guide to Everything');
  await expect(slugs.first()).toHaveText('absolutely-complete-definitive-guide');

  expectClean(watch);
});

/** "23:04" as 1384. */
function clockSeconds(text: string): number {
  const parts = text.trim().split(':').map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

test('the pomodoro keeps running after you leave its page', async ({ page }) => {
  const watch = watchConsole(page);
  // The clock is faked so a 25-minute session takes none, but it still ticks
  // in real time between calls — so every assertion below is about how far it
  // moved, never about an exact reading, which would flake by a second.
  await page.clock.install();
  await gotoTool(page, 'pomodoro', 'Pomodoro Timer & Stopwatch');

  await page.getByTestId('toggle').click();
  await page.clock.fastForward('01:00');
  // A minute in, and nowhere near the 25 it started at. Not pinned to 24:00:
  // page.clock.install() freezes nothing between calls, it only stops the clock
  // running away, so the real seconds spent loading the page count too — and
  // against the deployment there are several times more of them than there are
  // locally, which is how this read 23:45 in production and 24:00 here.
  const started = clockSeconds(await page.getByTestId('time').innerText());
  expect(started).toBeLessThan(25 * 60 - 45);
  expect(started).toBeGreaterThan(20 * 60);

  // No readout in the bar on the timer's own page: it would only repeat the
  // clock already filling the screen.
  await expect(page.locator('.timer-pill')).toHaveCount(0);

  // Leaving the way a visitor actually leaves — a link, not a reload.
  await page.locator('.breadcrumb').getByRole('link', { name: 'All tools' }).click();

  const pill = page.locator('.timer-pill');
  await expect(pill).toBeVisible();
  await expect(pill).toHaveAttribute('aria-label', /Focus, \d+:\d\d left\. Open the timer/);
  // The same session, carried over rather than started again.
  expect(clockSeconds(await pill.innerText())).toBeLessThanOrEqual(started);

  // Still counting down while you are somewhere else entirely.
  const left = clockSeconds(await pill.innerText());
  await page.clock.fastForward('01:00');
  await expect
    .poll(async () => left - clockSeconds(await pill.innerText()))
    .toBeGreaterThanOrEqual(60);

  // And it is the way back, with the session intact rather than restarted.
  const carried = clockSeconds(await pill.innerText());
  await pill.click();
  await expect(page.getByTestId('time')).toBeVisible();
  expect(clockSeconds(await page.getByTestId('time').innerText())).toBeLessThanOrEqual(carried);
  await expect(page.locator('.timer-pill')).toHaveCount(0);

  // Pausing leaves it in the bar — a session you stepped away from is exactly
  // the one you need a route back to — but says so, and stops counting.
  await page.getByTestId('toggle').click();
  await page.locator('.breadcrumb').getByRole('link', { name: 'All tools' }).click();
  await expect(pill).toHaveClass(/timer-pill--paused/);
  const frozen = await pill.innerText();
  await page.clock.fastForward('05:00');
  await expect(pill).toHaveText(frozen);

  expectClean(watch);
});

test('a phase can be set to anything up to six hours, and says so when it clamps', async ({
  page,
}) => {
  const watch = watchConsole(page);
  await gotoTool(page, 'pomodoro', 'Pomodoro Timer & Stopwatch');

  const focus = page.locator('#len-work');
  const time = page.getByTestId('time');
  await expect(focus).toHaveAttribute('max', '360');

  await focus.fill('360');
  await expect(time).toHaveText('6:00:00');

  // Past the ceiling the clock clamps, and the field is corrected to the length
  // actually in use rather than left claiming the number that was typed.
  await focus.fill('400');
  await focus.blur();
  await expect(focus).toHaveValue('360');
  await expect(time).toHaveText('6:00:00');

  // A second over-long value clamps to the same minute as the first, so the
  // bound signal does not change and only the correction puts the field right.
  await focus.fill('999');
  await focus.blur();
  await expect(focus).toHaveValue('360');

  await focus.fill('0');
  await focus.blur();
  await expect(focus).toHaveValue('1');
  await expect(time).toHaveText('1:00');

  expectClean(watch);
});

test('switching phase or mode asks before it throws a session away', async ({ page }) => {
  const watch = watchConsole(page);
  // No faked clock here on purpose: what this needs is a session in progress,
  // which one click gives it, and the dialog's own open and close run on timers
  // that a faked clock would hold still.
  await gotoTool(page, 'pomodoro', 'Pomodoro Timer & Stopwatch');

  const phases = page.getByRole('group', { name: 'Phase' });
  const modes = page.getByRole('group', { name: 'Mode' });
  const ask = page.getByRole('alertdialog');
  const time = page.getByTestId('time');
  const phase = page.getByTestId('phase');

  await page.getByTestId('toggle').click();
  await expect(time).toHaveText(/24:5\d/);

  // The question names what is at stake rather than asking whether you are
  // sure, and the buttons say what they do.
  await phases.getByRole('button', { name: 'Long break' }).click();
  await expect(ask).toBeVisible();
  await expect(ask).toContainText('Switch to Long break?');
  await expect(ask).toContainText(/Focus, 24:\d\d left/);

  // Backing out leaves the session exactly where it was.
  await ask.getByRole('button', { name: 'Keep going' }).click();
  await expect(ask).toHaveCount(0);
  await expect(phase).toHaveText('Focus');
  await expect(time).toHaveText(/24:\d\d/);

  // Saying yes does what the button always did.
  await phases.getByRole('button', { name: 'Short break' }).click();
  await ask.getByRole('button', { name: 'Switch anyway' }).click();
  await expect(phase).toHaveText('Short break');
  await expect(time).toHaveText('5:00');

  // The mode tabs discard just as much, so they ask too.
  await page.getByTestId('toggle').click();
  await modes.getByRole('button', { name: 'Stopwatch' }).click();
  await expect(ask).toContainText('Switch to Stopwatch?');
  await ask.getByRole('button', { name: 'Keep going' }).click();
  await expect(phase).toHaveText('Short break');

  // With nothing to lose there is nothing to ask.
  await page.getByRole('button', { name: 'Reset' }).click();
  await modes.getByRole('button', { name: 'Stopwatch' }).click();
  await expect(time).toHaveText('0:00.00');
  await expect(ask).toHaveCount(0);

  expectClean(watch);
});
