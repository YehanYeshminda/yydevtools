/**
 * Storage for one-time secret links.
 *
 * The Worker never sees a secret. The browser generates an AES-GCM key, does
 * the encryption, and sends only the ciphertext and its nonce; the key travels
 * to the recipient in the URL fragment, which browsers never put in a request.
 * So what is stored here is an opaque blob that nothing on this side of the
 * wire — including anyone with the KV namespace — can read.
 *
 * Two consequences worth stating plainly rather than burying:
 *
 *  - Reads burn the entry, but KV is eventually consistent. The delete is
 *    issued the moment a blob is handed out, and in practice the second reader
 *    gets nothing; it is not an atomic compare-and-delete, so two requests
 *    arriving in the same instant at different locations could both succeed.
 *    A Durable Object would close that gap and cost a great deal more.
 *  - Reading is a POST, not a GET. Chat clients, mail scanners and link
 *    previewers fetch URLs they see; a GET would let them burn the secret
 *    before the recipient ever opened it.
 */

/** Just enough of KVNamespace to store a blob, so tests need no binding. */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface SecretEnv {
  SECRETS?: SecretStore;
}

/**
 * How long an unread secret survives. KV expires it on its own, so an
 * abandoned link cleans itself up without anything having to sweep.
 */
export const TTLS: Record<string, number> = {
  '1h': 60 * 60,
  '24h': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
};

export const DEFAULT_TTL = '24h';

/**
 * Ceiling on one blob. Generous for a password or a key and far below KV's own
 * 25 MB limit: this is a tool for a secret, not a file transfer.
 */
export const MAX_CIPHERTEXT = 64 * 1024;

/** AES-GCM nonces are 12 bytes, which is 16 base64 characters. */
const MAX_IV = 32;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function isBase64(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= maxLength && BASE64.test(value)
  );
}

export function parseTtl(value: unknown): number | null {
  if (value === undefined || value === null) {
    return TTLS[DEFAULT_TTL];
  }
  return typeof value === 'string' && value in TTLS ? TTLS[value] : null;
}

/** Ids are 22 URL-safe characters — 128 bits, so they cannot be guessed. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{22}$/.test(value);
}

export type Validated =
  { ok: true; ciphertext: string; iv: string; ttl: number } | { ok: false; message: string };

export function validateCreate(body: unknown): Validated {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, message: 'Expected a JSON object.' };
  }
  const { ciphertext, iv, ttl } = body as Record<string, unknown>;

  if (!isBase64(ciphertext, MAX_CIPHERTEXT)) {
    return {
      ok: false,
      message: `The secret must be base64 and at most ${MAX_CIPHERTEXT} characters.`,
    };
  }
  if (!isBase64(iv, MAX_IV)) {
    return { ok: false, message: 'The nonce is missing or malformed.' };
  }
  const seconds = parseTtl(ttl);
  if (seconds === null) {
    return { ok: false, message: `Expiry must be one of ${Object.keys(TTLS).join(', ')}.` };
  }
  return { ok: true, ciphertext, iv, ttl: seconds };
}

export interface StoredSecret {
  ciphertext: string;
  iv: string;
}

/** Stores one blob and returns its id and when it will expire on its own. */
export async function createSecret(
  store: SecretStore,
  input: { ciphertext: string; iv: string; ttl: number },
  now = Date.now(),
): Promise<{ id: string; expiresAt: number }> {
  const id = newId();
  const value: StoredSecret = { ciphertext: input.ciphertext, iv: input.iv };
  await store.put(id, JSON.stringify(value), { expirationTtl: input.ttl });
  return { id, expiresAt: now + input.ttl * 1000 };
}

/**
 * Hands out a blob and deletes it.
 *
 * The delete is awaited rather than left to run in the background: a caller who
 * has been given the ciphertext should not be able to race a second request in
 * before the entry goes, and the cost is one KV round trip on a rare path.
 */
export async function takeSecret(store: SecretStore, id: string): Promise<StoredSecret | null> {
  const raw = await store.get(id);
  if (raw === null) {
    return null;
  }
  await store.delete(id);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as StoredSecret).ciphertext === 'string' &&
      typeof (parsed as StoredSecret).iv === 'string'
    ) {
      return parsed as StoredSecret;
    }
  } catch {
    // Fall through: a blob we cannot parse is as good as gone, and it has
    // already been deleted, so there is nothing to clean up.
  }
  return null;
}
