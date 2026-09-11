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

  await expect(cm.or(fallback).first()).toBeVisible();

  if (await cm.isVisible().catch(() => false)) {
    await cm.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    // `insertText`, not `pressSequentially`. Per-key typing runs CodeMirror's
    // closeBrackets extension, which auto-inserts a matching `>` or quote and
    // silently corrupts XML and JSON fixtures. insertText delivers one input
    // event, which is also what a paste does.
    await page.keyboard.insertText(text);
    return;
  }
  await fallback.fill(text);
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

/** Uploads one or more fixtures into the first file input on the page. */
export async function uploadFiles(page: Page, names: string[]): Promise<void> {
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
