import { describe, expect, it } from 'vitest';

import { crc32Hex, md5Hex } from './checksums';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('md5Hex', () => {
  // Vectors from RFC 1321, appendix A.5.
  it.each([
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    [
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      'd174ab98d277d9f5a5611c2c9f419d9f',
    ],
  ])('md5(%j) = %s', (input, expected) => {
    expect(md5Hex(bytes(input))).toBe(expected);
  });

  it('handles input that spans multiple 64-byte blocks', () => {
    const long = 'a'.repeat(1000);
    expect(md5Hex(bytes(long))).toBe('cabe45dcc9ae5b66ba86600cca6b8ba8');
  });
});

describe('crc32Hex', () => {
  it.each([
    ['', '00000000'],
    ['a', 'e8b7be43'],
    ['abc', '352441c2'],
    ['The quick brown fox jumps over the lazy dog', '414fa339'],
  ])('crc32(%j) = %s', (input, expected) => {
    expect(crc32Hex(bytes(input))).toBe(expected);
  });
});
