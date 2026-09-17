import { describe, expect, it } from 'vitest';

import {
  buildFragment,
  fromBase64,
  fromBase64Url,
  open,
  parseFragment,
  seal,
  toBase64,
  toBase64Url,
} from './crypto';

describe('base64 helpers', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 250, 255, 128]);

    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
    expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toEqual(Array.from(bytes));
  });

  it('produces a URL-safe alphabet with no padding', () => {
    // 0xfb 0xff encodes to characters that are + and / in standard base64.
    const url = toBase64Url(new Uint8Array([251, 255, 190, 255]));

    expect(url).not.toContain('+');
    expect(url).not.toContain('/');
    expect(url).not.toContain('=');
  });

  it('restores padding when decoding a URL-safe value', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('seal and open', () => {
  it('round-trips a secret', async () => {
    const sealed = await seal('correct horse battery staple');

    expect(await open(sealed.ciphertext, sealed.iv, sealed.key)).toBe(
      'correct horse battery staple',
    );
  });

  it('round-trips text that is not ASCII', async () => {
    const secret = 'pässwörd — 秘密 — 🔐';
    const sealed = await seal(secret);

    expect(await open(sealed.ciphertext, sealed.iv, sealed.key)).toBe(secret);
  });

  it('produces a 256-bit key and a 96-bit nonce', async () => {
    const sealed = await seal('x');

    expect(fromBase64Url(sealed.key)).toHaveLength(32);
    expect(fromBase64(sealed.iv)).toHaveLength(12);
  });

  it('never repeats a key or a nonce', async () => {
    const runs = await Promise.all([seal('same'), seal('same'), seal('same')]);

    expect(new Set(runs.map((run) => run.key)).size).toBe(3);
    expect(new Set(runs.map((run) => run.iv)).size).toBe(3);
    // Same plaintext, different ciphertext: the nonce is doing its job.
    expect(new Set(runs.map((run) => run.ciphertext)).size).toBe(3);
  });

  it('refuses a wrong key rather than returning rubbish', async () => {
    const sealed = await seal('secret');
    const other = await seal('secret');

    await expect(open(sealed.ciphertext, sealed.iv, other.key)).rejects.toThrow();
  });

  it('refuses a ciphertext that has been altered', async () => {
    const sealed = await seal('secret');
    // Flip the first byte of the ciphertext. GCM authenticates, so this fails
    // to decrypt instead of producing plausible nonsense.
    const bytes = fromBase64(sealed.ciphertext);
    bytes[0] ^= 0xff;

    await expect(open(toBase64(bytes), sealed.iv, sealed.key)).rejects.toThrow();
  });

  it('refuses the right ciphertext with the wrong nonce', async () => {
    const sealed = await seal('secret');
    const other = await seal('secret');

    await expect(open(sealed.ciphertext, other.iv, sealed.key)).rejects.toThrow();
  });
});

describe('fragments', () => {
  it('round-trips an id and a key', async () => {
    const sealed = await seal('secret');
    const id = 'a'.repeat(22);

    expect(parseFragment(`#${buildFragment({ id, key: sealed.key })}`)).toEqual({
      id,
      key: sealed.key,
    });
  });

  it('reads a fragment with or without the hash', async () => {
    const sealed = await seal('secret');
    const fragment = buildFragment({ id: 'b'.repeat(22), key: sealed.key });

    expect(parseFragment(fragment)).not.toBeNull();
    expect(parseFragment(`#${fragment}`)).toEqual(parseFragment(fragment));
  });

  it('rejects anything that is not one', () => {
    expect(parseFragment('')).toBeNull();
    expect(parseFragment('#')).toBeNull();
    expect(parseFragment('#nokey')).toBeNull();
    expect(parseFragment(`#${'a'.repeat(22)}`)).toBeNull();
    // A key of the wrong length is a truncated or padded link, not a valid one.
    expect(parseFragment(`#${'a'.repeat(22)}.${'k'.repeat(42)}`)).toBeNull();
  });
});
