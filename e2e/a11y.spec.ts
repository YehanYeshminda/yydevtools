import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { editorByLabel, gotoTool, setEditorText, setTheme, uploadFiles } from './helpers';

/**
 * CLAUDE.md sets the bar: the site must pass AXE and meet WCAG AA. The redesign
 * repainted every surface, so contrast and focus are exactly what is at risk —
 * this runs the audit in both themes.
 *
 * AdSense injects third-party iframes and markup that fail rules the app does
 * not control, so the ad slots are excluded and everything else is in scope.
 */
const audit = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('app-ad-slot')
    .exclude('iframe[title="Advertisement"]')
    .exclude('iframe[name^="aswift"]')
    .exclude('#google_esf');

/**
 * Waits for the loading veil to take itself out of the DOM.
 *
 *  is a fixed, decorative full-screen layer that fades and removes
 * itself about a second and a half in. An audit that lands while it is still
 * fading measures text blended through a partial opacity and reports a
 * contrast failure against the veil rather than against the page — which is
 * what made this suite fail on a different surface every run.
 */
async function expectSplashGone(page: Page): Promise<void> {
  await expect(page.locator('#splash')).toHaveCount(0);
}

/**
 * Insists a region really does scroll sideways before it is audited for being
 * a scroll region.
 *
 * `scrollable-region-focusable` only fires on an element whose content is
 * actually wider than its box, so an audit of a `<pre>` that happens to fit
 * passes whether or not it is reachable by keyboard. That is not theoretical:
 * the json-formatter block below was green for exactly that reason while the
 * violation was still there. Asserting the precondition means the audit cannot
 * quietly stop covering anything.
 */
async function expectScrolls(target: Locator): Promise<void> {
  const overflow = await target.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow, 'this no longer overflows, so the audit below proves nothing').toBeGreaterThan(
    0,
  );
}

const SURFACES: Array<[string, string]> = [
  ['home', '/'],
  ['tool (text)', '/tools/json-formatter'],
  ['tool (file)', '/tools/pdf-merge'],
  // Two columns, a file picker and a canvas carrying a rendered document —
  // none of which the other two tool surfaces have.
  ['tool (live preview)', '/tools/invoice-generator'],
  ['guides index', '/guides'],
  // An article, not just the list of them. The guides are the site's largest
  // prose surface and none was audited: the index only exercises cards. This
  // one is picked because it uses every block the model has — headings, lists,
  // captioned code, both callout tones and two tool cards — so it covers the
  // shared article template rather than one guide's content.
  ['guide article', '/guides/html-email-explained'],
  ['about', '/about'],
  ['privacy', '/privacy'],
  ['terms', '/terms'],
  ['contact', '/contact'],
];

for (const theme of ['dark', 'light'] as const) {
  for (const [name, path] of SURFACES) {
    test(`${name} has no AXE violations in the ${theme} theme`, async ({ page }) => {
      await page.goto(path);
      await setTheme(page, theme);
      await expect(page.locator('h1').first()).toBeVisible();
      await expectSplashGone(page);

      const results = await audit(page).analyze();
      const summary = results.violations.map(
        (violation) =>
          `${violation.id} (${violation.impact}): ${violation.help}\n  ` +
          violation.nodes
            .slice(0, 3)
            .map((node) => node.target.join(' '))
            .join('\n  '),
      );
      expect(summary, `AXE violations on ${path} [${theme}]:\n${summary.join('\n')}`).toEqual([]);
    });
  }
}

