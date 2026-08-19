/**
 * Reading *everything* a file records about itself, and removing it losslessly.
 *
 * This is the counterpart to `exif.ts`, which serves the compressor: that module
 * summarises a dozen recognisable fields and splices an Exif segment across a
 * re-encode. This one is for the inspector, where the point is the opposite —
 * show the whole picture, grouped so it can be read, and then strip it without
 * touching a single pixel.
 *
 * "Without touching a pixel" is the part worth stating plainly. The obvious way
 * to remove metadata is to draw the image to a canvas and re-encode it, which
 * works and is what most tools do — but it decompresses and recompresses the
 * photo, so the file that comes back is visibly worse than the one that went in.
 * Both strippers here edit the container instead: JPEG loses its APP1 segment,
 * PNG loses its text and eXIf chunks, and the compressed image data is copied
 * across byte for byte. The result is pixel-identical to the original.
 */

import { removeExifSegment } from './exif';

/** The shape of the exifreader tags this reads — a narrow view of a wide type. */
export type Tag = { description?: unknown; value?: unknown } | undefined;
export type Tags = Record<string, Tag>;

export interface MetadataField {
  label: string;
  value: string;
}

export interface MetadataGroup {
  /** Section heading, e.g. "Camera". */
  name: string;
  fields: MetadataField[];
  /** True for groups that identify a person, a device or a place. */
  sensitive: boolean;
}

export interface MetadataReport {
  groups: MetadataGroup[];
  /** Total fields across every group. */
  count: number;
  /** True when the file records where the photo was taken. */
  hasLocation: boolean;
  /** Decimal coordinates, when present, for display and a map link. */
  location: { latitude: number; longitude: number; text: string } | null;
  /** Plain-English notes about what the file gives away. */
  warnings: string[];
}

/**
 * Tags never worth showing: binary blobs and internal bookkeeping that would
 * bury the fields people actually recognise. MakerNote alone can run to tens of
 * kilobytes of undocumented vendor data.
 */
const HIDDEN = new Set([
  'MakerNote',
  'Thumbnail',
  'Images',
  'ApplicationNotes',
  'ICC_Profile',
  'InteroperabilityIFDPointer',
  'ExifIFDPointer',
  'GPSInfoIFDPointer',
  'PrintIM',
  'ComponentsConfiguration',
  'SceneType',
  'FileType',
]);

/**
 * Group definitions, in display order.
 *
 * Membership is tested against the tag name with spaces and underscores
 * removed. That normalisation is not cosmetic: Exif tags arrive camel-cased
 * ("ImageWidth") while PNG's text chunks arrive spaced ("Image Width"), and
 * without it every PNG field fell through into "Other".
 */
const GROUPS: { name: string; sensitive: boolean; match: (tag: string) => boolean }[] = [
  {
    name: 'Location',
    sensitive: true,
    match: (tag) => tag.startsWith('GPS'),
  },
  {
    name: 'Camera',
    sensitive: true,
    match: (tag) =>
      [
        'Make',
        'Model',
        'LensMake',
        'LensModel',
        'LensSpecification',
        'BodySerialNumber',
        'LensSerialNumber',
        'SerialNumber',
        'CameraOwnerName',
      ].includes(tag),
  },
  {
    name: 'Date & time',
    sensitive: true,
    match: (tag) =>
      tag.startsWith('DateTime') ||
      tag.startsWith('OffsetTime') ||
      ['SubSecTime', 'CreationTime', 'ModifyDate', 'CreateDate'].includes(tag),
  },
  {
    name: 'Exposure',
    sensitive: false,
    match: (tag) =>
      [
        'ExposureTime',
        'FNumber',
        'ISOSpeedRatings',
        'PhotographicSensitivity',
        'FocalLength',
        'FocalLengthIn35mmFilm',
        'Flash',
        'WhiteBalance',
        'MeteringMode',
        'ExposureProgram',
        'ExposureMode',
        'ExposureBiasValue',
        'ShutterSpeedValue',
        'ApertureValue',
        'BrightnessValue',
        'DigitalZoomRatio',
        'SceneCaptureType',
        'Contrast',
        'Saturation',
        'Sharpness',
      ].includes(tag),
  },
  {
    name: 'Image',
    sensitive: false,
    match: (tag) =>
      [
        'ImageWidth',
        'ImageLength',
        'PixelXDimension',
        'PixelYDimension',
        'Orientation',
        'ColorSpace',
        'XResolution',
        'YResolution',
        'ResolutionUnit',
        'BitsPerSample',
        'Compression',
        'PhotometricInterpretation',
        'YCbCrPositioning',
        // PNG's header fields, which arrive spaced and are normalised to these.
        'ImageHeight',
        'BitDepth',
        'ColorType',
        'Filter',
        'Interlace',
        'PixelsPerUnitX',
        'PixelsPerUnitY',
        'PixelUnits',
      ].includes(tag),
  },
  {
    name: 'Authoring',
    sensitive: true,
    match: (tag) =>
      [
        'Software',
        'Artist',
        'Copyright',
        'ImageDescription',
        'UserComment',
        'Rating',
        'HostComputer',
        // The standard PNG tEXt keywords, which carry exactly the same kind of
        // identifying information as their Exif counterparts.
        'Author',
        'Comment',
        'Description',
        'Title',
        'Disclaimer',
        'Warning',
        'Source',
      ].includes(tag),
  },
];

