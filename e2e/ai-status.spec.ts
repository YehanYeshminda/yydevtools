import { expect, test, type Page } from '@playwright/test';

import { expectClean, gotoTool, waitForHydration, watchConsole } from './helpers';

/** What the Worker's /api/ai-status returns: Prismix's statuses, normalised. */
const PAYLOAD = {
  updated: new Date().toISOString(),
  services: [
    {
      id: 'openai',
      name: 'OpenAI',
      state: 'degraded',
      description: 'Partially Degraded Service',
      activeIncidents: 1,
      uptime30dPct: 99.41,
      latencyMs: 340,
      updated: null,
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      state: 'operational',
      description: 'All Systems Operational',
      activeIncidents: 0,
      uptime30dPct: 99.87,
      latencyMs: 212,
      updated: null,
    },
    {
      id: 'mistral',
      name: 'Mistral',
      state: 'operational',
      description: 'All Systems Operational',
      activeIncidents: 0,
      uptime30dPct: null,
      latencyMs: null,
      updated: null,
    },
  ],
};

const BADGE = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20"/>';

/** Serves the board from a fixture, and the badge image locally, so no test touches the network. */
async function stubFeed(page: Page, body: unknown = PAYLOAD, status = 200): Promise<void> {
  await page.route('**/api/ai-status', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
  await page.route('https://prismix.dev/api/badge/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: BADGE }),
  );
}

const names = (page: Page) => page.locator('.svc__name').allTextContents();

test('ai-status lists every service, filters them, and keeps starred ones on top', async ({
  page,
}) => {
  const watch = watchConsole(page);
  await stubFeed(page);
  await gotoTool(page, 'ai-status', 'AI API Status');
  await waitForHydration(page);

  await expect(page.locator('.svc')).toHaveCount(3);
  expect(await names(page)).toEqual(['Anthropic', 'Mistral', 'OpenAI']);
  await expect(page.getByText('1 of 3 services have issues right now.')).toBeVisible();
  await expect(page.locator('.svc--degraded')).toContainText('1 active incident');
  await expect(page.locator('.svc--degraded')).toContainText('99.41% uptime (30 d)');

  await page.getByLabel('Find a service').fill('mis');
  expect(await names(page)).toEqual(['Mistral']);
  await page.getByLabel('Find a service').fill('');

  await page.getByRole('button', { name: /^Issues/ }).click();
  expect(await names(page)).toEqual(['OpenAI']);
  await page.getByRole('button', { name: /^All/ }).click();

  // A star moves the service to the top, and survives a reload.
  await page.getByRole('button', { name: 'Star OpenAI' }).click();
  expect(await names(page)).toEqual(['OpenAI', 'Anthropic', 'Mistral']);
  await page.reload();
  await waitForHydration(page);
  await expect(page.getByRole('button', { name: 'Unstar OpenAI' })).toBeVisible();
  expect(await names(page)).toEqual(['OpenAI', 'Anthropic', 'Mistral']);

  expectClean(watch);
});

test('ai-status writes the badge code for a chosen service', async ({ page }) => {
  const watch = watchConsole(page);
  await stubFeed(page);
  await gotoTool(page, 'ai-status', 'AI API Status');
  await waitForHydration(page);
  await expect(page.locator('.svc')).toHaveCount(3);

  // No service chosen, no image from prismix.dev.
  await expect(page.locator('.badge__preview img')).toHaveCount(0);

  await page.getByLabel('Badge service').selectOption('anthropic');
  await expect(page.locator('.badge__preview img')).toHaveAttribute(
    'src',
    'https://prismix.dev/api/badge/anthropic.svg',
  );
  await expect(page.locator('.badge__code')).toHaveText(
    '[![Anthropic status](https://prismix.dev/api/badge/anthropic.svg)](https://prismix.dev/status)',
  );

  await page.getByRole('button', { name: 'HTML' }).click();
  await expect(page.locator('.badge__code')).toHaveText(
    '<a href="https://prismix.dev/status"><img src="https://prismix.dev/api/badge/anthropic.svg" alt="Anthropic status"></a>',
  );

  expectClean(watch);
});

test('ai-status says so plainly when the feed is down', async ({ page }) => {
  const watch = watchConsole(page);
  await stubFeed(page, { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'down' } }, 502);
  await gotoTool(page, 'ai-status', 'AI API Status');
  await waitForHydration(page);

  await expect(page.getByRole('alert')).toContainText('Live status could not be loaded');
  await expect(page.locator('.svc')).toHaveCount(0);
  await expect(page.getByLabel('Badge service')).toBeDisabled();

  // A 502 from our own API is the expected answer here, not a page error.
  watch.errors = watch.errors.filter((error) => !/502/.test(error));
  expectClean(watch);
});
