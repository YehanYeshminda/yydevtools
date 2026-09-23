import { describe, expect, it } from 'vitest';

import { decodePasted, isHeic, isImage, zoomIn, zoomOut } from './image-view';

// A 1×1 transparent PNG.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('decodePasted', () => {
  it('sniffs the type of bare Base64', () => {
    expect(decodePasted(PNG)?.mime).toBe('image/png');
  });

  it("takes a data URI's own type", () => {
    expect(decodePasted(`data:image/webp;base64,${PNG}`)?.mime).toBe('image/webp');
  });

  it('decodes a PDF too, so the page can offer it elsewhere', () => {
    expect(decodePasted(btoa('%PDF-1.7 rest'))?.mime).toBe('application/pdf');
  });

  it('returns null for text that is not Base64, and for nothing at all', () => {
    expect(decodePasted('not base64 !!')).toBeNull();
    expect(decodePasted('   ')).toBeNull();
  });
});

describe('zoom', () => {
  it('steps through the levels and stops at the ends', () => {
    expect(zoomIn(1)).toBe(1.5);
    expect(zoomOut(1)).toBe(0.75);
    expect(zoomIn(8)).toBe(8);
    expect(zoomOut(0.25)).toBe(0.25);
  });

  it('snaps an in-between level to the next step', () => {
    expect(zoomIn(0.6)).toBe(0.75);
    expect(zoomOut(0.6)).toBe(0.5);
  });
});

describe('type checks', () => {
  it('knows images by MIME, and HEIC/AVIF/BMP by name when the MIME is blank', () => {
    expect(isImage('image/png')).toBe(true);
    expect(isImage('', 'IMG_0001.HEIC')).toBe(true);
    expect(isImage('application/pdf', 'a.pdf')).toBe(false);
    expect(isHeic('', 'photo.heif')).toBe(true);
    expect(isHeic('image/jpeg', 'photo.jpg')).toBe(false);
  });
});
