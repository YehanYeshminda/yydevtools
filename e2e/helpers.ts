import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { join } from 'node:path';

export const fixture = (name: string) => join(__dirname, 'fixtures', name);

/**
 * Console noise that is not the app's fault, and would otherwise fail every
 * test on the page that produces it.
 *
 * AdSense is blocked in the test environment (no network to googlesyndication),
 * and Angular's hydration notice is informational. Everything else is a real
 * error and should fail the test that caused it.
 */
const IGNORED_CONSOLE = [
  /googlesyndication|adsbygoogle|doubleclick/i,
  /ERR_BLOCKED_BY_CLIENT|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/i,
  /Failed to load resource/i,
  /NG0505|NG0506|NG05000/, // hydration informational notices
  /\[Intervention\]/i,
  /Tracking Prevention/i,
  // AdSense renders its creatives into sandboxed `about:srcdoc` frames and logs
  // this when one of them is denied scripts. The app's own HTML-preview frame
  // is asserted directly in tools-text.spec.ts, so ignoring the message here
  // does not hide a regression in it.
  /Blocked script execution in 'about:srcdoc'/i,
  // Cloudflare injects its Web Analytics beacon into HTML responses at the
  // edge, including the pdf.js viewer frame, whose own strict CSP then blocks
  // it. That is the CSP doing its job on a third-party script, not an app
  // error — and it only ever appears against the deployment, never locally.
  /static\.cloudflareinsights\.com/i,
  // AdSense creatives occasionally frame google.com, which trips the site's
  // *report-only* frame-ancestors policy. Report-only violations are logged,
  // never enforced, and this one is the ad network's doing, not the app's.
  /report-only Content Security Policy/i,
];

export interface ConsoleWatch {
  /** Errors seen so far, minus the ignorable ones. */
  errors: string[];
}

/** Starts collecting page errors. Call `expectClean` at the end of the test. */
export function watchConsole(page: Page): ConsoleWatch {
  const watch: ConsoleWatch = { errors: [] };
  const keep = (text: string) => !IGNORED_CONSOLE.some((re) => re.test(text));

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (keep(text)) watch.errors.push(text);
  });
  page.on('pageerror', (err) => {
    const text = `${err.name}: ${err.message}`;
    if (keep(text)) watch.errors.push(text);
  });
  return watch;
}

export function expectClean(watch: ConsoleWatch): void {
  expect(watch.errors, `console errors:\n${watch.errors.join('\n')}`).toEqual([]);
}

/** Navigates to a tool and waits for its masthead to be painted. */
export async function gotoTool(page: Page, slug: string, name?: string): Promise<void> {
  await page.goto(`/tools/${slug}`);
  const heading = page.locator('.head__title');
  await expect(heading).toBeVisible();
  if (name) await expect(heading).toHaveText(name);
}

/**
 * Types into a CodeMirror editor, or into the textarea it falls back to.
 *
 * The tools prerender a plain textarea and swap CodeMirror in once its chunk
 * lands, so which one is on screen depends on timing. Both are handled here so
 * a test never races the upgrade.
 */