test('the command palette dialog is accessible when open', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('dialog')).toBeVisible();

  const results = await audit(page).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help}`);
  expect(summary, `AXE violations with the palette open:\n${summary.join('\n')}`).toEqual([]);
});

test('the whole header is reachable and operable from the keyboard', async ({ page }) => {
  await page.goto('/');
  await page.locator('body').press('Tab');

  // Walk the first dozen stops and make sure focus stays visible and inside the
  // document rather than disappearing into an element with no focus style.
  const reached: string[] = [];
  for (let i = 0; i < 12; i++) {
    const active = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
        outline: style.outlineStyle,
      };
    });
    if (!active) break;
    reached.push(`${active.tag}:${active.label}`);
    await page.keyboard.press('Tab');
  }

  expect(reached.length, 'nothing was focusable from the top of the page').toBeGreaterThan(5);
  // Every stop must carry an accessible name — an unnamed control is a dead end
  // for a screen-reader user.
  const unnamed = reached.filter((entry) => entry.endsWith(':'));
  expect(unnamed, `focusable controls with no accessible name: ${unnamed.join(', ')}`).toEqual([]);
});

/**
 * The one surface whose colours are not the palette's.
 *
 * Every swatch paints itself with a colour out of the uploaded image and
 * writes its hex across it, so contrast here is decided at runtime by
 * readableOn() rather than by a token anyone can inspect. A regression would
 * be invisible until someone dropped in the wrong photograph.
 */
for (const theme of ['dark', 'light'] as const) {
  test(`extracted palette swatches have no AXE violations in the ${theme} theme`, async ({
    page,
  }) => {
    await gotoTool(page, 'palette-extractor', 'Colour Palette Extractor');
    await setTheme(page, theme);
    await expectSplashGone(page);
    await uploadFiles(page, ['sample.png']);
    await expect(page.locator('.swatch').first()).toBeVisible();

    const results = await audit(page).analyze();
    expect(
      results.violations.map(
        (violation) =>
          `${violation.id}: ${violation.nodes
            .map((node) => node.target.join(' '))
            .slice(0, 6)
            .join(' | ')}`,
      ),
    ).toEqual([]);
  });
}

/**
 * The passport tool's action row, which only exists once a photo is loaded.
 *
 * Its guides toggle is a Material button wearing the .chip--on class, and that
 * combination shipped unreadable: the class set `color`, but
 * `.mat-mdc-button:not(:disabled)` sets the label colour and outranks it, so
 * the label stayed brand-yellow on a brand-yellow fill at 1.04:1. Nothing
 * audited that surface, because the audits all ran on an empty page.
 */
for (const theme of ['dark', 'light'] as const) {
  test(`passport-photo's result controls have no AXE violations in the ${theme} theme`, async ({
    page,
  }) => {
    await gotoTool(page, 'passport-photo', 'Passport Photo Maker');
    await setTheme(page, theme);
    await expectSplashGone(page);
    await uploadFiles(page, ['sample-photo.jpg']);
    await expect(page.getByTestId('photo')).toBeVisible({ timeout: 45_000 });

    // Both states of the toggle: it is the "on" one that was unreadable.
    const guides = page.getByRole('button', { name: /guides/ });
    for (let pass = 0; pass < 2; pass++) {
      const results = await audit(page).analyze();
      expect(
        results.violations.map(
          (violation) =>
            `${violation.id}: ${violation.nodes
              .map((node) => node.target.join(' '))
              .slice(0, 6)
              .join(' | ')}`,
        ),
      ).toEqual([]);
      await guides.click();
    }
  });
}

/**
 * The site's one confirmation, which only exists while a timer is running.
 *
 * A modal is the surface where accessibility is easiest to get wrong — the
 * focus trap, the name, the description, and a filled button whose label takes
 * its colour from a token rather than from the class beside it, which is how
 * the passport toggle came to ship at 1.04:1.
 */
for (const theme of ['dark', 'light'] as const) {
  test(`the confirmation dialog has no AXE violations in the ${theme} theme`, async ({ page }) => {
    await gotoTool(page, 'pomodoro', 'Pomodoro Timer & Stopwatch');
    await setTheme(page, theme);
    await expectSplashGone(page);

    await page.getByTestId('toggle').click();
    await page
      .getByRole('group', { name: 'Phase' })
      .getByRole('button', { name: 'Short break' })
      .click();
    await expect(page.getByRole('alertdialog')).toBeVisible();

    const results = await audit(page).analyze();
    expect(
      results.violations.map(
        (violation) =>
          `${violation.id}: ${violation.nodes
            .map((node) => node.target.join(' '))
            .slice(0, 6)
            .join(' | ')}`,
      ),
    ).toEqual([]);
  });
}

