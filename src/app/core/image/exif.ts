/**
 * Reading the metadata in a photo, and deciding whether it survives compression.
 *
 * Two separate jobs live here.
 *
 * The first is *showing* what a file carries. A photo off a phone records the
 * camera, the exposure, the time — and very often the exact coordinates it was
 * taken at. People share compressed images without ever knowing that is in
 * there, so the tool now says so plainly.
 *
 * The second is *keeping* it, which needs explaining. The mozjpeg and libwebp
 * encoders take raw pixels and emit a bare image; neither has any notion of
 * Exif, so every output was silently stripped whether or not that was wanted.
 * Stripping is the right default, but "keep" has to be real rather than a
 * checkbox that does nothing — so for JPEG output the original APP1 segment is
 * spliced back into the encoded file. WebP stores metadata in RIFF chunks
 * instead, which is a different format entirely; the UI says so rather than
 * pretending.
 */

const SOI = 0xd8;
const APP1 = 0xe1;
const SOS = 0xda;
/** "Exif\0\0" — the APP1 payload prefix that distinguishes Exif from XMP. */
const EXIF_MAGIC = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];

/** A segment's length field is 16-bit and counts itself, so this is the ceiling. */
const MAX_SEGMENT_PAYLOAD = 0xffff - 2;

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === SOI;
}

function hasExifMagic(bytes: Uint8Array, at: number): boolean {
  return EXIF_MAGIC.every((byte, index) => bytes[at + index] === byte);
}

/**
 * The Exif APP1 segment of a JPEG — marker, length and payload — or null when
 * there is none.
 *
 * Scanning stops at the start of scan data: everything after SOS is entropy
 * coded, where a 0xFFE1 pair is ordinary image data rather than a marker.
 */
export function extractExifSegment(bytes: Uint8Array): Uint8Array | null {
  if (!isJpeg(bytes)) {
    return null;
  }
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      return null; // Not at a marker boundary — refuse to guess.
    }
    const marker = bytes[offset + 1];
    if (marker === SOS) {
      return null;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) {
      return null;
    }
    if (marker === APP1 && hasExifMagic(bytes, offset + 4)) {
      return bytes.slice(offset, offset + 2 + length);
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * A copy of `bytes` carrying `segment` as its Exif APP1.
 *
 * Any Exif APP1 already present is dropped first, so this cannot produce a file
 * with two of them. The segment goes directly after SOI, which is where the
 * Exif specification puts it.
 */
export function insertExifSegment(bytes: Uint8Array, segment: Uint8Array): Uint8Array {
  if (!isJpeg(bytes) || segment.length < 4 || segment.length - 2 > MAX_SEGMENT_PAYLOAD) {
    return bytes;
  }
  const stripped = removeExifSegment(bytes);
  const out = new Uint8Array(stripped.length + segment.length);
  out.set(stripped.subarray(0, 2), 0);
  out.set(segment, 2);
  out.set(stripped.subarray(2), 2 + segment.length);
  return out;
}

/** A copy of `bytes` with its Exif APP1 removed, or `bytes` when it has none. */
export function removeExifSegment(bytes: Uint8Array): Uint8Array {
  const segment = extractExifSegment(bytes);
  if (!segment) {
    return bytes;
  }
  // extractExifSegment matched a unique byte run; find where it started.
  const at = indexOfSegment(bytes, segment);
  if (at < 0) {
    return bytes;
  }
  const out = new Uint8Array(bytes.length - segment.length);
  out.set(bytes.subarray(0, at), 0);
  out.set(bytes.subarray(at + segment.length), at);
  return out;
}

function indexOfSegment(bytes: Uint8Array, segment: Uint8Array): number {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      return -1;
    }
    const marker = bytes[offset + 1];
    if (marker === SOS) {
      return -1;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker === APP1 && hasExifMagic(bytes, offset + 4)) {
      return offset;
    }
    if (length < 2) {
      return -1;
    }
    offset += 2 + length;
  }
  return -1;
}

// --- Summarising, for display -------------------------------------------

export interface MetadataRow {
  label: string;
  value: string;
}

export interface Metadata {
  rows: MetadataRow[];
  /** True when the file records where the photo was taken. */
  hasLocation: boolean;
  /** Human-readable coordinates, when present. */
  location: string | null;
}

/** The shape of the exifreader tags this reads — a narrow view of a wide type. */
type Tag = { description?: unknown; value?: unknown } | undefined;
type Tags = Record<string, Tag>;

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
  return trimmed === '' || trimmed === 'Undefined' ? null : trimmed;
}

/**
 * Picks the fields people recognise out of the hundreds a camera may write.
 *
 * The order is deliberate — what the photo is of, then what took it, then when
 * — and anything missing is left out rather than shown blank.
 */
export function summarise(tags: Tags): Metadata {
  const rows: MetadataRow[] = [];
  const add = (label: string, value: string | null) => {
    if (value !== null) {
      rows.push({ label, value });
    }
  };

  const make = text(tags['Make']);
  const model = text(tags['Model']);
  add('Camera', make && model && model.startsWith(make) ? model : [make, model].filter(Boolean).join(' ') || null);
  add('Lens', text(tags['LensModel']));
  add('Taken', text(tags['DateTimeOriginal']) ?? text(tags['DateTime']));
  add('Exposure', text(tags['ExposureTime']));
  add('Aperture', text(tags['FNumber']));
  add('ISO', text(tags['ISOSpeedRatings']));
  add('Focal length', text(tags['FocalLength']));
  add('Orientation', text(tags['Orientation']));
  add('Software', text(tags['Software']));
  add('Artist', text(tags['Artist']));
  add('Copyright', text(tags['Copyright']));

  const latitude = tags['GPSLatitude']?.description;
  const longitude = tags['GPSLongitude']?.description;
  const latRef = text(tags['GPSLatitudeRef']);
  const lonRef = text(tags['GPSLongitudeRef']);
  const hasLocation = latitude !== undefined && longitude !== undefined;
  const location = hasLocation
    ? `${formatCoordinate(latitude, latRef)}, ${formatCoordinate(longitude, lonRef)}`
    : null;
  if (location) {
    rows.push({ label: 'Location', value: location });
  }

  return { rows, hasLocation, location };
}

function formatCoordinate(value: unknown, ref: string | null): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  const rendered = Number.isFinite(numeric) ? numeric.toFixed(5) : String(value);
  // exifreader's ref description is a word ("North latitude"); its first letter
  // is the compass point, which is how coordinates are normally written.
  return ref ? `${rendered}° ${ref.charAt(0).toUpperCase()}` : `${rendered}°`;
}
