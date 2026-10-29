/**
 * UUID generation, formatting and decoding, per RFC 9562.
 *
 * Everything here is pure apart from the random source and the clock, which
 * the v7 generator takes as parameters so its layout can be tested exactly.
 */

export type UuidFormat = 'standard' | 'compact' | 'braces' | 'urn' | 'base64url';

/** The RFC 9562 well-known namespaces for name-based (v3/v5) UUIDs. */
export const NAMESPACES = {
  dns: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  url: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
  oid: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
  x500: '6ba7b814-9dad-11d1-80b4-00c04fd430c8',
} as const;

const HEX = /^[0-9a-f]{32}$/i;
const HYPHENATED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64URL = /^[A-Za-z0-9_-]{22}$/;

/** 100-nanosecond ticks between the Gregorian epoch (1582-10-15) and 1970-01-01. */
const GREGORIAN_OFFSET = 0x01b21dd213814000n;

// --- Bytes and text ---------------------------------------------------------

export function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function toBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(text: string): Uint8Array | null {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==');
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  // 22 characters carry 132 bits; only the encoding of exactly these 16 bytes
  // counts, so a string whose last four spare bits are set is not a UUID.
  return bytes.length === 16 && toBase64url(bytes) === text ? bytes : null;
}

/**
 * Reads a UUID in any of the forms this tool writes: hyphenated, 32 bare hex
 * digits, in braces, as a `urn:uuid:` URN, or as 22 characters of base64url.
 * Case and surrounding whitespace are ignored. Returns null for anything else.
 */
export function parseUuid(input: string): Uint8Array | null {
  let text = input.trim().replace(/^urn:uuid:/i, '');
  if (text.startsWith('{') && text.endsWith('}')) text = text.slice(1, -1).trim();
  if (HYPHENATED.test(text)) return hexToBytes(text.replace(/-/g, ''));
  if (HEX.test(text)) return hexToBytes(text);
  if (BASE64URL.test(text)) return fromBase64url(text);
  return null;
}

export function formatUuid(uuid: string, format: UuidFormat, uppercase: boolean): string {
  if (format === 'base64url') {
    const bytes = parseUuid(uuid);
    return bytes ? toBase64url(bytes) : uuid;
  }
  const hex = uppercase ? uuid.toUpperCase() : uuid.toLowerCase();
  switch (format) {
    case 'compact':
      return hex.replace(/-/g, '');
    case 'braces':
      return `{${hex}}`;
    case 'urn':
      return `urn:uuid:${hex}`;
    default:
      return hex;
  }
}

// --- Generation -------------------------------------------------------------

export function uuidV4(): string {
  return crypto.randomUUID();
}

type Fill = (bytes: Uint8Array) => Uint8Array;
const cryptoFill: Fill = (bytes) => crypto.getRandomValues(bytes);

/**
 * Returns a v7 generator whose output is strictly increasing, even for a
 * batch made inside one millisecond or across a clock step backwards.
 *
 * Layout (RFC 9562 §5.7, monotonicity by §6.2 method 1): 48-bit Unix
 * milliseconds, version 7, a 12-bit counter in `rand_a`, the variant, then 62
 * random bits. The counter starts at a random value below 2048 each new
 * millisecond, so at least 2048 values fit in one; past 4095 the timestamp is
 * advanced by one millisecond rather than letting the order break.
 */
export function createUuidV7Generator(now: () => number = Date.now, fill: Fill = cryptoFill) {
  let lastMs = -1;
  let counter = 0;
  const seed = () => {
    const r = fill(new Uint8Array(2));
    return ((r[0] << 8) | r[1]) & 0x7ff;
  };

  return (): string => {
    const ms = now();
    if (ms > lastMs) {
      lastMs = ms;
      counter = seed();
    } else if (++counter > 0xfff) {
      lastMs++;
      counter = seed();
    }

    const bytes = fill(new Uint8Array(16));
    bytes[0] = (lastMs / 2 ** 40) & 0xff;
    bytes[1] = (lastMs / 2 ** 32) & 0xff;
    bytes[2] = (lastMs / 2 ** 24) & 0xff;
    bytes[3] = (lastMs / 2 ** 16) & 0xff;
    bytes[4] = (lastMs / 2 ** 8) & 0xff;
    bytes[5] = lastMs & 0xff;
    bytes[6] = 0x70 | (counter >> 8);
    bytes[7] = counter & 0xff;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return bytesToUuid(bytes);
  };
}

/**
 * A name-based v5 UUID: SHA-1 of the namespace's 16 bytes followed by the
 * name's UTF-8, cut to 128 bits with the version and variant set. The same
 * namespace and name always give the same UUID.
 */
