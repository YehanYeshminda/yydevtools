import { describe, expect, it } from 'vitest';

import {
  createSecret,
  DEFAULT_TTL,
  isBase64,
  isId,
  MAX_CIPHERTEXT,
  newId,
  parseTtl,
  takeSecret,
  TTLS,
  validateCreate,
  type SecretStore,
} from './secrets';

/** An in-memory stand-in for the KV binding, with the calls it records. */
function fakeStore(): SecretStore & { entries: Map<string, string>; ttls: Map<string, number> } {
  const entries = new Map<string, string>();
  const ttls = new Map<string, number>();
  return {
    entries,
    ttls,
    async get(key) {
      return entries.get(key) ?? null;
    },
    async put(key, value, options) {
      entries.set(key, value);
      if (options?.expirationTtl) {
        ttls.set(key, options.expirationTtl);
      }
    },
    async delete(key) {
      entries.delete(key);
    },
  };
}

describe('isBase64', () => {
  it('accepts base64 within the limit', () => {
    expect(isBase64('YWJj', 10)).toBe(true);
    expect(isBase64('YQ==', 10)).toBe(true);
  });

  it('rejects empty, oversized and non-base64 values', () => {
    expect(isBase64('', 10)).toBe(false);
    expect(isBase64('YWJjZGVmZw', 4)).toBe(false);
    expect(isBase64('not base64!', 100)).toBe(false);
    expect(isBase64(42, 100)).toBe(false);
  });
});

describe('parseTtl', () => {
  it('defaults when nothing was asked for', () => {
    expect(parseTtl(undefined)).toBe(TTLS[DEFAULT_TTL]);
    expect(parseTtl(null)).toBe(TTLS[DEFAULT_TTL]);
  });

  it('maps the offered windows to seconds', () => {
    expect(parseTtl('1h')).toBe(3600);
    expect(parseTtl('7d')).toBe(604800);
  });

  it('rejects anything else rather than falling back', () => {
    expect(parseTtl('99y')).toBeNull();
    expect(parseTtl(3600)).toBeNull();
  });
});

describe('newId and isId', () => {
  it('produces 22 URL-safe characters', () => {
    const id = newId();

    expect(id).toHaveLength(22);
    expect(isId(id)).toBe(true);
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()));

    expect(ids.size).toBe(200);
  });

  it('rejects ids of the wrong shape', () => {
    expect(isId('short')).toBe(false);
    expect(isId(`${newId()}extra`)).toBe(false);
    expect(isId('====================aa')).toBe(false);
  });
});

describe('validateCreate', () => {
  const good = { ciphertext: 'YWJj', iv: 'YWJjZA==' };

  it('accepts a well-formed request and resolves its expiry', () => {
    const result = validateCreate({ ...good, ttl: '1h' });

    expect(result).toEqual({ ok: true, ciphertext: 'YWJj', iv: 'YWJjZA==', ttl: 3600 });
  });

  it('defaults the expiry when none is given', () => {
    const result = validateCreate(good);

    expect(result.ok && result.ttl).toBe(TTLS[DEFAULT_TTL]);
  });

  it('rejects a body that is not an object', () => {
    expect(validateCreate('hello').ok).toBe(false);
    expect(validateCreate(null).ok).toBe(false);
  });

  it('rejects a missing or malformed ciphertext', () => {
    expect(validateCreate({ iv: good.iv }).ok).toBe(false);
    expect(validateCreate({ ciphertext: 'not base64!', iv: good.iv }).ok).toBe(false);
  });

  it('rejects a ciphertext over the size limit', () => {
    const huge = 'A'.repeat(MAX_CIPHERTEXT + 1);

    expect(validateCreate({ ciphertext: huge, iv: good.iv }).ok).toBe(false);
  });

  it('rejects a missing nonce, and one too long to be a GCM nonce', () => {
    expect(validateCreate({ ciphertext: good.ciphertext }).ok).toBe(false);
    expect(validateCreate({ ciphertext: good.ciphertext, iv: 'A'.repeat(64) }).ok).toBe(false);
  });

  it('rejects an expiry that was not offered', () => {
    expect(validateCreate({ ...good, ttl: 'forever' }).ok).toBe(false);
  });
});

describe('createSecret', () => {
  it('stores the blob under a fresh id with the requested expiry', async () => {
    const store = fakeStore();

    const { id, expiresAt } = await createSecret(
      store,
      { ciphertext: 'YWJj', iv: 'YWJjZA==', ttl: 3600 },
      1_000_000,
    );

    expect(isId(id)).toBe(true);
    expect(store.ttls.get(id)).toBe(3600);
    expect(expiresAt).toBe(1_000_000 + 3_600_000);
    expect(JSON.parse(store.entries.get(id) as string)).toEqual({
      ciphertext: 'YWJj',
      iv: 'YWJjZA==',
    });
  });

  it('stores nothing that reveals the secret', async () => {
    const store = fakeStore();

    const { id } = await createSecret(store, { ciphertext: 'YWJj', iv: 'YWJjZA==', ttl: 3600 });

    // Only the two opaque fields; no key, no plaintext, no hint of either.
    expect(Object.keys(JSON.parse(store.entries.get(id) as string)).sort()).toEqual([
      'ciphertext',
      'iv',
    ]);
  });
});

describe('takeSecret', () => {
  it('returns the blob and burns it', async () => {
    const store = fakeStore();
    const { id } = await createSecret(store, { ciphertext: 'YWJj', iv: 'YWJjZA==', ttl: 3600 });

    expect(await takeSecret(store, id)).toEqual({ ciphertext: 'YWJj', iv: 'YWJjZA==' });
    expect(store.entries.has(id)).toBe(false);
  });

  it('gives a second reader nothing', async () => {
    const store = fakeStore();
    const { id } = await createSecret(store, { ciphertext: 'YWJj', iv: 'YWJjZA==', ttl: 3600 });

    await takeSecret(store, id);

    expect(await takeSecret(store, id)).toBeNull();
  });

  it('returns null for an id that was never stored', async () => {
    expect(await takeSecret(fakeStore(), newId())).toBeNull();
  });

  it('deletes a blob it cannot parse, and reports nothing', async () => {
    const store = fakeStore();
    await store.put('x'.repeat(22), 'not json');

    expect(await takeSecret(store, 'x'.repeat(22))).toBeNull();
    expect(store.entries.has('x'.repeat(22))).toBe(false);
  });
});
