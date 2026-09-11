import { defineConfig } from 'vitest/config';

/**
 * Keeps a bare `npx vitest` off the Playwright suite.
 *
 * `npm test` goes through `@angular/build:unit-test`, which scopes itself with
 * tsconfig.spec.json and was never affected. But running vitest directly picks
 * up its own default glob, finds `e2e/*.spec.ts`, and reports eight failures
 * that say "Playwright Test did not expect test() to be called here" — noise
 * that looks exactly like a broken test suite.
 *
 * E2E lives behind `npm run e2e`.
 *
 * This does not make a bare `npx vitest` a supported entry point — the specs
 * that use `TestBed` still need the builder's init-testbed setup and fail
 * without it, as they did before this file existed. `npm test` remains the way
 * to run the unit suite.
 */
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
