import { describe, expect, it } from 'vitest';

import { binaryDump, hexDump } from './byte-view';

const HELLO = new TextEncoder().encode('Hello, world!\n ÿ');

describe('hexDump', () => {
  it('lays a row out as offset, two groups of eight, and printable ASCII', () => {
    expect(hexDump(HELLO)).toBe(
      '00000000  48 65 6c 6c 6f 2c 20 77  6f 72 6c 64 21 0a 20 c3  |Hello, world!. .|\n' +
        '00000010  bf                                                |.|',
    );
  });

  it('stops at the limit', () => {
    expect(hexDump(new Uint8Array(100), 16).split('\n')).toHaveLength(1);
  });
});

describe('binaryDump', () => {
  it('writes every byte as eight bits, six to a line', () => {
    const lines = binaryDump(new Uint8Array([1, 2, 255, 0, 128, 64, 7])).split('\n');
    expect(lines[0]).toBe('00000000  00000001 00000010 11111111 00000000 10000000 01000000');
    expect(lines[1]).toBe('00000006  00000111');
  });
});
