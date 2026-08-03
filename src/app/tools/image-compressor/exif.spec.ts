import { describe, expect, it } from 'vitest';

import { extractExifSegment, insertExifSegment, removeExifSegment, summarise } from './exif';

/** A minimal but structurally valid JPEG: SOI, optional segments, SOS, data, EOI. */
function jpeg(segments: number[][] = []): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, // SOI
    ...segments.flat(),
    0xff, 0xda, 0x00, 0x02, // SOS
    0x12, 0x34, 0xff, 0xe1, 0x56, // scan data that *looks* like an APP1 marker
    0xff, 0xd9, // EOI
  ]);
}

/** An Exif APP1 segment carrying `payload` after the "Exif\0\0" magic. */
function exifSegment(payload: number[] = [0x2a]): number[] {
  const body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...payload];
  const length = body.length + 2;
  return [0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...body];
}

/** A JFIF APP0 segment, which real encoders emit and which must be preserved. */
const APP0 = [0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46];

describe('extractExifSegment', () => {
  it('finds the Exif APP1 segment', () => {
    const segment = exifSegment();
    expect(Array.from(extractExifSegment(jpeg([segment]))!)).toEqual(segment);
  });

  it('finds it after other segments', () => {
    const segment = exifSegment();
    expect(Array.from(extractExifSegment(jpeg([APP0, segment]))!)).toEqual(segment);
  });

  it('returns null when there is none', () => {
    expect(extractExifSegment(jpeg([APP0]))).toBeNull();
  });

  it('returns null for a non-JPEG', () => {
    expect(extractExifSegment(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });

  it('ignores an APP1-looking byte pair inside the scan data', () => {
    // The fixture deliberately embeds ff e1 after SOS; scanning must stop there.
    expect(extractExifSegment(jpeg([]))).toBeNull();
  });

  it('rejects an APP1 that is not Exif (e.g. XMP)', () => {
    const xmp = [0xff, 0xe1, 0x00, 0x08, 0x68, 0x74, 0x74, 0x70, 0x3a, 0x2f];
    expect(extractExifSegment(jpeg([xmp]))).toBeNull();
  });
});

describe('insertExifSegment', () => {
  it('places the segment directly after SOI', () => {
    const segment = new Uint8Array(exifSegment());
    const out = insertExifSegment(jpeg([APP0]), segment);
    expect(Array.from(out.subarray(0, 2))).toEqual([0xff, 0xd8]);
    expect(Array.from(out.subarray(2, 2 + segment.length))).toEqual(Array.from(segment));
  });

  it('round-trips: the inserted segment is found again', () => {
    const segment = new Uint8Array(exifSegment([0x01, 0x02, 0x03]));
    const out = insertExifSegment(jpeg([APP0]), segment);
    expect(Array.from(extractExifSegment(out)!)).toEqual(Array.from(segment));
  });

  it('keeps the rest of the file intact', () => {
    const original = jpeg([APP0]);
    const out = insertExifSegment(original, new Uint8Array(exifSegment()));
    const withoutExif = removeExifSegment(out);
    expect(Array.from(withoutExif)).toEqual(Array.from(original));
  });

  it('replaces an existing Exif segment rather than adding a second', () => {
    const first = new Uint8Array(exifSegment([0x11]));
    const second = new Uint8Array(exifSegment([0x22]));
    const out = insertExifSegment(jpeg([first]), second);
    expect(Array.from(extractExifSegment(out)!)).toEqual(Array.from(second));
    // Only one APP1 survives: stripping it leaves a file with none.
    expect(extractExifSegment(removeExifSegment(out))).toBeNull();
  });

  it('leaves a non-JPEG untouched', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(insertExifSegment(png, new Uint8Array(exifSegment()))).toBe(png);
  });
});

describe('summarise', () => {
  it('collapses a make that the model already repeats', () => {
    const { rows } = summarise({
      Make: { description: 'Apple' },
      Model: { description: 'Apple iPhone 15 Pro' },
    });
    expect(rows).toContainEqual({ label: 'Camera', value: 'Apple iPhone 15 Pro' });
  });

  it('joins a make and model that do not overlap', () => {
    const { rows } = summarise({ Make: { description: 'NIKON' }, Model: { description: 'D750' } });
    expect(rows).toContainEqual({ label: 'Camera', value: 'NIKON D750' });
  });

  it('flags and formats a location', () => {
    const result = summarise({
      GPSLatitude: { description: 51.50722 },
      GPSLongitude: { description: 0.1275 },
      GPSLatitudeRef: { description: 'North latitude' },
      GPSLongitudeRef: { description: 'West longitude' },
    });
    expect(result.hasLocation).toBe(true);
    expect(result.location).toBe('51.50722° N, 0.12750° W');
  });

  it('reports no location when the tags are absent', () => {
    const result = summarise({ Make: { description: 'Canon' } });
    expect(result.hasLocation).toBe(false);
    expect(result.location).toBeNull();
  });

  it('skips empty and undefined values', () => {
    const { rows } = summarise({
      Make: { description: '  ' },
      Software: { description: 'Undefined' },
      Artist: { description: 'Ada' },
    });
    expect(rows).toEqual([{ label: 'Artist', value: 'Ada' }]);
  });
});
