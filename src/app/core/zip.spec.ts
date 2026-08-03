import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { buildZip, compressionLevel, uniqueNames } from './zip';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('uniqueNames', () => {
  it('leaves distinct names alone', () => {
    expect(uniqueNames(['a.pdf', 'b.pdf'])).toEqual(['a.pdf', 'b.pdf']);
  });

  it('suffixes a repeat before the extension', () => {
    expect(uniqueNames(['a.pdf', 'a.pdf', 'a.pdf'])).toEqual(['a.pdf', 'a (2).pdf', 'a (3).pdf']);
  });

  it('treats names differing only in case as the same', () => {
    expect(uniqueNames(['Logo.png', 'logo.png'])).toEqual(['Logo.png', 'logo (2).png']);
  });

  it('handles names with no extension', () => {
    expect(uniqueNames(['README', 'README'])).toEqual(['README', 'README (2)']);
  });

  it('does not treat a leading dot as an extension', () => {
    expect(uniqueNames(['.env', '.env'])).toEqual(['.env', '.env (2)']);
  });

  it('skips past a suffix that is already taken', () => {
    expect(uniqueNames(['a.txt', 'a (2).txt', 'a.txt'])).toEqual([
      'a.txt',
      'a (2).txt',
      'a (3).txt',
    ]);
  });
});

describe('compressionLevel', () => {
  it('stores already-compressed formats', () => {
    expect(compressionLevel('photo.jpg')).toBe(0);
    expect(compressionLevel('doc.PDF')).toBe(0);
    expect(compressionLevel('icon.webp')).toBe(0);
  });

  it('deflates everything else', () => {
    expect(compressionLevel('notes.txt')).toBe(6);
    expect(compressionLevel('data.json')).toBe(6);
    expect(compressionLevel('README')).toBe(6);
  });
});

describe('buildZip', () => {
  it('round-trips its entries', async () => {
    const archive = await buildZip([
      { name: 'hello.txt', bytes: bytes('hello') },
      { name: 'nested/world.txt', bytes: bytes('world') },
    ]);

    const unpacked = unzipSync(archive);
    expect(Object.keys(unpacked).sort()).toEqual(['hello.txt', 'nested/world.txt']);
    expect(new TextDecoder().decode(unpacked['hello.txt'])).toBe('hello');
    expect(new TextDecoder().decode(unpacked['nested/world.txt'])).toBe('world');
  });

  it('keeps every member when names collide', async () => {
    const archive = await buildZip([
      { name: 'page.pdf', bytes: bytes('first') },
      { name: 'page.pdf', bytes: bytes('second') },
    ]);

    const unpacked = unzipSync(archive);
    expect(Object.keys(unpacked).sort()).toEqual(['page (2).pdf', 'page.pdf']);
    expect(new TextDecoder().decode(unpacked['page.pdf'])).toBe('first');
    expect(new TextDecoder().decode(unpacked['page (2).pdf'])).toBe('second');
  });

  it('builds an empty archive without complaint', async () => {
    expect(Object.keys(unzipSync(await buildZip([])))).toEqual([]);
  });
});
