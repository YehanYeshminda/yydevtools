import { describe, expect, it } from 'vitest';

import { parseUrl, transform } from './url-codec';

describe('transform (encode)', () => {
  it('percent-encodes a component, escaping delimiters', () => {
    expect(transform('a b&c=d', 'encode', 'component').output).toBe('a%20b%26c%3Dd');
  });

  it('leaves URL delimiters intact in full scope', () => {
    expect(transform('https://ex.com/a b?x=1&y=2', 'encode', 'full').output).toBe(
      'https://ex.com/a%20b?x=1&y=2',
    );
  });

  it('encodes non-ASCII as UTF-8 percent sequences', () => {
    expect(transform('café', 'encode', 'component').output).toBe('caf%C3%A9');
  });

  it('reports an error on an unpaired surrogate', () => {
    const result = transform('\uD800', 'encode', 'component');
    expect(result.output).toBe('');
    expect(result.error).toMatch(/surrogate/i);
  });

  it('treats empty input as a quiet success', () => {
    expect(transform('', 'encode', 'component')).toEqual({ output: '', error: null });
  });
});

describe('transform (decode)', () => {
  it('decodes a percent-encoded component', () => {
    expect(transform('a%20b%26c', 'decode', 'component').output).toBe('a b&c');
  });

  it('round-trips with encode', () => {
    const raw = 'hello wörld/?&=#';
    const encoded = transform(raw, 'encode', 'component').output;
    expect(transform(encoded, 'decode', 'component').output).toBe(raw);
  });

  it('reports an error on malformed percent-encoding', () => {
    const result = transform('%E0%A4%A', 'decode', 'component');
    expect(result.output).toBe('');
    expect(result.error).toMatch(/percent/i);
  });

  it('errors on a stray percent sign', () => {
    expect(transform('100% done', 'decode', 'component').error).not.toBeNull();
  });
});

describe('parseUrl', () => {
  it('returns null for non-URL text', () => {
    expect(parseUrl('just some words')).toBeNull();
    expect(parseUrl('')).toBeNull();
    expect(parseUrl('/relative/path')).toBeNull();
  });

  it('splits an absolute URL into its parts', () => {
    const parts = parseUrl('https://api.example.com:8443/v2/search?q=hi&n=2#top');
    expect(parts).not.toBeNull();
    expect(parts!.protocol).toBe('https');
    expect(parts!.host).toBe('api.example.com');
    expect(parts!.port).toBe('8443');
    expect(parts!.path).toBe('/v2/search');
    expect(parts!.query).toBe('q=hi&n=2');
    expect(parts!.fragment).toBe('top');
  });

  it('decodes query parameter values', () => {
    const parts = parseUrl('https://ex.com/?q=caf%C3%A9%20m%C3%BCnchen&sort=updated%20desc');
    expect(parts!.params).toEqual([
      { key: 'q', value: 'café münchen' },
      { key: 'sort', value: 'updated desc' },
    ]);
  });

  it('has no port when the URL omits one', () => {
    expect(parseUrl('https://ex.com/path')!.port).toBe('');
  });
});
