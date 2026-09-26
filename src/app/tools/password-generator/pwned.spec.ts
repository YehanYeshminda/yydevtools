import { afterEach, describe, expect, it, vi } from 'vitest';

import { RANGE_API, countInRange, pwnedCount, sha1Hex } from './pwned';

describe('sha1Hex', () => {
  it('matches the known vectors, upper case', async () => {
    expect(await sha1Hex('password')).toBe('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
    expect(await sha1Hex('')).toBe('DA39A3EE5E6B4B0D3255BFEF95601890AFD80709');
  });

  it('hashes the UTF-8 bytes, as the API does', async () => {
    // Computed with Node's crypto.createHash('sha1') over the UTF-8 encoding.
    expect(await sha1Hex('Pässwörd 🔑')).toBe('5161855777D30E63439AE319A813F3BED2D926C9');
  });
});

describe('countInRange', () => {
  const suffix = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';

  it('finds the suffix and returns its count, across CRLF lines', () => {
    const body = `0018A45C4D1DEF81644B54AB7F969B88D65:10\r\n${suffix}:52372427\r\n00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2`;
    expect(countInRange(body, suffix)).toBe(52372427);
  });

  it('matches case-insensitively', () => {
    expect(countInRange(`${suffix.toLowerCase()}:3`, suffix)).toBe(3);
  });

  it('treats a padding entry (count 0) as not found', () => {
    expect(countInRange(`${suffix}:0\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:4`, suffix)).toBe(0);
  });

  it('returns 0 when the suffix is absent or the body is empty', () => {
    expect(countInRange('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:4', suffix)).toBe(0);
    expect(countInRange('', suffix)).toBe(0);
  });
});

describe('pwnedCount', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends only the 5-character prefix, with padding, and matches locally', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:7\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0'),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await pwnedCount('password')).toBe(7);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${RANGE_API}5BAA6`);
    // The whole query is the 5-character prefix: no password, no full hash.
    expect(url.slice(RANGE_API.length)).toHaveLength(5);
    expect(new Headers(init?.headers).get('Add-Padding')).toBe('true');
    expect(init?.body).toBeUndefined();
  });

  it('throws on an error status rather than reporting "not found"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(pwnedCount('password')).rejects.toThrow('503');
  });
});
