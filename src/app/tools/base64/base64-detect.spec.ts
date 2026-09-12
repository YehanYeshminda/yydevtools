import { describe, expect, it } from 'vitest';

import { detect, firstInvalid, stripInvalid } from './base64-detect';

describe('detect', () => {
  it('decodes well-formed Base64 that reads as text', () => {
    expect(detect('SGVsbG8sIHdvcmxk')).toMatchObject({ direction: 'decode' });
    expect(detect('  SGVs\nbG8=\n')).toMatchObject({ direction: 'decode' });
    // URL-safe alphabet, no padding — a JWT segment.
    expect(detect('eyJhbGciOiJIUzI1NiJ9')).toMatchObject({ direction: 'decode' });
  });

  it('decodes a data URI whatever it holds', () => {
    expect(detect('data:image/png;base64,iVBORw0KGgo=')).toMatchObject({
      direction: 'decode',
      mime: 'image/png',
    });
  });

  it('recognises the Base64 of a binary file', () => {
    // A PNG signature followed by anything.
    expect(detect('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB')).toMatchObject({
      direction: 'decode',
      mime: 'image/png',
    });
  });

  it('encodes anything that is not Base64, or that decodes to noise', () => {
    expect(detect('hello world')).toMatchObject({ direction: 'encode' });
    expect(detect('Café menu 🚀')).toMatchObject({ direction: 'encode' });
    expect(detect('test')).toMatchObject({ direction: 'encode' }); // valid alphabet, garbage bytes
    expect(detect('abc')).toMatchObject({ direction: 'encode' }); // too short
    expect(detect('')).toMatchObject({ direction: 'encode' });
  });
});

describe('firstInvalid', () => {
  it('names the character and its 1-based position', () => {
    expect(firstInvalid('SGVs*bG8=')).toEqual({
      position: 5,
      char: '*',
      message: '“*” at position 5 is not a Base64 character.',
    });
    expect(firstInvalid('SGVsbG8=')).toBeNull();
    expect(firstInvalid('SGVs\n bG8=')).toBeNull();
  });

  it('counts positions in the whole input, past a data: prefix', () => {
    const issue = firstInvalid('data:text/plain;base64,SGV%sbG8=');
    expect(issue?.char).toBe('%');
    expect(issue?.position).toBe(27);
  });
});

describe('stripInvalid', () => {
  it('drops the offending characters and keeps the rest intact', () => {
    expect(stripInvalid('SGVs*bG8=\n')).toBe('SGVsbG8=\n');
    expect(stripInvalid('data:text/plain;base64,SGV%sbG8=')).toBe(
      'data:text/plain;base64,SGVsbG8=',
    );
  });
});
