/**
 * The encryption behind a one-time link.
 *
 * AES-256-GCM, with a key generated in the browser and never sent anywhere. The
 * key rides in the URL fragment, which browsers do not include in a request —
 * not in the path, not in a header, not in the Referer — so the server that
 * stores the ciphertext has no way to obtain it. That is what makes this
 * different from a site that promises not to look.
 *
 * GCM rather than CBC because it authenticates as well as encrypts: a
 * ciphertext that has been altered fails to decrypt rather than producing
 * plausible rubbish.
 */

/** 96 bits, the nonce size AES-GCM is specified for. */
const IV_BYTES = 12;

export interface Sealed {
  ciphertext: string;
  iv: string;
  /** Base64url, for the fragment. Never sent to the server. */
  key: string;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

/** Encrypts under a fresh key, and hands the key back for the fragment. */
export async function seal(text: string): Promise<Sealed> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text),
  );
  const raw = await crypto.subtle.exportKey('raw', key);

  return {
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
    key: toBase64Url(new Uint8Array(raw)),
  };
}

/** Decrypts with a key from a fragment. Throws if the key or the blob is wrong. */
export async function open(ciphertext: string, iv: string, key: string): Promise<string> {
  const imported = await crypto.subtle.importKey(
    'raw',
    fromBase64Url(key) as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) as unknown as BufferSource },
    imported,
    fromBase64(ciphertext) as unknown as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

export interface LinkParts {
  id: string;
  key: string;
}

/**
 * The fragment carries both halves: the id as well as the key.
 *
 * The id alone is useless without the key, so it could sit in the path — but
 * keeping it out of the path keeps it out of server logs, browser history sync
 * and anything that records URLs, which costs nothing and leaks less.
 */
export function buildFragment({ id, key }: LinkParts): string {
  return `${id}.${key}`;
}

export function parseFragment(hash: string): LinkParts | null {
  const match = /^#?([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(hash.trim());
  return match ? { id: match[1], key: match[2] } : null;
}
