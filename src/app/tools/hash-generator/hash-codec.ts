/**
 * The digest work, and the shape the tool exposes over its worker.
 *
 * MD5 and CRC32 are pure JS (`checksums.ts`) and the SHA/HMAC loop, though
 * WebCrypto, still walks the whole input — so on a large file all of it stalls
 * the main thread. `hash.worker.ts` runs this object off-thread; the client
 * calls the very same object inline where no worker is available (prerender, or
 * a browser without module workers), so the two paths cannot drift.
 *
 * Every method is async even where the work is not: it makes the local object
 * and Comlink's proxy of it the same shape, so the client can hold either.
 */
import { crc32Hex, md5Hex } from './checksums';

/** The SHA digests WebCrypto exposes, in ascending strength. */
export const SHA_ALGORITHMS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;

export interface Digest {
  algorithm: string;
  hex: string;
}

export const hashApi = {
  /**
   * Digest `data`, keyed when `key` is non-empty. The input is cloned into the
   * worker rather than transferred, so the caller keeps its copy to re-hash
   * under a different key without re-reading the file.
   */
  async digest(data: Uint8Array, key: string): Promise<Digest[]> {
    return key ? hmacDigests(data, key) : plainDigests(data);
  },
};

export type HashApi = typeof hashApi;

/** Plain, unkeyed checksums: MD5 and CRC32 (in JS) plus the SHA family (native). */
async function plainDigests(data: Uint8Array): Promise<Digest[]> {
  const results: Digest[] = [
    { algorithm: 'CRC32', hex: crc32Hex(data) },
    { algorithm: 'MD5', hex: md5Hex(data) },
  ];
  for (const algorithm of SHA_ALGORITHMS) {
    const buffer = await crypto.subtle.digest(algorithm, data as BufferSource);
    results.push({ algorithm, hex: toHex(buffer) });
  }
  return results;
}

/** Keyed HMAC over the SHA family — the digests WebCrypto can key. */
async function hmacDigests(data: Uint8Array, secret: string): Promise<Digest[]> {
  const keyBytes = new TextEncoder().encode(secret);
  const results: Digest[] = [];
  for (const hash of SHA_ALGORITHMS) {
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes as BufferSource,
      { name: 'HMAC', hash },
      false,
      ['sign'],
    );
    const buffer = await crypto.subtle.sign('HMAC', key, data as BufferSource);
    results.push({ algorithm: `HMAC-${hash}`, hex: toHex(buffer) });
  }
  return results;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