/**
 * "Image Width" and "ImageWidth" are the same field arriving from PNG and Exif
 * respectively, so both are reduced to one key before group matching.
 */
function normalise(tag: string): string {
  return tag.replace(/[\s_]/g, '');
}

function text(tag: Tag): string | null {
  if (!tag) {
    return null;
  }
  const value = tag.description ?? tag.value;
  if (value === undefined || value === null) {
    return null;
  }
  const rendered = Array.isArray(value) ? value.join(', ') : String(value);
  const trimmed = rendered.trim();
  if (trimmed === '' || trimmed === 'Undefined' || trimmed === '[object Object]') {
    return null;
  }
  // A handful of tags decode to enormous strings; a table cell is not the place.
  return trimmed.length > 300 ? `${trimmed.slice(0, 300)}…` : trimmed;
}

/**
 * "ISOSpeedRatings" → "ISO speed ratings", so the table reads like prose and
 * matches the sentence-case labels the rest of the app uses.
 *
 * Words that are entirely capitals are left alone: ISO, GPS and RGB are
 * acronyms, and lower-casing them would read as a typo rather than as prose.
 */
function humanise(tag: string): string {
  const words = tag
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  return words
    .map((word, index) => {
      if (word.length > 1 && word === word.toUpperCase()) {
        return word;
      }
      return index === 0
        ? word.charAt(0).toUpperCase() + word.slice(1)
        : word.charAt(0).toLowerCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Turns a raw exifreader tag bag into grouped, readable sections.
 *
 * Every tag that survives the hidden list appears somewhere — anything the
 * groups do not claim lands in "Other" rather than being dropped, because the
 * promise this tool makes is that it shows you everything.
 */
export function report(tags: Tags): MetadataReport {
  const buckets = new Map<string, MetadataField[]>();
  for (const group of GROUPS) {
    buckets.set(group.name, []);
  }
  const other: MetadataField[] = [];

  for (const [name, tag] of Object.entries(tags)) {
    if (HIDDEN.has(name)) {
      continue;
    }
    const value = text(tag);
    if (value === null) {
      continue;
    }
    const group = GROUPS.find((candidate) => candidate.match(normalise(name)));
    const field = { label: humanise(name), value };
    if (group) {
      buckets.get(group.name)?.push(field);
    } else {
      other.push(field);
    }
  }

  const groups: MetadataGroup[] = [];
  for (const group of GROUPS) {
    const fields = buckets.get(group.name) ?? [];
    if (fields.length > 0) {
      groups.push({ name: group.name, fields, sensitive: group.sensitive });
    }
  }
  if (other.length > 0) {
    groups.push({ name: 'Other', fields: other, sensitive: false });
  }

  const location = coordinates(tags);
  const count = groups.reduce((total, group) => total + group.fields.length, 0);

  return {
    groups,
    count,
    hasLocation: location !== null,
    location,
    warnings: warningsFor(tags, location !== null),
  };
}

/** Decimal coordinates from the GPS tags, or null when the file has none. */
function coordinates(tags: Tags): MetadataReport['location'] {
  const rawLat = tags['GPSLatitude']?.description;
  const rawLon = tags['GPSLongitude']?.description;
  if (rawLat === undefined || rawLon === undefined) {
    return null;
  }
  const latitude = signed(rawLat, tags['GPSLatitudeRef']);
  const longitude = signed(rawLon, tags['GPSLongitudeRef']);
  if (latitude === null || longitude === null) {
    return null;
  }
  const latRef = latitude >= 0 ? 'N' : 'S';
  const lonRef = longitude >= 0 ? 'E' : 'W';
  return {
    latitude,
    longitude,
    text: `${Math.abs(latitude).toFixed(5)}° ${latRef}, ${Math.abs(longitude).toFixed(5)}° ${lonRef}`,
  };
}

/**
 * exifreader hands back a positive magnitude plus a separate hemisphere ref, so
 * south and west have to be negated to become real decimal coordinates — the
 * difference between a map pin in Sri Lanka and one in Siberia.
 */
function signed(value: unknown, ref: Tag): number | null {
  const magnitude = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(magnitude)) {
    return null;
  }
  const hemisphere = (text(ref) ?? '').charAt(0).toUpperCase();
  const negative = hemisphere === 'S' || hemisphere === 'W';
  return negative ? -Math.abs(magnitude) : Math.abs(magnitude);
}

function warningsFor(tags: Tags, hasLocation: boolean): string[] {
  const warnings: string[] = [];
  if (hasLocation) {
    warnings.push('This file records the exact place the photo was taken.');
  }
  const serial =
    text(tags['BodySerialNumber']) ?? text(tags['SerialNumber']) ?? text(tags['LensSerialNumber']);
  if (serial) {
    warnings.push('It carries a camera or lens serial number, which links every photo from that device.');
  }
  const person =
    text(tags['Artist']) ??
    text(tags['CameraOwnerName']) ??
    text(tags['Copyright']) ??
    text(tags['Author']);
  if (person) {
    warnings.push('It names a person as the author or owner.');
  }
  if (text(tags['DateTimeOriginal']) ?? text(tags['DateTime']) ?? text(tags['Creation Time'])) {
    warnings.push('It records when the photo was taken, to the second.');
  }
  return warnings;
}

// --- Stripping, losslessly ----------------------------------------------

/** The eight bytes that begin every PNG. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * PNG chunks that carry metadata rather than image data.
 *
 * `tIME` goes too: it is the last-modified timestamp, which is exactly the kind
 * of thing someone stripping metadata means to remove.
 */
const PNG_METADATA_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME', 'iCCP', 'dSIG']);

export function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/**
 * Returns the PNG with every metadata chunk removed, or null when the input is
 * not a PNG or carries nothing to strip.
 *
 * Whole chunks are dropped, so no CRC needs recomputing — each surviving chunk
 * still carries the checksum it was written with, and the image data is copied
 * across untouched.
 */
export function stripPngMetadata(bytes: Uint8Array): Uint8Array | null {
  if (!isPng(bytes)) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const keep: { start: number; end: number }[] = [];
  let removed = 0;
  let at = PNG_SIGNATURE.length;

  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    // length + type + data + CRC
    const end = at + 12 + length;
    if (end > bytes.length) {
      // Truncated file: keep what is left verbatim rather than corrupting it.
      break;
    }
    if (PNG_METADATA_CHUNKS.has(type)) {
      removed++;
    } else {
      keep.push({ start: at, end });
    }
    if (type === 'IEND') {
      at = end;
      break;
    }
    at = end;
  }

  if (removed === 0) {
    return null;
  }

  const size = PNG_SIGNATURE.length + keep.reduce((total, span) => total + (span.end - span.start), 0);
  const out = new Uint8Array(size);
  out.set(bytes.subarray(0, PNG_SIGNATURE.length), 0);
  let cursor = PNG_SIGNATURE.length;
  for (const span of keep) {
    out.set(bytes.subarray(span.start, span.end), cursor);
    cursor += span.end - span.start;
  }
  return out;
}

/**
 * Removes the metadata from a JPEG or PNG without re-encoding it, or returns
 * null when the format is not one this can edit safely — in which case the
 * caller should say so rather than silently handing back the original.
 */
export function stripMetadata(bytes: Uint8Array): Uint8Array | null {
  if (isPng(bytes)) {
    return stripPngMetadata(bytes);
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const stripped = removeExifSegment(bytes);
    return stripped.byteLength === bytes.byteLength ? null : stripped;
  }
  return null;
}
