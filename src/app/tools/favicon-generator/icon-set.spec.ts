import { describe, expect, it } from 'vitest';

import { encodeIco, headSnippet, manifestJson, shortNameFor } from './icon-set';

describe('encodeIco', () => {
  it('writes a directory that points at each PNG in turn', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5]);
    const ico = encodeIco([
      { size: 16, png: a },
      { size: 256, png: b },
    ]);
    const view = new DataView(ico.buffer);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(2);
    // First entry: 16 px, 3 bytes at offset 38 (6 + 2 × 16).
    expect([ico[6], ico[7]]).toEqual([16, 16]);
    expect(view.getUint32(14, true)).toBe(3);
    expect(view.getUint32(18, true)).toBe(38);
    // 256 is written as 0, as the format requires; its data follows the first.
    expect([ico[22], ico[23]]).toEqual([0, 0]);
    expect(view.getUint32(34, true)).toBe(41);
    expect([...ico.subarray(38)]).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('manifest and head snippet', () => {
  const options = {
    name: 'Bakery Orders',
    shortName: 'Bakery',
    theme: '#ff8800',
    background: '#ffffff',
    svg: true,
  };

  it('lists the three PNGs plus the SVG when there is one', () => {
    const manifest = JSON.parse(manifestJson(options));
    expect(manifest.short_name).toBe('Bakery');
    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual([
      '/icon-192.png',
      '/icon-512.png',
      '/icon-maskable-512.png',
      '/icon.svg',
    ]);
    expect(JSON.parse(manifestJson({ ...options, svg: false })).icons).toHaveLength(3);
  });

  it('puts the theme colour and the SVG link in the head', () => {
    const head = headSnippet(options);
    expect(head).toContain('content="#ff8800"');
    expect(head).toContain('href="/icon.svg"');
    expect(headSnippet({ ...options, svg: false })).not.toContain('icon.svg');
  });
});

describe('shortNameFor', () => {
  it('keeps whole words up to twelve characters', () => {
    expect(shortNameFor('Bakery Orders Tracker')).toBe('Bakery');
    expect(shortNameFor('My Shop')).toBe('My Shop');
    expect(shortNameFor('Supercalifragilistic')).toBe('Supercalifra');
  });
});
