import { describe, expect, it } from 'vitest';

import { isPng, report, stripMetadata, stripPngMetadata, type Tags } from './metadata';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * One PNG chunk: a 32-bit big-endian length, a four-character type, the data
 * and a CRC. The CRC is left zeroed — nothing here verifies it, and a real one
 * would only obscure what each test is actually about.
 */
function chunk(type: string, data: number[] = []): number[] {
  const length = data.length;
  return [
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...[...type].map((character) => character.charCodeAt(0)),
    ...data,
    0,
    0,
    0,
    0,
  ];
}

function png(...chunks: number[][]): Uint8Array {
  return new Uint8Array([...PNG_SIGNATURE, ...chunks.flat()]);
}

/** Reads back the chunk types present in a PNG, in order. */
function typesOf(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const types: string[] = [];
  let at = PNG_SIGNATURE.length;
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    types.push(String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]));
    at += 12 + length;
  }
  return types;
}

describe('isPng', () => {
  it('recognises the PNG signature', () => {
    expect(isPng(png(chunk('IEND')))).toBe(true);
  });

  it('rejects a JPEG', () => {
    expect(isPng(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(false);
  });
});

describe('stripPngMetadata', () => {
  it('removes text and Exif chunks but keeps the image data', () => {
    const source = png(
      chunk('IHDR', [1, 2, 3]),
      chunk('tEXt', [65, 66]),
      chunk('eXIf', [9]),
      chunk('IDAT', [4, 5, 6, 7]),
      chunk('IEND'),
    );

    const out = stripPngMetadata(source);

    expect(out).not.toBeNull();
    expect(typesOf(out as Uint8Array)).toEqual(['IHDR', 'IDAT', 'IEND']);
    // The signature survives, and the file genuinely got smaller.
    expect([...(out as Uint8Array).subarray(0, 8)]).toEqual(PNG_SIGNATURE);
    expect((out as Uint8Array).byteLength).toBeLessThan(source.byteLength);
  });

  it('copies the image data across byte for byte', () => {
    const payload = [11, 22, 33, 44];
    const out = stripPngMetadata(
      png(chunk('IHDR', [1]), chunk('tEXt', [65]), chunk('IDAT', payload), chunk('IEND')),
    ) as Uint8Array;

    // Find IDAT's data and compare it with what went in — a re-encode would
    // change these bytes, and the whole point is that nothing re-encodes.
    const idatAt = out.indexOf(0x49);
    expect(out).not.toBeNull();
    expect([...out].join(',')).toContain(payload.join(','));
    expect(idatAt).toBeGreaterThan(0);
  });

  it('returns null when there is nothing to strip', () => {
    expect(stripPngMetadata(png(chunk('IHDR', [1]), chunk('IDAT', [2]), chunk('IEND')))).toBeNull();
  });

  it('returns null for a file that is not a PNG', () => {
    expect(stripPngMetadata(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
  });

  it('does not run past the end of a truncated file', () => {
    // A chunk claiming far more data than the file holds.
    const truncated = new Uint8Array([...PNG_SIGNATURE, 0, 0, 0xff, 0xff, 116, 69, 88, 116, 1, 2]);
    expect(() => stripPngMetadata(truncated)).not.toThrow();
  });
});

describe('stripMetadata', () => {
  it('handles PNG', () => {
    const out = stripMetadata(png(chunk('IHDR', [1]), chunk('tEXt', [65]), chunk('IEND')));
    expect(out).not.toBeNull();
  });

  it('returns null for a format it cannot edit safely', () => {
    // A WebP (RIFF) container — metadata lives in chunks this does not touch.
    expect(stripMetadata(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]))).toBeNull();
  });
});

describe('report', () => {
  const tag = (description: unknown) => ({ description });

  it('groups tags into readable sections', () => {
    const tags: Tags = {
      Make: tag('Apple'),
      Model: tag('iPhone 15 Pro'),
      ExposureTime: tag('1/120'),
      FNumber: tag('f/1.8'),
      Orientation: tag('right-top'),
    };

    const result = report(tags);
    const names = result.groups.map((group) => group.name);

    expect(names).toContain('Camera');
    expect(names).toContain('Exposure');
    expect(names).toContain('Image');
    expect(result.count).toBe(5);
  });

  it('humanises tag names', () => {
    const result = report({ ISOSpeedRatings: tag(400) });
    const labels = result.groups.flatMap((group) => group.fields.map((field) => field.label));
    expect(labels).toContain('ISO speed ratings');
  });

  it('groups PNG spaced tag names alongside their Exif equivalents', () => {
    // exifreader names PNG header fields with spaces ("Image Width") and Exif
    // fields in camel case ("ImageWidth"); both belong in the same section.
    const result = report({
      'Image Width': tag('192px'),
      'Bit Depth': tag(8),
      'Color Type': tag('RGB with Alpha'),
      ImageWidth: tag(192),
    });

    const image = result.groups.find((group) => group.name === 'Image');
    expect(image?.fields).toHaveLength(4);
    expect(result.groups.some((group) => group.name === 'Other')).toBe(false);
  });

  it('treats PNG text keywords as identifying, like their Exif counterparts', () => {
    const result = report({ Author: tag('Ada Lovelace'), Comment: tag('a private note') });

    const authoring = result.groups.find((group) => group.name === 'Authoring');
    expect(authoring?.sensitive).toBe(true);
    expect(authoring?.fields).toHaveLength(2);
    expect(result.warnings.join(' ')).toContain('names a person');
  });

  it('keeps unknown tags rather than dropping them', () => {
    const result = report({ SomeVendorTag: tag('x') });
    const other = result.groups.find((group) => group.name === 'Other');
    expect(other?.fields[0]).toEqual({ label: 'Some vendor tag', value: 'x' });
  });

  it('hides binary blobs', () => {
    const result = report({ MakerNote: tag('....'), Thumbnail: tag('....') });
    expect(result.count).toBe(0);
    expect(result.groups).toHaveLength(0);
  });

  it('skips empty and undefined values', () => {
    const result = report({ Make: tag('   '), Model: tag(undefined), Software: tag('Undefined') });
    expect(result.count).toBe(0);
  });

  it('reads coordinates and signs the southern and western hemispheres', () => {
    const result = report({
      GPSLatitude: tag(6.9271),
      GPSLatitudeRef: tag('South latitude'),
      GPSLongitude: tag(79.8612),
      GPSLongitudeRef: tag('West longitude'),
    });

    expect(result.hasLocation).toBe(true);
    expect(result.location?.latitude).toBeCloseTo(-6.9271, 4);
    expect(result.location?.longitude).toBeCloseTo(-79.8612, 4);
    expect(result.location?.text).toBe('6.92710° S, 79.86120° W');
  });

  it('keeps northern and eastern coordinates positive', () => {
    const result = report({
      GPSLatitude: tag(6.9271),
      GPSLatitudeRef: tag('North latitude'),
      GPSLongitude: tag(79.8612),
      GPSLongitudeRef: tag('East longitude'),
    });

    expect(result.location?.latitude).toBeCloseTo(6.9271, 4);
    expect(result.location?.longitude).toBeCloseTo(79.8612, 4);
  });

  it('reports no location when the GPS tags are absent', () => {
    const result = report({ Make: tag('Canon') });
    expect(result.hasLocation).toBe(false);
    expect(result.location).toBeNull();
  });

  it('warns about location, serial numbers, names and timestamps', () => {
    const result = report({
      GPSLatitude: tag(1),
      GPSLatitudeRef: tag('North latitude'),
      GPSLongitude: tag(2),
      GPSLongitudeRef: tag('East longitude'),
      BodySerialNumber: tag('ABC123'),
      Artist: tag('Ada Lovelace'),
      DateTimeOriginal: tag('2026:08:19 10:00:00'),
    });

    expect(result.warnings).toHaveLength(4);
    expect(result.warnings.join(' ')).toContain('exact place');
    expect(result.warnings.join(' ')).toContain('serial number');
  });

  it('marks identifying groups as sensitive', () => {
    const result = report({ Make: tag('Canon'), ExposureTime: tag('1/60') });
    const camera = result.groups.find((group) => group.name === 'Camera');
    const exposure = result.groups.find((group) => group.name === 'Exposure');

    expect(camera?.sensitive).toBe(true);
    expect(exposure?.sensitive).toBe(false);
  });

  it('returns an empty report for a file with no metadata', () => {
    const result = report({});
    expect(result).toMatchObject({ count: 0, hasLocation: false, location: null });
    expect(result.groups).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});
