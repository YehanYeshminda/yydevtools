import { describe, expect, it } from 'vitest';

import { SECURITY_HEADERS, withSecurityHeaders } from './security-headers';

describe('withSecurityHeaders', () => {
  it('sets every header on an ordinary response', async () => {
    const result = withSecurityHeaders(new Response('hello'));

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(result.headers.get(name), name).toBe(value);
    }
    expect(await result.text()).toBe('hello');
  });

  it('keeps the status and the headers the response already had', () => {
    const result = withSecurityHeaders(
      new Response('{}', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
      }),
    );

    expect(result.status).toBe(429);
    expect(result.statusText).toBe('Too Many Requests');
    expect(result.headers.get('Content-Type')).toBe('application/json');
    expect(result.headers.get('Retry-After')).toBe('60');
    expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('survives a bodyless response', () => {
    // 304 and the www redirect both take this path, and constructing a Response
    // with a body for either of them throws.
    const notModified = withSecurityHeaders(new Response(null, { status: 304 }));
    expect(notModified.status).toBe(304);
    expect(notModified.headers.get('Strict-Transport-Security')).toBe(
      SECURITY_HEADERS['Strict-Transport-Security'],
    );

    const redirect = withSecurityHeaders(
      new Response(null, { status: 301, headers: { Location: 'https://yydevtools.com/' } }),
    );
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get('Location')).toBe('https://yydevtools.com/');
    expect(redirect.headers.get('Strict-Transport-Security')).toBe(
      SECURITY_HEADERS['Strict-Transport-Security'],
    );
  });

  it('does not carry a script-src, which a srcdoc iframe would inherit', () => {
    // HTML Preview runs pasted HTML inside a srcdoc frame, and a srcdoc frame
    // inherits the parent's CSP — so a script-src here would silently break
    // that tool. Locking this down is a deliberate, separate decision.
    const policy = SECURITY_HEADERS['Content-Security-Policy'];
    expect(policy).toBe("frame-ancestors 'self'");
    expect(policy).not.toContain('script-src');
    expect(policy).not.toContain('default-src');
  });

  it('lets this origin use the camera, and nothing else it has no use for', () => {
    // The QR Code Reader scans through the camera. `camera=()` here turned it
    // off on every page: getUserMedia failed with NotAllowedError on
    // production and the browser never asked. The reader's e2e stubs
    // getUserMedia and runs without this Worker, so only this test pins it.
    const policy = SECURITY_HEADERS['Permissions-Policy'];
    expect(policy).toBe('camera=(self), microphone=(), geolocation=(), payment=(), usb=()');
    expect(policy).not.toContain('camera=()');
    expect(policy).not.toContain('camera=*');
  });

  it('does not preload HSTS', () => {
    // Preloading is effectively irreversible and is the domain owner's call.
    expect(SECURITY_HEADERS['Strict-Transport-Security']).not.toContain('preload');
  });
});