/**
 * The editor's three states, none of which exist until a PDF is open.
 *
 * It is the densest surface on the site — a toolbar, a button over every run
 * of text on the page, a panel that opens on top of the document, and a row of
 * controls for whatever was added last. All of it sits over a white page
 * rather than over the theme's own background, which is exactly where
 * contrast goes wrong in the dark theme.
 */
for (const theme of ['dark', 'light'] as const) {
  test(`pdf-edit has no AXE violations in the ${theme} theme`, async ({ page }) => {
    await gotoTool(page, 'pdf-edit', 'PDF Editor');
    await setTheme(page, theme);
    await expectSplashGone(page);
    await uploadFiles(page, ['sample.pdf']);
    await expect(page.locator('.sheet__page')).toBeVisible({ timeout: 45_000 });

    const check = async (state: string) => {
      const results = await audit(page).analyze();
      expect(
        results.violations.map(
          (violation) =>
            `${violation.id}: ${violation.nodes
              .map((node) => node.target.join(' '))
              .slice(0, 6)
              .join(' | ')}`,
        ),
        `AXE violations with ${state} [${theme}]`,
      ).toEqual([]);
    };

    await check('the page open');

    await page.getByRole('button', { name: 'Annual Report', exact: true }).click();
    await expect(page.getByTestId('run-editor')).toBeVisible();
    await check('a line being edited');

    await page.getByRole('button', { name: 'Add text' }).click();
    await page.getByTestId('sheet').click({ position: { x: 60, y: 300 } });
    await expect(page.getByLabel('Text you added')).toBeVisible();
    await check('an added line selected');
  });
}

/**
 * The JWT Decoder with a token in it.
 *
 * The busiest thing on the page is the checks panel, whose three levels are
 * drawn with colour — an error container, a tertiary icon, a neutral pill —
 * over a container surface. Auditing the empty page would never see any of it,
 * and the claims table underneath tints a whole row when a token has expired.
 */
for (const theme of ['dark', 'light'] as const) {
  test(`jwt-decoder's decoded state has no AXE violations in the ${theme} theme`, async ({
    page,
  }) => {
    await gotoTool(page, 'jwt-decoder', 'JWT Decoder');
    await setTheme(page, theme);
    await expectSplashGone(page);

    // Unsigned, expired, no audience and carrying a password: one token that
    // puts every level of the panel on screen at once, plus a warned claim row.
    const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const token =
      `${b64({ alg: 'none', typ: 'JWT', kid: '2026-01' })}.` +
      `${b64({ sub: '42', iat: 1516239022, exp: 1516242622, password: 'hunter2' })}.`;
    await page.locator('#jwt-input').fill(token);
    await expect(page.getByTestId('checks')).toBeVisible();
    await expect(page.locator('.claim--warn')).toBeVisible();
    // The kid hint, whose chip is the one element painted with the strengthened
    // signature colour.
    await expect(page.getByTestId('kid-hint')).toBeVisible();

    const results = await audit(page).analyze();
    expect(
      results.violations.map(
        (violation) =>
          `${violation.id}: ${violation.nodes
            .map((node) => node.target.join(' '))
            .slice(0, 6)
            .join(' | ')}`,
      ),
      `AXE violations with a decoded token [${theme}]`,
    ).toEqual([]);
  });
}

/**
 * The JSON Formatter with a broken document in it.
 *
 * The error state is the one nobody audits, because you have to break something
 * to see it: an error-coloured message, a muted "line 3, column 8" beside it,
 * and a fixed-width excerpt on its own surface with a caret under the offending
 * character. All of it is drawn in colour over a container, and none of it
 * exists on the empty page.
 *
 * The document is minified on purpose. This ran on a four-line one and passed
 * while the excerpt was still an unreachable scroll region — the offending
 * line was simply too short to overflow, so the rule never fired and the pass
 * meant nothing. A minified document is also the realistic case: it is one
 * long line, which is exactly when an excerpt of it needs scrolling.
 */
