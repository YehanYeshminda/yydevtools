import { describe, expect, it } from 'vitest';

import { chooseJwk, verifyJwt, type Jwk } from './jwt-verify';

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

// --- JWK and JWKS ---------------------------------------------------------

/** Base64url of a JSON value, as a JWT segment. */
function segment(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

const RSA_PARAMS: RsaHashedKeyGenParams = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};

/** One RSA pair for the whole file: generating 2048-bit keys is not cheap. */
const rsa = crypto.subtle.generateKey(RSA_PARAMS, true, ['sign', 'verify']);
const ec = crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);

/** A real RS256 token, signed with the pair above. */
async function signRs256(header: object, payload: object = { sub: '1' }): Promise<string> {
  const { privateKey } = await rsa;
  const body = `${segment(header)}.${segment(payload)}`;
  const mac = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(body),
  );
  return `${body}.${base64Url(new Uint8Array(mac))}`;
}

/** The public half as a JWK, optionally under a kid. */
async function publicJwk(kid?: string): Promise<Jwk> {
  const jwk = await crypto.subtle.exportKey('jwk', (await rsa).publicKey);
  return kid ? { ...jwk, kid } : jwk;
}

/** A different RSA public key, to stand in a set without being the right one. */
async function strangerJwk(kid: string): Promise<Jwk> {
  const other = await crypto.subtle.generateKey(RSA_PARAMS, true, ['sign', 'verify']);
  return { ...(await crypto.subtle.exportKey('jwk', other.publicKey)), kid };
}

describe('verifying against a JWKS', () => {
  it('picks the key the token names, out of a set', async () => {
    const token = await signRs256({ alg: 'RS256', kid: '2024-06' });
    const jwks = {
      keys: [
        await strangerJwk('2023-01'),
        await publicJwk('2024-06'),
        await strangerJwk('2025-01'),
      ],
    };
    expect(await verifyJwt(token, 'RS256', JSON.stringify(jwks))).toEqual({
      kind: 'valid',
      via: 'kid “2024-06”, key 2 of 3',
    });
  });

  it('says which kids it does have when none is the one named', async () => {
    const token = await signRs256({ alg: 'RS256', kid: 'rotated-away' });
    const jwks = { keys: [await publicJwk('2023-01'), await publicJwk('2024-06')] };
    expect(await verifyJwt(token, 'RS256', JSON.stringify(jwks))).toEqual({
      kind: 'error',
      message: 'No key in that set has kid “rotated-away”. It holds: 2023-01, 2024-06.',
    });
  });

  it('takes a lone JWK without explaining itself', async () => {
    const token = await signRs256({ alg: 'RS256' });
    expect(await verifyJwt(token, 'RS256', JSON.stringify(await publicJwk()))).toEqual({
      kind: 'valid',
    });
  });

  /** The kid matched but the key is someone else's — a failed check, not a broken input. */
  it('reports a key that simply does not match as invalid, not as an error', async () => {
    const token = await signRs256({ alg: 'RS256', kid: 'a' });
    const jwks = { keys: [await strangerJwk('a')] };
    expect(await verifyJwt(token, 'RS256', JSON.stringify(jwks))).toEqual({
      kind: 'invalid',
      via: 'kid “a”, key 1 of 1',
    });
  });

  it('chooses the only key that could verify, when the token names none', async () => {
    const token = await signRs256({ alg: 'RS256' });
    const ecJwk = await crypto.subtle.exportKey('jwk', (await ec).publicKey);
    const jwks = { keys: [ecJwk, await publicJwk()] };
    expect(await verifyJwt(token, 'RS256', JSON.stringify(jwks))).toEqual({
      kind: 'valid',
      via: 'the only RS256 key of 2',
    });
  });

  it('refuses to guess between two that would both do', async () => {
    const token = await signRs256({ alg: 'RS256' });
    const jwks = { keys: [await publicJwk(), await strangerJwk('')] };
    const result = await verifyJwt(token, 'RS256', JSON.stringify(jwks));
    expect(result.kind).toBe('error');
    expect((result as { message: string }).message).toContain('no kid to choose by');
  });

  it('uses the public half when a private key is pasted by mistake', async () => {
    const token = await signRs256({ alg: 'RS256' });
    // Exported straight from the private key, so it carries d, p, q and
    // key_ops of ["sign"] — all of which would make an import for verifying fail.
    const priv = await crypto.subtle.exportKey('jwk', (await rsa).privateKey);
    expect(priv.d).toBeDefined();
    expect(await verifyJwt(token, 'RS256', JSON.stringify(priv))).toEqual({
      kind: 'valid',
      via: 'used its public half',
    });
  });

  it('verifies an HMAC token from an oct JWK', async () => {
    const signature = await signHs256(`${HEADER}.${PAYLOAD}`, SECRET);
    const token = `${HEADER}.${PAYLOAD}.${signature}`;
    const oct = { kty: 'oct', k: base64Url(new TextEncoder().encode(SECRET)), alg: 'HS256' };
    expect(await verifyJwt(token, 'HS256', JSON.stringify(oct))).toEqual({ kind: 'valid' });
  });

  it('explains the mismatches instead of leaving WebCrypto to be cryptic', async () => {
    const token = await signRs256({ alg: 'RS256' });
    const jwk = await publicJwk();

    expect(await verifyJwt(token, 'RS256', JSON.stringify({ ...jwk, alg: 'PS256' }))).toEqual({
      kind: 'error',
      message: 'That key is for PS256, but the token says RS256.',
    });
    expect(await verifyJwt(token, 'RS256', JSON.stringify({ ...jwk, use: 'enc' }))).toEqual({
      kind: 'error',
      message: 'That key is marked for encryption, not for signatures.',
    });
    expect(await verifyJwt(token, 'HS256', JSON.stringify(jwk))).toEqual({
      kind: 'error',
      message: 'HS256 needs a oct key, and that one is RSA.',
    });
    expect(await verifyJwt(token, 'RS256', '{ not json ')).toEqual({
      kind: 'error',
      message: 'That starts like a JWK or JWKS but is not a JSON object.',
    });
    expect(await verifyJwt(token, 'RS256', JSON.stringify({ keys: [] }))).toEqual({
      kind: 'error',
      message: 'That JWKS has no keys in it.',
    });
  });
});

