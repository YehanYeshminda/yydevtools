import { defineConfig, devices } from '@playwright/test';

/**
 * E2E configuration.
 *
 * The dev server is reused when one is already listening on 4200 — the suite is
 * run repeatedly while iterating, and a cold `ng serve` costs ~20s each time.
 * CI starts its own.
 *
 * Only Chromium is installed. The app is a prerendered static site with no
 * browser-specific code paths beyond feature detection, so a second engine
 * would triple the runtime to re-prove the same assertions.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  // Tool pages pull multi-MB lazy chunks (Syncfusion, Tesseract, HEIC); the
  // default 30s is not enough for the heaviest on a cold dev-server compile.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list'], ['json', { outputFile: 'e2e/.results/results.json' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
      // responsive.spec asserts the collapsed layout; it is meaningless here.
      testIgnore: /responsive\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      // Only the layout suite. shell.spec drives the inline nav, which is
      // CSS-hidden at this width by design — the mobile equivalent of those
      // journeys lives in responsive.spec.
      testMatch: /responsive\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
