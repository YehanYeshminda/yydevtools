/**
 * Signs a JWT in the browser with WebCrypto — no network, no library. The
 * signing counterpart of {@link ./jwt-decoder/jwt-verify}: it re-encodes an
 * edited header and payload and produces a fresh, valid signature, so a token
 * whose claims were changed is genuine again against the matching key.
 *
 * Kept free of Angular so it can be unit-tested on its own.
 *
 * Supports the algorithms WebCrypto can sign:
 *   - HS256/384/512  (HMAC)                — key is the shared secret string
 *   - RS256/384/512  (RSASSA-PKCS1-v1_5)   — key is a PKCS#8 private-key PEM
 *   - PS256/384/512  (RSA-PSS)             — key is a PKCS#8 private-key PEM
 *   - ES256/384/512  (ECDSA)               — key is a PKCS#8 private-key PEM
 *
 * A signature can only be produced with the signing key, so this cannot forge a
 * token for a key you do not hold — it re-signs with the key you provide.
 */

export type SignResult =
  | { kind: 'ok'; token: string }
  | { kind: 'unsigned'; token: string }
  | { kind: 'invalid-json'; where: 'header' | 'payload'; message: string }
  | { kind: 'missing-alg' }
  | { kind: 'unsupported'; alg: string }
  | { kind: 'error'; message: string };

interface SignSpec {
  importParams: RsaHashedImportParams | EcKeyImportParams | HmacImportParams;
  signParams: AlgorithmIdentifier | RsaPssParams | EcdsaParams;
  /** 'raw' for the HMAC secret, 'pkcs8' for a private key PEM. */
  keyFormat: 'raw' | 'pkcs8';
}

const SHA: Record<string, string> = { '256': 'SHA-256', '384': 'SHA-384', '512': 'SHA-512' };
const SALT: Record<string, number> = { '256': 32, '384': 48, '512': 64 };

/** Maps a JWT `alg` header to the WebCrypto parameters needed to sign with it. */
function signSpecFor(alg: string): SignSpec | null {
  const bits = alg.slice(2);
  const hash = SHA[bits];
  if (!hash) return null;

  switch (alg.slice(0, 2)) {
    case 'HS':
      return {
        keyFormat: 'raw',
        importParams: { name: 'HMAC', hash },
        signParams: { name: 'HMAC' },
      };
    case 'RS':
      return {
        keyFormat: 'pkcs8',
        importParams: { name: 'RSASSA-PKCS1-v1_5', hash },
        signParams: { name: 'RSASSA-PKCS1-v1_5' },
      };
    case 'PS':
      return {
        keyFormat: 'pkcs8',
        importParams: { name: 'RSA-PSS', hash },
        signParams: { name: 'RSA-PSS', saltLength: SALT[bits] },
      };
    case 'ES': {
      // ES512 uses curve P-521, not P-512. WebCrypto's ECDSA signature is the
      // fixed-size r‖s concatenation JWS wants — no DER unwrapping needed.
      const curve = bits === '512' ? 'P-521' : `P-${bits}`;
      return {
        keyFormat: 'pkcs8',
        importParams: { name: 'ECDSA', namedCurve: curve },
        signParams: { name: 'ECDSA', hash },
      };
    }
    default:
      return null;
  }
}

/**
 * Re-encodes `headerJson` and `payloadJson` (both must be JSON objects) and
 * signs them with `key` — the shared secret for HS*, or a PKCS#8 private-key PEM
 * for the asymmetric families. The `alg` is read from the header, so editing it
 * chooses the algorithm. Returns the compact `header.payload.signature` token.
 */
export async function signJwt(
  headerJson: string,
  payloadJson: string,
  key: string,
): Promise<SignResult> {
  const header = parseObject(headerJson);
  if (!header.ok) {
    return { kind: 'invalid-json', where: 'header', message: header.message };
  }
  const payload = parseObject(payloadJson);
  if (!payload.ok) {
    return { kind: 'invalid-json', where: 'payload', message: payload.message };
  }

  const alg = header.value['alg'];
  if (typeof alg !== 'string' || alg === '') {
    return { kind: 'missing-alg' };
  }

  // Re-encode the (possibly edited) header and payload. This is exactly what a
  // verifier recomputes from the token it receives.
  const headerB64 = base64UrlFromString(JSON.stringify(header.value));
  const payloadB64 = base64UrlFromString(JSON.stringify(payload.value));
  const signingInput = `${headerB64}.${payloadB64}`;

  // The "none" algorithm (RFC 7519 §6) is an *unsecured* JWT: an empty
  // signature and no key at all. A correct verifier rejects it; emitting one is
  // for testing whether a server is wrongly configured to accept it. Any casing
  // counts as none, but the header keeps exactly what was typed — casing
  // bypasses (None, NONE) are part of what such a test probes.
  if (alg.toLowerCase() === 'none') {
    return { kind: 'unsigned', token: `${signingInput}.` };
  }

  const spec = signSpecFor(alg);
  if (!spec) {
    return { kind: 'unsupported', alg };
  }

  let keyData: BufferSource;
  try {
    keyData = (spec.keyFormat === 'raw'
      ? new TextEncoder().encode(key)
      : pemToDer(key)) as BufferSource;
  } catch (error) {
    return { kind: 'error', message: pemErrorMessage(error) };
  }

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(spec.keyFormat, keyData, spec.importParams, false, [
      'sign',
    ]);
  } catch {
    return {
      kind: 'error',
      message:
        spec.keyFormat === 'raw'
          ? 'Could not use that secret.'
          : 'That is not a valid PKCS#8 private key for this algorithm.',
    };
  }

  try {
    const signature = await crypto.subtle.sign(
      spec.signParams,
      cryptoKey,
      new TextEncoder().encode(signingInput) as BufferSource,
    );
    return { kind: 'ok', token: `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}` };
  } catch {
    return { kind: 'error', message: 'Signing failed. Check the key and algorithm.' };
  }
}

type ParseResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string };

/** Parse a string as a JSON object, rejecting arrays, primitives and null. */
function parseObject(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Invalid JSON.' };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, message: 'Must be a JSON object.' };
  }
  return { ok: true, value: value as Record<string, unknown> };
}

/** Encode a UTF-8 string as base64url (no padding). */
function base64UrlFromString(text: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(text));
}

/** Encode raw bytes as base64url (no padding). */
function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Extract the DER bytes from a PKCS#8 PEM private-key block. Throws on bad input. */
function pemToDer(pem: string): Uint8Array {
  // WebCrypto only imports unencrypted PKCS#8 ("BEGIN PRIVATE KEY"). SEC1 and
  // PKCS#1 blocks are a common mistake, so name the fix rather than failing opaquely.
  if (/-----BEGIN (?:RSA|EC) PRIVATE KEY-----/.test(pem)) {
    throw new Error('legacy');
  }
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  if (body === '') {
    throw new Error('empty');
  }
  const binary = atob(body);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function pemErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'legacy') {
    return 'That is a legacy key. Convert it to PKCS#8: openssl pkcs8 -topk8 -nocrypt -in key.pem.';
  }
  if (error instanceof Error && error.message === 'empty') {
    return 'Paste a PKCS#8 private key (-----BEGIN PRIVATE KEY-----).';
  }
  return 'That does not look like a base64 PEM key.';
}