export async function uuidV5(name: string, namespace: string): Promise<string> {
  const ns = parseUuid(namespace);
  if (!ns) throw new Error('The namespace is not a UUID.');
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(16 + nameBytes.length);
  input.set(ns);
  input.set(nameBytes, 16);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', input));
  const bytes = hash.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

// --- Decoding ---------------------------------------------------------------

export interface UuidField {
  label: string;
  value: string;
}

export interface UuidReport {
  canonical: string;
  /** One line: what kind of UUID this is. */
  summary: string;
  fields: UuidField[];
}

const VERSION_NAMES: Record<number, string> = {
  1: 'Version 1: time-based (Gregorian timestamp, clock sequence, node)',
  2: 'Version 2: DCE Security (rarely used; RFC 9562 leaves its layout to DCE)',
  3: 'Version 3: name-based, MD5 hash',
  4: 'Version 4: random',
  5: 'Version 5: name-based, SHA-1 hash',
  6: 'Version 6: reordered time-based (version 1 fields, sortable)',
  7: 'Version 7: Unix time-ordered',
  8: 'Version 8: custom, vendor-specific layout',
};

function variantOf(byte: number): string {
  if ((byte & 0x80) === 0) return 'NCS (reserved, pre-1990 Apollo layout)';
  if ((byte & 0xc0) === 0x80) return 'RFC 9562 (the standard layout)';
  if ((byte & 0xe0) === 0xc0) return 'Microsoft (reserved, old COM GUIDs)';
  return 'Reserved for future definition';
}

/** Formats 100-ns ticks since 1970 as ISO 8601 with all seven fraction digits. */
function ticksToIso(ticks: bigint): string {
  const ms = ticks / 10000n;
  const rest = (ticks % 10000n).toString().padStart(4, '0');
  return new Date(Number(ms)).toISOString().replace('Z', `${rest}Z`);
}

function hexOf(bytes: Uint8Array, from: number, to: number): string {
  return Array.from(bytes.slice(from, to), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Reads a parsed UUID: version, variant and whatever its version embeds. */
export function describeUuid(bytes: Uint8Array): UuidReport {
  const canonical = bytesToUuid(bytes);
  const base: UuidField[] = [
    { label: 'Standard form', value: canonical },
    { label: 'Base64url', value: toBase64url(bytes) },
  ];

  if (bytes.every((b) => b === 0)) {
    return {
      canonical,
      summary: 'The nil UUID: all 128 bits zero. A placeholder meaning "no value", never an id.',
      fields: base,
    };
  }
  if (bytes.every((b) => b === 0xff)) {
    return {
      canonical,
      summary: 'The max UUID: all 128 bits one. RFC 9562 defines it as a sentinel, like nil.',
      fields: base,
    };
  }

  const variant = variantOf(bytes[8]);
  const fields = [...base, { label: 'Variant', value: variant }];
  if ((bytes[8] & 0xc0) !== 0x80) {
    return {
      canonical,
      summary: 'Not an RFC 9562 UUID: its variant bits say another layout, so it has no version.',
      fields,
    };
  }

  const version = bytes[6] >> 4;
  fields.push({ label: 'Version', value: String(version) });
  const summary =
    VERSION_NAMES[version] ??
    `Version ${version} is not defined, so this value is not a valid UUID.`;

  if (version === 1 || version === 6) {
    const timeHi = BigInt(((bytes[6] & 0x0f) << 8) | bytes[7]);
    const first = BigInt(parseInt(hexOf(bytes, 0, 4), 16));
    const mid = BigInt((bytes[4] << 8) | bytes[5]);
    const ticks =
      version === 1
        ? (timeHi << 48n) | (mid << 32n) | first
        : (first << 28n) | (mid << 12n) | timeHi;
    const node = hexOf(bytes, 10, 16).replace(/(..)(?!$)/g, '$1:');
    fields.push(
      { label: 'Timestamp (UTC)', value: ticksToIso(ticks - GREGORIAN_OFFSET) },
      { label: 'Clock sequence', value: String(((bytes[8] & 0x3f) << 8) | bytes[9]) },
      {
        label: 'Node',
        value:
          bytes[10] & 0x01
            ? `${node} (multicast bit set: a random node, not a network card)`
            : `${node} (may be the MAC address of the machine that made it)`,
      },
    );
  } else if (version === 7) {
    const ms = parseInt(hexOf(bytes, 0, 6), 16);
    fields.push(
      { label: 'Timestamp (UTC)', value: new Date(ms).toISOString() },
      { label: 'Unix milliseconds', value: String(ms) },
    );
  } else if (version === 4) {
    fields.push({ label: 'Random bits', value: '122 (no time, machine or counter inside)' });
  } else if (version === 3 || version === 5) {
    fields.push({
      label: 'Contents',
      value: 'A hash of a namespace and a name. It cannot be reversed to recover the name.',
    });
  }

  return { canonical, summary, fields };
}
