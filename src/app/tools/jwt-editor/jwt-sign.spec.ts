import { describe, expect, it } from 'vitest';

import { signJwt } from './jwt-sign';
import { verifyJwt } from '../jwt-decoder/jwt-verify';

/**
 * The contract that matters: a token this module signs must verify against the
 * matching key. Each test signs an edited payload and then checks it with the
 * decoder's independent verifier — proving the edit did not invalidate it.
 */

const HS_SECRET = 'a-shared-secret';

/** DER ArrayBuffer → PEM, so an asymmetric test can feed signJwt a real key. */
function toPem(der: ArrayBuffer, label: string): string {
  let binary = '';
  for (const byte of new Uint8Array(der)) binary += String.fromCharCode(byte);
  const body = (btoa(binary).match(/.{1,64}/g) ?? []).join('\n');
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

async function exportKeys(pair: CryptoKeyPair): Promise<{ privatePem: string; publicPem: string }> {
  const priv = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const pub = await crypto.subtle.exportKey('spki', pair.publicKey);
  return { privatePem: toPem(priv, 'PRIVATE KEY'), publicPem: toPem(pub, 'PUBLIC KEY') };
}

describe('signJwt — round-trips through verifyJwt', () => {
  it('signs HS256 and the result verifies with the same secret', async () => {
    const result = await signJwt(
      '{"alg":"HS256","typ":"JWT"}',
      '{"sub":"1234567890","name":"edited"}',
      HS_SECRET,
    );
    expect(result.kind).toBe('ok');
    const token = (result as { kind: 'ok'; token: string }).token;
    expect(await verifyJwt(token, 'HS256', HS_SECRET)).toEqual({ kind: 'valid' });
    // And the wrong secret must reject it.
    expect(await verifyJwt(token, 'HS256', 'other')).toEqual({ kind: 'invalid' });
  });

  it('embeds the edited claim in the signed token', async () => {
    const result = await signJwt('{"alg":"HS256"}', '{"role":"admin"}', HS_SECRET);
    const token = (result as { kind: 'ok'; token: string }).token;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(token.split('.')[1])));
    expect(payload).toEqual({ role: 'admin' });
  });

  it('signs RS256 and the result verifies with the public key', async () => {
    const pair = (await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const { privatePem, publicPem } = await exportKeys(pair);

    const result = await signJwt('{"alg":"RS256"}', '{"sub":"abc"}', privatePem);
    expect(result.kind).toBe('ok');
    const token = (result as { kind: 'ok'; token: string }).token;
    expect(await verifyJwt(token, 'RS256', publicPem)).toEqual({ kind: 'valid' });
  });

  it('signs ES256 (r‖s signature) and the result verifies with the public key', async () => {
    const pair = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const { privatePem, publicPem } = await exportKeys(pair);

    const result = await signJwt('{"alg":"ES256"}', '{"sub":"abc"}', privatePem);
    expect(result.kind).toBe('ok');
    const token = (result as { kind: 'ok'; token: string }).token;
    expect(await verifyJwt(token, 'ES256', publicPem)).toEqual({ kind: 'valid' });
  });
});

describe('signJwt — alg:none (unsigned)', () => {
  it('produces an unsigned token: empty signature, no key required', async () => {
    const result = await signJwt('{"alg":"none","typ":"JWT"}', '{"role":"admin"}', '');
    expect(result.kind).toBe('unsigned');
    const token = (result as { kind: 'unsigned'; token: string }).token;
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    expect(parts[2]).toBe('');
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
    expect(payload).toEqual({ role: 'admin' });
  });

  it('treats any casing as none but preserves the alg casing that was typed', async () => {
    const result = await signJwt('{"alg":"None"}', '{}', '');
    expect(result.kind).toBe('unsigned');
    const header = JSON.parse(
      new TextDecoder().decode(
        base64UrlToBytes((result as { token: string }).token.split('.')[0]),
      ),
    );
    expect(header.alg).toBe('None');
  });

  it('still validates the JSON before producing an unsigned token', async () => {
    expect((await signJwt('{bad', '{}', '')).kind).toBe('invalid-json');
  });
});

describe('signJwt — failure paths', () => {
  it('reports invalid header JSON', async () => {
    const result = await signJwt('{not json', '{}', HS_SECRET);
    expect(result.kind).toBe('invalid-json');
    expect((result as { where: string }).where).toBe('header');
  });

  it('rejects a payload that is not an object', async () => {
    const result = await signJwt('{"alg":"HS256"}', '[1,2,3]', HS_SECRET);
    expect(result).toMatchObject({ kind: 'invalid-json', where: 'payload' });
  });

  it('reports a missing alg', async () => {
    expect(await signJwt('{"typ":"JWT"}', '{}', HS_SECRET)).toEqual({ kind: 'missing-alg' });
  });

  it('reports an unsupported alg', async () => {
    expect(await signJwt('{"alg":"HS999"}', '{}', HS_SECRET)).toEqual({
      kind: 'unsupported',
      alg: 'HS999',
    });
  });

  it('explains a legacy (non-PKCS#8) private key', async () => {
    const result = await signJwt(
      '{"alg":"RS256"}',
      '{}',
      '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----',
    );
    expect(result.kind).toBe('error');
    expect((result as { message: string }).message).toContain('PKCS#8');
  });
});

/** Local base64url → bytes, so the spec doesn't depend on the module's internals. */
function base64UrlToBytes(segment: string): Uint8Array {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