/** A public key as the PEM block a person would paste. */
async function toPem(key: CryptoKey): Promise<string> {
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', key));
  let binary = '';
  for (const byte of spki) binary += String.fromCharCode(byte);
  const body = btoa(binary).replace(/(.{64})/g, '$1\n');
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

describe('verifying EdDSA', () => {
  const ed = crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);

  /** A real EdDSA token. The algorithm carries no digest suffix, unlike the rest. */
  async function signEdDsa(header: object = { alg: 'EdDSA', typ: 'JWT' }): Promise<string> {
    const { privateKey } = await ed;
    const body = `${segment(header)}.${segment({ sub: 'ada' })}`;
    const mac = await crypto.subtle.sign(
      { name: 'Ed25519' },
      privateKey,
      new TextEncoder().encode(body),
    );
    return `${body}.${base64Url(new Uint8Array(mac))}`;
  }

  it('verifies against a PEM public key', async () => {
    const token = await signEdDsa();
    const pem = await toPem((await ed).publicKey);
    expect(await verifyJwt(token, 'EdDSA', pem)).toEqual({ kind: 'valid' });
  });

  it('verifies against an OKP key in a JWKS, chosen by kid', async () => {
    const token = await signEdDsa({ alg: 'EdDSA', typ: 'JWT', kid: 'ed-1' });
    const jwk = { ...(await crypto.subtle.exportKey('jwk', (await ed).publicKey)), kid: 'ed-1' };
    expect(jwk.kty).toBe('OKP');
    expect(jwk.crv).toBe('Ed25519');
    const rsaJwk = await publicJwk('rsa-1');
    const jwks = JSON.stringify({ keys: [rsaJwk, jwk] });
    expect(await verifyJwt(token, 'EdDSA', jwks)).toEqual({
      kind: 'valid',
      via: 'kid “ed-1”, key 2 of 2',
    });
  });

  it('knows an RSA key cannot stand in for an EdDSA one', async () => {
    const token = await signEdDsa();
    expect(await verifyJwt(token, 'EdDSA', JSON.stringify(await publicJwk()))).toEqual({
      kind: 'error',
      message: 'EdDSA needs a OKP key, and that one is RSA.',
    });
  });

  it('refuses a curve WebCrypto does not implement, before trying to import it', async () => {
    const token = await signEdDsa();
    const jwk = { ...(await crypto.subtle.exportKey('jwk', (await ed).publicKey)), crv: 'Ed448' };
    expect(await verifyJwt(token, 'EdDSA', JSON.stringify(jwk))).toEqual({
      kind: 'error',
      message: 'Only Ed25519 keys can be checked here, and that one is Ed448.',
    });
  });

  it('still reports a genuinely wrong key as invalid', async () => {
    const token = await signEdDsa();
    const other = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    expect(await verifyJwt(token, 'EdDSA', await toPem(other.publicKey))).toEqual({
      kind: 'invalid',
    });
  });
});

describe('chooseJwk', () => {
  it('stands aside for anything that is not JSON', () => {
    expect(chooseJwk('a-shared-secret', 'HS256', '')).toEqual({ kind: 'none' });
    expect(
      chooseJwk('-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----', 'RS256', ''),
    ).toEqual({ kind: 'none' });
    expect(chooseJwk('   ', 'HS256', '')).toEqual({ kind: 'none' });
  });

  it('strips what would stop a key importing for verification', async () => {
    const priv = await crypto.subtle.exportKey('jwk', (await rsa).privateKey);
    const choice = chooseJwk(JSON.stringify(priv), 'RS256', '');
    expect(choice.kind).toBe('ok');
    const { jwk, publicHalf } = choice as { jwk: Jwk; publicHalf: boolean };
    expect(publicHalf).toBe(true);
    expect(jwk.d).toBeUndefined();
    expect(jwk.p).toBeUndefined();
    expect(jwk.key_ops).toBeUndefined();
    // The public half is all still there.
    expect(jwk.n).toBe(priv.n);
    expect(jwk.e).toBe(priv.e);
  });
});
