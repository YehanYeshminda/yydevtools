import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { sniff } from './sniff';

const bytes = (...parts: (number[] | string)[]): Uint8Array =>
  Uint8Array.from(
    parts.flatMap((part) =>
      typeof part === 'string' ? Array.from(part, (char) => char.charCodeAt(0)) : part,
    ),
  );

describe('sniff', () => {
  it('reads fixed signatures at their offsets', () => {
    expect(sniff(bytes('%PDF-1.7\n'), 'a.pdf').kind.name).toBe('PDF document');
    expect(sniff(bytes([0x89], 'PNG\r\n', [0x1a, 0x0a]), 'a.png').kind.name).toBe('PNG image');
    expect(sniff(bytes([0xff, 0xd8, 0xff, 0xe0]), 'a.jpg').kind.name).toBe('JPEG image');
    expect(sniff(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '), 'a.webp').kind.name).toBe('WebP image');
    expect(sniff(bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt '), 'a.wav').kind.name).toBe('WAV audio');
    expect(sniff(bytes([0x1f, 0x8b, 0x08]), 'a.gz').kind.name).toBe('gzip archive');
    expect(sniff(bytes('MZ', [0x90, 0]), 'a.exe').kind.family).toBe('executable');
    const tar = new Uint8Array(512);
    tar.set(bytes('ustar'), 257);
    expect(sniff(tar, 'a.tar').kind.name).toBe('tar archive');
  });

  it('tells ftyp brands apart', () => {
    expect(sniff(bytes([0, 0, 0, 0x18], 'ftypheic'), 'IMG.HEIC').kind.name).toBe('HEIC image');
    expect(sniff(bytes([0, 0, 0, 0x18], 'ftypavif'), 'a.avif').kind.name).toBe('AVIF image');
    expect(sniff(bytes([0, 0, 0, 0x18], 'ftypisom'), 'a.mp4').kind.name).toBe('MP4 video');
    expect(sniff(bytes([0, 0, 0, 0x18], 'ftypqt  '), 'a.mov').kind.name).toBe('QuickTime video');
  });

  it('looks inside a ZIP for what it really is', () => {
    const docx = zipSync({
      '[Content_Types].xml': strToU8('<x/>'),
      'word/document.xml': strToU8('<w/>'),
    });
    expect(sniff(docx, 'a.docx').kind.name).toBe('Word document (.docx)');

    const macro = zipSync({
      'word/document.xml': strToU8('<w/>'),
      'word/vbaProject.bin': strToU8('x'),
    });
    const result = sniff(macro, 'a.docm');
    expect(result.mismatch).toBeNull();
    expect(result.notes[0]).toMatch(/macros/);

    const plain = zipSync({ 'readme.txt': strToU8('hi') });
    expect(sniff(plain, 'a.zip').kind.name).toBe('ZIP archive');
  });

  it('identifies legacy Office files by their OLE streams', () => {
    const ole = new Uint8Array(1024);
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    ole.set(bytes('WordDocument'.split('').join('\0')), 512);
    expect(sniff(ole, 'memo.doc').kind.name).toBe('Legacy Word document (.doc)');
  });

  it('flags an extension that lies, and accepts one that does not', () => {
    const png = bytes([0x89], 'PNG\r\n', [0x1a, 0x0a]);
    expect(sniff(png, 'photo.jpg').mismatch).toMatch(
      /says \.jpg, but the contents are a PNG image/,
    );
    expect(sniff(png, 'photo.PNG').mismatch).toBeNull();
    expect(sniff(png, 'photo').mismatch).toBeNull();
    expect(sniff(bytes([0xff, 0xd8, 0xff]), 'a.jpeg').mismatch).toBeNull();
    expect(sniff(bytes('hello\n'), 'notes.jpg').mismatch).toMatch(/plain text/);
  });

  it('classifies text without accusing a .txt of anything', () => {
    expect(sniff(bytes('{"a":1}'), 'data.txt')).toMatchObject({
      kind: { name: 'JSON (UTF-8)', family: 'text' },
      mismatch: null,
    });
    expect(sniff(bytes('<?xml version="1.0"?><svg xmlns="x"/>'), 'a.svg').kind.name).toBe(
      'SVG image (UTF-8)',
    );
    expect(sniff(bytes('<!DOCTYPE html><html></html>'), 'a.htm').kind.name).toBe(
      'HTML document (UTF-8)',
    );
    expect(sniff(bytes('-----BEGIN CERTIFICATE-----\nAA==\n'), 'a.crt').kind.name).toMatch(/^PEM/);
    expect(sniff(bytes([0xef, 0xbb, 0xbf], 'hi'), 'a.txt').kind.name).toBe(
      'Plain text (UTF-8 with BOM)',
    );
    expect(sniff(bytes([0xff, 0xfe, 0x68, 0, 0x69, 0]), 'a.txt').kind.name).toBe(
      'Plain text (UTF-16 LE)',
    );
    expect(sniff(bytes('caf', [0xe9]), 'a.txt').kind.name).toBe(
      'Plain text (Windows-1252 or Latin-1)',
    );
  });

  it('reports line endings and empties', () => {
    expect(sniff(bytes('a\r\nb\r\n'), 'a.txt').notes).toEqual(['Windows line endings (CRLF).']);
    expect(sniff(bytes('a\nb\r\n'), 'a.txt').notes[0]).toMatch(/Mixed/);
    expect(sniff(new Uint8Array(0), 'a.bin').kind.name).toBe('Empty file');
    expect(sniff(bytes([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), 'a.bin').kind.name).toBe(
      'Unknown binary data',
    );
  });
});
