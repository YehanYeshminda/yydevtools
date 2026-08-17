import { describe, expect, it } from 'vitest';

import { injectConsoleBridge, isLogLevel } from './console-bridge';

const SCRIPT = /<script>\(function\(\)\{/;

describe('injectConsoleBridge', () => {
  it('inserts the bridge just inside <head>, ahead of the page code', () => {
    const out = injectConsoleBridge(
      '<!doctype html><html><head><title>x</title></head><body>hi</body></html>',
    );
    expect(out).toMatch(SCRIPT);
    // The doctype is preserved at the very front, so the page stays standards mode.
    expect(out.startsWith('<!doctype html>')).toBe(true);
    // The script lands before the <title>, i.e. first thing in the head.
    expect(out.indexOf('<script>')).toBeLessThan(out.indexOf('<title>'));
  });

  it('respects head attributes when matching the opening tag', () => {
    const out = injectConsoleBridge('<head data-x="1">\n<meta></head>');
    expect(out.indexOf('<script>')).toBeGreaterThan(out.indexOf('<head data-x="1">'));
    expect(out.indexOf('<script>')).toBeLessThan(out.indexOf('<meta>'));
  });

  it('falls back to before <body> when there is no head', () => {
    const out = injectConsoleBridge('<html><body><p>hi</p></body></html>');
    expect(out.indexOf('<script>')).toBeLessThan(out.indexOf('<body>'));
  });

  it('falls back to just inside <html> when there is no head or body', () => {
    const out = injectConsoleBridge('<html><p>hi</p></html>');
    expect(out.indexOf('<script>')).toBeGreaterThan(out.indexOf('<html>'));
    expect(out.indexOf('<script>')).toBeLessThan(out.indexOf('<p>'));
  });

  it('prepends for a bare fragment', () => {
    const out = injectConsoleBridge('<div>just a fragment</div>');
    expect(out.startsWith('<script>')).toBe(true);
    expect(out.endsWith('<div>just a fragment</div>')).toBe(true);
  });

  it('injects exactly once', () => {
    const out = injectConsoleBridge('<head></head><body></body>');
    expect(out.match(/<script>\(function/g)).toHaveLength(1);
  });
});

describe('isLogLevel', () => {
  it('accepts the known console levels', () => {
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
      expect(isLogLevel(level)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isLogLevel('trace')).toBe(false);
    expect(isLogLevel('')).toBe(false);
    expect(isLogLevel(undefined)).toBe(false);
    expect(isLogLevel(42)).toBe(false);
  });
});
