import { describe, expect, it } from 'vitest';

import { verifyJwt } from './jwt-verify';

/**
 * Signs a token with HMAC-SHA256 so the verifier has a real signature to check.
 * Uses the same WebCrypto the tool uses, keyed by the given secret.
 */
async function signHs256(headerPayload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(headerPayload));
  return base64Url(new Uint8Array(mac));
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const HEADER = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
const PAYLOAD = 'eyJzdWIiOiIxMjM0NTY3ODkwIn0';
const SECRET = 'a-shared-secret';

describe('verifyJwt (HS256)', () => {
  it('returns valid for a correctly signed token', async () => {
    const signature = await signHs256(`${HEADER}.${PAYLOAD}`, SECRET);
    const token = `${HEADER}.${PAYLOAD}.${signature}`;
    expect(await verifyJwt(token, 'HS256', SECRET)).toEqual({ kind: 'valid' });
  });

  it('returns invalid for the wrong secret', async () => {
    const signature = await signHs256(`${HEADER}.${PAYLOAD}`, SECRET);
    const token = `${HEADER}.${PAYLOAD}.${signature}`;
    expect(await verifyJwt(token, 'HS256', 'wrong-secret')).toEqual({ kind: 'invalid' });
  });

  it('returns invalid when the signature is tampered with', async () => {
    const token = `${HEADER}.${PAYLOAD}.not-the-real-signature`;
    expect(await verifyJwt(token, 'HS256', SECRET)).toEqual({ kind: 'invalid' });
  });
});

describe('verifyJwt (edge cases)', () => {
  it('reports unsupported algorithms', async () => {
    const token = `${HEADER}.${PAYLOAD}.sig`;
    expect(await verifyJwt(token, 'none', SECRET)).toEqual({ kind: 'unsupported', alg: 'none' });
  });

  it('errors when a PEM key is malformed', async () => {
    const token = `${HEADER}.${PAYLOAD}.sig`;
    const result = await verifyJwt(token, 'RS256', 'not a pem');
    expect(result.kind).toBe('error');
  });
});