for (const theme of ['dark', 'light'] as const) {
  test(`json-formatter's error state has no AXE violations in the ${theme} theme`, async ({
    page,
  }) => {
    await gotoTool(page, 'json-formatter');
    await setTheme(page, theme);

    await setEditorText(
      editorByLabel(page, 'JSON input'),
      '{"order":{"id":"A-99213","customer":"Bakery Orders Tracker Ltd","lines":' +
        '[{"sku":"FLOUR-25KG","qty":4},{"sku":"YEAST-500G","qty":12}],"total":184.5,"paid":oops}}',
    );
    await expect(page.getByTestId('json-problem')).toBeVisible();
    await expect(page.getByTestId('json-problem-excerpt')).toBeVisible();
    await expectScrolls(page.getByTestId('json-problem-excerpt'));

    const results = await audit(page).analyze();
    expect(
      results.violations.map(
        (violation) =>
          `${violation.id}: ${violation.nodes
            .map((node) => node.target.join(' '))
            .slice(0, 6)
            .join(' | ')}`,
      ),
      `AXE violations with a broken document [${theme}]`,
    ).toEqual([]);
  });
}

/**
 * The two tools that hand back a block of generated text to copy out.
 *
 * Favicon Generator's head snippet and Key Generator's PEM are both `<pre>`
 * with `overflow-x: auto` and no wrapping, so past a certain line length they
 * become scroll regions — and a scroll region that is not a focus stop has its
 * right-hand half unavailable to anyone not using a mouse.
 *
 * Both are audited at phone width, which is the whole reason these are
 * separate blocks rather than rows in SURFACES. Measured at the suite's usual
 * 1440: the snippet's longest line is 71 characters and the PEM's is 64, and
 * both sit in a 998px box with nothing to scroll. At 375 the snippet needs
 * 535px and the PEM 455px. Audited at desktop width these would pass with or
 * without the fix, which is the same trap the json-formatter block fell into.
 */
for (const theme of ['dark', 'light'] as const) {
  test(`favicon-generator's head snippet has no AXE violations in the ${theme} theme`, async ({
    page,
  }) => {
    await gotoTool(page, 'favicon-generator', 'Favicon Generator');
    await setTheme(page, theme);
    await expectSplashGone(page);

    await uploadFiles(page, ['sample-photo.jpg']);
    await expect(page.getByTestId('icon-preview')).toHaveCount(7, { timeout: 60_000 });
    await expect(page.getByTestId('head-snippet')).toContainText('rel="manifest"');

    await page.setViewportSize({ width: 375, height: 812 });
    await expectScrolls(page.getByTestId('head-snippet'));

    const results = await audit(page).analyze();
    expect(
      results.violations.map(
        (violation) =>
          `${violation.id}: ${violation.nodes
            .map((node) => node.target.join(' '))
            .slice(0, 6)
            .join(' | ')}`,
      ),
      `AXE violations on the head snippet [${theme}]`,
    ).toEqual([]);
  });

  test(`key-generator's PEM output has no AXE violations in the ${theme} theme`, async ({
    page,
  }) => {
    await gotoTool(page, 'key-generator', 'Key Generator');
    await setTheme(page, theme);
    await expectSplashGone(page);

    await page.getByRole('button', { name: /^Generate/ }).click();
    await expect(page.getByText('-----BEGIN PRIVATE KEY-----').first()).toBeVisible({
      timeout: 45_000,
    });

    await page.setViewportSize({ width: 375, height: 812 });
    // The private key, which is the one carrying the error-tinted border.
    await expectScrolls(page.locator('.key__pem').first());

    const results = await audit(page).analyze();
    expect(
      results.violations.map(
        (violation) =>
          `${violation.id}: ${violation.nodes
            .map((node) => node.target.join(' '))
            .slice(0, 6)
            .join(' | ')}`,
      ),
      `AXE violations on the generated key pair [${theme}]`,
    ).toEqual([]);
  });
}

/**
 * The Email Template Generator, which has a look selector built from the same
 * `.chip--on` that shipped at 1.04:1 on the passport toggle, and an accent
 * colour the person picks — so the one thing on the page whose contrast is not
 * decided by a token at all.
 */
