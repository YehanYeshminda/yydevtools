import { expect, test } from '@playwright/test';

/**
 * Smooth scrolling.
 *
 * The site uses native `scroll-behavior: smooth` (gated on no reduced-motion)
 * rather than a scroll-hijacking library, so wheel/trackpad scrolling stays the
 * OS's job and only programmatic / anchor scrolls are eased.
 *
 * The guide "on this page" links are the visible beneficiary. They also used to
 * be broken — a bare `#id` under `<base href="/">` resolved to the homepage —
 * so these tests double as the regression guard for that fix.
 */

const GUIDE = '/guides/jwt-explained';
const SECTION = 'the-classic-jwt-attacks';

test.describe('smooth scrolling (motion allowed)', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('the document scroller is set to smooth, clear of the app bar', async ({ page }) => {
    await page.goto('/');
    const { behavior, padding } = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return { behavior: s.scrollBehavior, padding: s.scrollPaddingTop };
    });
    expect(behavior).toBe('smooth');
    expect(padding).toBe('88px');
  });

  test('a TOC link scrolls to its section and stays on the article', async ({ page }) => {
    await page.goto(GUIDE);
    await expect(page.locator('.toc__link').first()).toBeVisible();

    await page.locator(`.toc__link[href$="#${SECTION}"]`).click();

    // Regression: the click must NOT bounce to the homepage.
    await expect(page).toHaveURL(new RegExp(`/guides/jwt-explained#${SECTION}$`));

    // The heading comes to rest just below the sticky app bar, not under it and
    // not flung back to the top by the router's scroll restoration.
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const el = document.getElementById(id)!;
            const header = document.querySelector('.appbar')!;
            return Math.round(el.getBoundingClientRect().top - header.getBoundingClientRect().bottom);
          }, SECTION),
        { timeout: 4000 },
      )
      .toBeLessThan(60);

    expect(await page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(300);
  });

  test('the scroll is animated, not an instant jump', async ({ page }) => {
    await page.goto(GUIDE);
    await expect(page.locator('.toc__link').first()).toBeVisible();

    // Capture the scroll position each frame for a short window after the click.
    const trajectory = await page.evaluate(async (section) => {
      window.scrollTo(0, 0);
      const samples: number[] = [];
      let raf = 0;
      const tick = () => {
        samples.push(Math.round(window.scrollY));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      document.querySelector<HTMLElement>(`.toc__link[href$="#${section}"]`)!.click();
      await new Promise((r) => setTimeout(r, 700));
      cancelAnimationFrame(raf);
      return samples;
    }, SECTION);

    const distinct = [...new Set(trajectory)];
    // A smooth scroll passes through many intermediate offsets; an instant jump
    // would show at most two (start, end).
    expect(distinct.length, `trajectory was ${JSON.stringify(distinct)}`).toBeGreaterThan(5);
    // And it is monotonic-ish downward: the last sample is well past the first.
    expect(trajectory[trajectory.length - 1]).toBeGreaterThan(trajectory[0] + 300);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('smooth is disabled and the jump is instant', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe(
      'auto',
    );

    await page.goto(GUIDE);
    await expect(page.locator('.toc__link').first()).toBeVisible();

    const trajectory = await page.evaluate(async (section) => {
      window.scrollTo(0, 0);
      const samples: number[] = [];
      let raf = 0;
      const tick = () => {
        samples.push(Math.round(window.scrollY));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      document.querySelector<HTMLElement>(`.toc__link[href$="#${section}"]`)!.click();
      await new Promise((r) => setTimeout(r, 400));
      cancelAnimationFrame(raf);
      return samples;
    }, SECTION);

    // No animation: it is already at the destination on the first frame.
    const distinct = [...new Set(trajectory)];
    expect(distinct.length, `trajectory was ${JSON.stringify(distinct)}`).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(300);
  });
});