export async function setEditorText(root: Locator, text: string): Promise<void> {
  const page = root.page();
  const cm = root.locator('.cm-content').first();
  const fallback = root.locator('textarea.editor__fallback').first();

  // Which editor is on screen is re-decided on every attempt, not once up
  // front. Deciding once races the upgrade: the fill starts against the
  // textarea, CodeMirror mounts and detaches it mid-action, and Playwright then
  // waits out the whole test timeout for an element that is never coming back.
  // Both branches are idempotent, so a retry simply overwrites its own work.
  await expect(async () => {
    await expect(cm.or(fallback).first()).toBeVisible({ timeout: 2_000 });

    if (await cm.isVisible().catch(() => false)) {
      await cm.click({ timeout: 2_000 });
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.press('Delete');
      // `insertText`, not `pressSequentially`. Per-key typing runs CodeMirror's
      // closeBrackets extension, which auto-inserts a matching `>` or quote and
      // silently corrupts XML and JSON fixtures. insertText delivers one input
      // event, which is also what a paste does.
      await page.keyboard.insertText(text);
      return;
    }
    await fallback.fill(text, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/**
 * Reads a CodeMirror editor's text, or its fallback textarea's value.
 *
 * Returns '' rather than throwing when the editor is not on the page yet.
 * Several tools only render their output editor once there is output, and
 * `expect.poll` treats a thrown error as a failed assertion rather than a
 * reason to poll again — so a throw here would turn "not ready yet" into a
 * hard failure on a tool that was about to work.
 */
export async function getEditorText(root: Locator): Promise<string> {
  const cm = root.locator('.cm-content').first();
  // Ride out the swap. For the instant CodeMirror replaces the textarea neither
  // is visible, and a read landing there used to come back '' — which a caller
  // that has already polled its way to a result reads as "the tool produced
  // nothing" rather than "ask again". Short, because an output editor that
  // genuinely has not been rendered yet is the other reason to see neither, and
  // that case is meant to return '' quickly so the caller's poll can continue.
  await expect(cm.or(root.locator('textarea').first()).first())
    .toBeVisible({ timeout: 1_500 })
    .catch(() => undefined);

  if (await cm.isVisible().catch(() => false)) {
    return (await cm.innerText().catch(() => '')).trim();
  }
  const textarea = root.locator('textarea').first();
  if (await textarea.isVisible().catch(() => false)) {
    return (await textarea.inputValue().catch(() => '')).trim();
  }
  return '';
}

/**
 * Finds a shared code editor by the `label` its tool gave it — which becomes
 * the aria-label on both CodeMirror's content and the fallback textarea.
 *
 * Far steadier than indexing `app-code-editor`, because several tools only
 * render their output editor once there is output, so the index of a given
 * editor changes as the test progresses.
 */
export function editorByLabel(page: Page, label: string): Locator {
  return page.locator('app-code-editor').filter({
    has: page.locator(`[aria-label="${label}"]`),
  });
}

/**
 * Uploads one or more fixtures into the first file input on the page.
 *
 * Waits for hydration first. The tool pages are prerendered, so the dropzone's
 * input exists — and accepts files — a long time before the component that
 * listens to it does, and a `change` fired into that gap is simply lost:
 * `withEventReplay()` does not rescue it, because the tool hydrates from a
 * lazy route chunk that lands after the replay. Measured directly: with the
 * scripts held back, setting a file left the page exactly as the suite found
 * it on a bad day — dropzone still up, no spinner, no error, the upload gone.
 *
 * `[ngh]` is Angular's own marker: the server stamps it on every hydratable
 * component and the client removes each one as it hydrates, so none left means
 * the page is live. Cheaper and truer than waiting on anything tool-specific.
 */
export async function uploadFiles(page: Page, names: string[]): Promise<void> {
  await expect(page.locator('[ngh]')).toHaveCount(0);
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(names.map(fixture));
}

/** Fails if the document scrolls sideways — the usual mobile-layout break. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scroll: doc.scrollWidth, client: doc.clientWidth };
  });
  expect(
    overflow.scroll,
    `page scrolls horizontally: ${overflow.scroll} > ${overflow.client}`,
  ).toBeLessThanOrEqual(overflow.client + 1);
}

/**
 * Fails if any element on the page has content wider than its own box while
 * that box is not meant to scroll — the long-token-bursts-out-of-a-card bug.
 *
 * Elements that scroll (`overflow-x: auto | scroll`) are the legitimate homes
 * of wide content and are skipped, as is anything hidden or zero-sized.
 */
export async function expectNoClippedContent(page: Page): Promise<void> {
  const offenders = await page.evaluate(() => {
    const bad: string[] = [];
    // Material's icon buttons and checkboxes carry a 44px touch target inside
    // a 40px box on purpose; text that has burst out of a card is wider by far.
    const SLACK = 8;
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      if (el.clientWidth === 0 || el.scrollWidth <= el.clientWidth + SLACK) {
        continue;
      }
      const style = getComputedStyle(el);
      if (style.overflowX !== 'visible' || style.display === 'inline') {
        continue;
      }
      const name =
        el.tagName.toLowerCase() + (el.className ? `.${String(el.className).split(' ')[0]}` : '');
      bad.push(`${name}: content ${el.scrollWidth}px in a ${el.clientWidth}px box`);
    }
    return bad;
  });
  expect(offenders, ['content overflows its box:', ...offenders].join(' | ')).toEqual([]);
}

/** Switches the colour theme the way the header's menu does. */
export async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((value) => {
    localStorage.setItem('theme', value);
    document.documentElement.setAttribute('data-theme', value);
  }, theme);
}

/** Seeds favourites before load, so the rail renders them on first paint. */
export async function seedFavorites(page: Page, slugs: string[]): Promise<void> {
  await page.addInitScript((value) => {
    localStorage.setItem('favorites', JSON.stringify(value));
  }, slugs);
}

/** Attaches a screenshot to the report — used by the visual sweeps. */
export async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await info.attach(name, {
    body: await page.screenshot({ fullPage: false }),
    contentType: 'image/png',
  });
}