for (const theme of ['dark', 'light'] as const) {
  test(`email-template's controls have no AXE violations in the ${theme} theme`, async ({
    page,
  }) => {
    await gotoTool(page, 'email-template');
    await setTheme(page, theme);
    await expectSplashGone(page);

    // Each look in turn, so the selected chip is audited in every position
    // rather than only wherever it happened to start.
    for (const look of ['Plain', 'Announcement', 'Newsletter']) {
      await page.getByRole('button', { name: look, exact: true }).click();
      // The preview frame is excluded because AXE cannot enter it: the frame
      // has an empty `sandbox`, so nothing may run inside it, and axe-core
      // waits for an injected script there that can never answer — the test
      // hung for the full ninety seconds before this was added. The email is
      // audited instead as its own document, below.
      const results = await audit(page).exclude('iframe[title="Email preview"]').analyze();
      expect(
        results.violations.map(
          (violation) =>
            `${violation.id}: ${violation.nodes
              .map((node) => node.target.join(' '))
              .slice(0, 6)
              .join(' | ')}`,
        ),
        `AXE violations with the ${look} look selected [${theme}]`,
      ).toEqual([]);
    }
  });
}

/**
 * The email itself, audited as the document it will be.
 *
 * The preview runs in a frame with an empty `sandbox`, which is exactly the
 * point — an email has no scripts, so it is given no permissions — but it also
 * means AXE cannot inject itself into that frame. Auditing only the tool page
 * would therefore leave the actual deliverable unchecked, so the generated
 * markup is loaded as a page of its own and audited there — and it is the file
 * that leaves this site, which makes it the part most worth checking.
 *
 * What this covers is contrast, the document language and heading order inside
 * the real message. It does *not* cover `role="presentation"` on the layout
 * tables: removing it was tried, and this audit still passed, because axe does
 * not raise a layout table under the wcag2a/aa tags. That guarantee is held by
 * the unit test in email-html.spec.ts and by the frame check in
 * tools-text.spec.ts, both of which do fail without it.
 */
test('the generated email has no AXE violations as a document in its own right', async ({
  page,
}) => {
  await gotoTool(page, 'email-template');
  await page.getByRole('button', { name: 'Newsletter', exact: true }).click();

  const html = await page
    .locator('iframe[title="Email preview"]')
    .evaluate((frame) => (frame as HTMLIFrameElement).srcdoc);
  expect(html).toContain('<table role="presentation"');

  await page.setContent(html);
  const results = await audit(page).analyze();
  expect(
    results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.nodes
          .map((node) => node.target.join(' '))
          .slice(0, 6)
          .join(' | ')}`,
    ),
    'AXE violations in the generated email',
  ).toEqual([]);
});

/**
 * The Image Viewer's view chips are toggles, and this repo has shipped a
 * `.chip--on` at 1.04:1 once — so each state is audited, not just the resting
 * one. Zoomed in, the stage scrolls both ways, which is when it has to be a
 * focus stop (scrollable-region-focusable); `expectScrolls` proves it does.
 */
for (const theme of ['dark', 'light'] as const) {
  test(`image-viewer has no AXE violations in the ${theme} theme, chips on and off`, async ({
    page,
  }) => {
    await gotoTool(page, 'image-viewer', 'Image Viewer');
    await setTheme(page, theme);
    await expectSplashGone(page);

    await uploadFiles(page, ['sample-photo.jpg']);
    await expect(page.getByTestId('image-view')).toBeVisible();

    const report = async (state: string) => {
      const results = await audit(page).analyze();
      expect(
        results.violations.map(
          (violation) =>
            `${violation.id}: ${violation.nodes
              .map((node) => node.target.join(' '))
              .slice(0, 6)
              .join(' | ')}`,
        ),
        `AXE violations on the image viewer, ${state} [${theme}]`,
      ).toEqual([]);
    };

    // Fit on, Transparency off.
    await report('fitted');

    // Fit off, Transparency on, zoomed well past the pane.
    await page.getByRole('button', { name: 'Transparency' }).click();
    await page.getByRole('button', { name: '100%' }).click();
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: 'Zoom in' }).click();
    }
    await expectScrolls(page.getByTestId('image-stage'));
    await report('zoomed with the checkerboard');
  });
}
