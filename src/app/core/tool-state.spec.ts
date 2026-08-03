import { describe, expect, it } from 'vitest';

import { decodeState, encodeState, pickKeys, stripKeys } from './tool-state';

describe('encodeState / decodeState', () => {
  it('round-trips an object', () => {
    const state = { pattern: '\\d{4}-\\d{2}', flags: 'gi', text: 'on 2026-08-03 and 2027-01-01' };
    expect(decodeState(encodeState(state)!)).toEqual(state);
  });

  it('round-trips unicode and newlines intact', () => {
    const state = { text: 'héllo — “quoted”\nsecond line\t✓ 日本語' };
    expect(decodeState(encodeState(state)!)).toEqual(state);
  });

  it('preserves types other than string', () => {
    const state = { count: 42, on: true, off: false, nothing: null, list: [1, 2, 3] };
    expect(decodeState(encodeState(state)!)).toEqual(state);
  });

  it('produces a fragment-safe string', () => {
    const encoded = encodeState({ text: 'a+b/c=d?e&f#g' })!;
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('compresses repetitive text well below its raw size', () => {
    const state = { text: 'the same sentence over and over. '.repeat(200) };
    const raw = JSON.stringify(state).length;
    const encoded = encodeState(state)!;
    // Deflate is what makes a page of text fit in a link at all.
    expect(encoded.length).toBeLessThan(raw / 10);
  });

  it('returns null for a value JSON cannot represent', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(encodeState(cyclic)).toBeNull();
  });

  it('returns null for a corrupted payload rather than throwing', () => {
    expect(decodeState('not-a-real-payload')).toBeNull();
    expect(decodeState('')).toBeNull();
  });

  it('returns null for a truncated payload', () => {
    const encoded = encodeState({ text: 'something reasonably long to truncate' })!;
    expect(decodeState(encoded.slice(0, encoded.length - 6))).toBeNull();
  });

  it('returns null when the payload decodes to something that is not an object', () => {
    expect(decodeState(encodeState(['a', 'b'])!)).toBeNull();
    expect(decodeState(encodeState('plain string')!)).toBeNull();
  });
});

describe('stripKeys', () => {
  it('removes the named keys', () => {
    expect(stripKeys({ ssid: 'Cafe', password: 'secret' }, ['password'])).toEqual({
      ssid: 'Cafe',
    });
  });

  it('returns the input untouched when nothing is omitted', () => {
    const state = { a: 1 };
    expect(stripKeys(state, undefined)).toBe(state);
    expect(stripKeys(state, [])).toBe(state);
  });
});

describe('pickKeys', () => {
  it('keeps only the declared keys', () => {
    const allowed = new Set(['pattern', 'flags']);
    expect(pickKeys({ pattern: 'a', flags: 'g', injected: 'x' }, allowed)).toEqual({
      pattern: 'a',
      flags: 'g',
    });
  });

  it('drops everything when a link declares nothing the tool knows', () => {
    expect(pickKeys({ evil: true }, new Set(['pattern']))).toEqual({});
  });

  it('keeps a declared key even when its value is falsy', () => {
    expect(pickKeys({ flags: '', count: 0 }, new Set(['flags', 'count']))).toEqual({
      flags: '',
      count: 0,
    });
  });
});
