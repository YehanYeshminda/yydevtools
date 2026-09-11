import { describe, expect, it } from 'vitest';

import { generateKeyPair, toPem } from './key-pair';

describe('toPem', () => {
  it('wraps the body at 64 characters and labels both ends', () => {
    const pem = toPem(new Uint8Array(100).fill(0), 'PUBLIC KEY');
    const lines = pem.split('\n');
    expect(lines[0]).toBe('-----BEGIN PUBLIC KEY-----');
    expect(lines.at(-1)).toBe('-----END PUBLIC KEY-----');
    for (const line of lines.slice(1, -1)) {
      expect(line.length).toBeLessThanOrEqual(64);
    }
  });

  it('round-trips through the base64 body', () => {
    const der = new Uint8Array([1, 2, 3, 250, 251, 252]);
    const body = toPem(der, 'PRIVATE KEY').split('\n').slice(1, -1).join('');
    expect(Uint8Array.from(atob(body), (c) => c.charCodeAt(0))).toEqual(der);
  });
});

describe('generateKeyPair', () => {
  // The point of the tool is that the key is real and usable elsewhere, so the
  // check is that Web Crypto will import what we exported and verify a
  // signature made with it — not merely that the text looks like a PEM.
  it('produces an EC pair that actually signs and verifies', async () => {
    const { privatePem, publicPem } = await generateKeyPair('ec-p256');
    expect(privatePem).toContain('-----BEGIN PRIVATE KEY-----');
    expect(publicPem).toContain('-----BEGIN PUBLIC KEY-----');

    const der = (pem: string) =>
      Uint8Array.from(atob(pem.split('\n').slice(1, -1).join('')), (c) => c.charCodeAt(0));
    const params = { name: 'ECDSA', namedCurve: 'P-256' } as const;
    const priv = await crypto.subtle.importKey('pkcs8', der(privatePem), params, false, ['sign']);
    const pub = await crypto.subtle.importKey('spki', der(publicPem), params, false, ['verify']);

    const message = new TextEncoder().encode('yydevtools');
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, message);
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, message)).toBe(
      true,
    );
  });
});
