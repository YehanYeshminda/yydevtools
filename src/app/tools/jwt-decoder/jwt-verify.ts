/**
 * Verifies a JWT signature in the browser with WebCrypto — no network, no
 * library. Kept free of Angular so it can be unit-tested on its own.
 *
 * Supports the algorithms WebCrypto can verify:
 *   - HS256/384/512  (HMAC)                — key is the shared secret string
 *   - RS256/384/512  (RSASSA-PKCS1-v1_5)   — key is a public-key PEM (SPKI)
 *   - PS256/384/512  (RSA-PSS)             — key is a public-key PEM (SPKI)
 *   - ES256/384/512  (ECDSA)               — key is a public-key PEM (SPKI)
 */

export type VerifyResult =
  | { kind: 'valid' }
  | { kind: 'invalid' }
  | { kind: 'unsupported'; alg: string }
  | { kind: 'error'; message: string };

interface AlgSpec {
  importParams: RsaHashedImportParams | EcKeyImportParams | HmacImportParams;
  verifyParams: AlgorithmIdentifier | RsaPssParams | EcdsaParams;
  /** 'raw' for the HMAC secret, 'spki' for a public key PEM. */
  keyFormat: 'raw' | 'spki';
}

const SHA: Record<string, string> = { '256': 'SHA-256', '384': 'SHA-384', '512': 'SHA-512' };
const SALT: Record<string, number> = { '256': 32, '384': 48, '512': 64 };

/** Maps a JWT `alg` header to the WebCrypto parameters needed to verify it. */
function specFor(alg: string): AlgSpec | null {
  const bits = alg.slice(2);
  const hash = SHA[bits];
  if (!hash) return null;

  switch (alg.slice(0, 2)) {
    case 'HS':
      return {
        keyFormat: 'raw',
        importParams: { name: 'HMAC', hash },
        verifyParams: { name: 'HMAC' },
      };
    case 'RS':
      return {
        keyFormat: 'spki',
        importParams: { name: 'RSASSA-PKCS1-v1_5', hash },
        verifyParams: { name: 'RSASSA-PKCS1-v1_5' },
      };
    case 'PS':
      return {
        keyFormat: 'spki',
        importParams: { name: 'RSA-PSS', hash },
        verifyParams: { name: 'RSA-PSS', saltLength: SALT[bits] },
      };
    case 'ES': {
      // ES512 uses curve P-521, not P-512.
      const curve = bits === '512' ? 'P-521' : `P-${bits}`;
      return {
        keyFormat: 'spki',
        importParams: { name: 'ECDSA', namedCurve: curve },
        verifyParams: { name: 'ECDSA', hash },
      };
    }
    default:
      return null;
  }
}

/**
 * Verifies the signature of `token` with `key` (a secret for HS*, a PEM public
 * key for the asymmetric algorithms). `alg` is the value from the JWT header.
 */
export async function verifyJwt(token: string, alg: string, key: string): Promise<VerifyResult> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { kind: 'error', message: 'A JWT must have three parts.' };
  }
  const spec = specFor(alg);
  if (!spec) {
    return { kind: 'unsupported', alg };
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const signingInput = new TextEncoder().encode(`${headerPart}.${payloadPart}`);

  let signature: Uint8Array;
  try {
    signature = base64UrlToBytes(signaturePart);
  } catch {
    return { kind: 'error', message: 'The signature is not valid base64url.' };
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
    cryptoKey = await crypto.subtle.importKey(
      spec.keyFormat,
      keyData,
      spec.importParams,
      false,
      ['verify'],
    );
  } catch {
    return {
      kind: 'error',
      message:
        spec.keyFormat === 'raw'
          ? 'Could not use that secret.'
          : 'That is not a valid public key for this algorithm.',
    };
  }

  try {
    const ok = await crypto.subtle.verify(
      spec.verifyParams,
      cryptoKey,
      signature as BufferSource,
      signingInput as BufferSource,
    );
    return { kind: ok ? 'valid' : 'invalid' };
  } catch {
    return { kind: 'error', message: 'Verification failed. Check the key and algorithm.' };
  }
}

/** Decode a base64url segment to raw bytes. Throws on malformed input. */
function base64UrlToBytes(segment: string): Uint8Array {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Extract the DER bytes from a PEM public key block. */
function pemToDer(pem: string): Uint8Array {
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
  return error instanceof Error && error.message === 'empty'
    ? 'Paste a PEM public key (-----BEGIN PUBLIC KEY-----).'
    : 'That does not look like a base64 PEM key.';
}
