/**
 * Verifies a JWT signature in the browser with WebCrypto — no network, no
 * library. Kept free of Angular so it can be unit-tested on its own.
 *
 * Supports the algorithms WebCrypto can verify:
 *   - HS256/384/512  (HMAC)                — key is the shared secret string
 *   - RS256/384/512  (RSASSA-PKCS1-v1_5)   — key is a public-key PEM (SPKI)
 *   - PS256/384/512  (RSA-PSS)             — key is a public-key PEM (SPKI)
 *   - ES256/384/512  (ECDSA)               — key is a public-key PEM (SPKI)
 *
 * The key can also be a JWK, or a whole JWKS document with the key picked out
 * of it by the token's `kid`. That is what an identity provider actually hands
 * you — Auth0, Okta, Cognito, Firebase and every OIDC provider publish a JWKS
 * at a well-known URL, and nobody converts one to PEM by hand. The document is
 * pasted rather than fetched, deliberately: fetching it would mean this page
 * making a request on your behalf, and the whole point of the tool is that it
 * does not.
 */

export type VerifyResult =
  /** `via` explains which key was used, when that was not obvious. */
  | { kind: 'valid'; via?: string }
  | { kind: 'invalid'; via?: string }
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

// --- Picking a key out of a JWKS ------------------------------------------

/** The key type each algorithm family needs, for choosing between keys. */
function ktyFor(alg: string): string | null {
  switch (alg.slice(0, 2)) {
    case 'HS':
      return 'oct';
    case 'RS':
    case 'PS':
      return 'RSA';
    case 'ES':
      return 'EC';
    default:
      return null;
  }
}

/**
 * The members that make a JWK a private key.
 *
 * `oct` is not in this list on purpose: an HMAC key's `k` is the shared secret
 * and is also what verifies with it, so there is no public half to take.
 */
const PRIVATE_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'] as const;

/**
 * A JWK as a provider publishes one.
 *
 * WebCrypto's own `JsonWebKey` has no `kid`, because importing a key never
 * needs one — but choosing between keys is exactly what a `kid` is for.
 */
export interface Jwk extends JsonWebKey {
  kid?: string;
}

export type JwkChoice =
  /** Not JSON, so it is a PEM or a raw secret and this has no opinion. */
  | { kind: 'none' }
  | { kind: 'ok'; jwk: Jwk; via: string; publicHalf: boolean }
  | { kind: 'error'; message: string };

/**
 * The key to verify with, out of whatever JSON was pasted.
 *
 * Takes a single JWK or a whole JWKS. With a set, the token's `kid` chooses;
 * without one, the only key that could verify this algorithm is used, and
 * anything more ambiguous is an error naming the options rather than a guess.
 */
export function chooseJwk(text: string, alg: string, kid: string): JwkChoice {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return { kind: 'none' };

  let parsed: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(trimmed);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error();
    parsed = value as Record<string, unknown>;
  } catch {
    return { kind: 'error', message: 'That starts like a JWK or JWKS but is not a JSON object.' };
  }

  const keys = parsed['keys'];
  const chosen = Array.isArray(keys)
    ? fromSet(keys as Jwk[], alg, kid)
    : { jwk: parsed as Jwk, via: '' };
  if ('message' in chosen) return { kind: 'error', message: chosen.message };
  return check(chosen.jwk, chosen.via, alg);
}

function fromSet(
  keys: Jwk[],
  alg: string,
  kid: string,
): { jwk: Jwk; via: string } | { message: string } {
  if (keys.length === 0) return { message: 'That JWKS has no keys in it.' };

  if (kid) {
    const at = keys.findIndex((key) => key.kid === kid);
    if (at >= 0) return { jwk: keys[at], via: `kid “${kid}”, key ${at + 1} of ${keys.length}` };
    const known = keys.map((key) => key.kid).filter((value): value is string => !!value);
    return {
      message: known.length
        ? `No key in that set has kid “${kid}”. It holds: ${known.join(', ')}.`
        : `The token names kid “${kid}”, but no key in that set has a kid.`,
    };
  }

  const kty = ktyFor(alg);
  const usable = keys.filter(
    (key) => (!kty || key.kty === kty) && (!key.alg || key.alg === alg) && key.use !== 'enc',
  );
  if (usable.length === 1) {
    return {
      jwk: usable[0],
      via: keys.length === 1 ? '' : `the only ${alg} key of ${keys.length}`,
    };
  }
  if (usable.length === 0) return { message: `That set holds no key that can verify ${alg}.` };
  return {
    message:
      `That set holds ${usable.length} keys that could verify ${alg}, and the token has no ` +
      'kid to choose by. Paste the one you mean.',
  };
}

/** Checks a chosen JWK against the algorithm, and takes its public half. */
function check(jwk: Jwk, via: string, alg: string): JwkChoice {
  if (typeof jwk.kty !== 'string') {
    return { kind: 'error', message: 'A JWK needs a kty member saying what kind of key it is.' };
  }
  const kty = ktyFor(alg);
  if (kty && jwk.kty !== kty) {
    return { kind: 'error', message: `${alg} needs a ${kty} key, and that one is ${jwk.kty}.` };
  }
  // Caught here rather than left to WebCrypto, which reports the same mismatch
  // as an unexplained DataError.
  if (jwk.alg && jwk.alg !== alg) {
    return { kind: 'error', message: `That key is for ${jwk.alg}, but the token says ${alg}.` };
  }
  if (jwk.use === 'enc') {
    return { kind: 'error', message: 'That key is marked for encryption, not for signatures.' };
  }

  const publicHalf = jwk.kty !== 'oct' && typeof jwk.d === 'string';
  const usable = { ...jwk } as Jwk & Record<string, unknown>;
  if (publicHalf) {
    for (const member of PRIVATE_MEMBERS) delete usable[member];
  }
  // WebCrypto refuses a key whose declared operations exclude verifying, and a
  // private key's usually do. The usages asked for at import say what it is for.
  delete usable.key_ops;
  delete usable.ext;
  return { kind: 'ok', jwk: usable, via, publicHalf };
}

/** How the key was arrived at, for the reader — empty when there is nothing to say. */
function noteFor(choice: { via: string; publicHalf: boolean }): string | undefined {
  const parts = [choice.via, choice.publicHalf ? 'used its public half' : ''].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

/**
 * Verifies the signature of `token` with `key` — a secret for HS*, a PEM public
 * key for the asymmetric algorithms, or a JWK or JWKS for either.
 * `alg` is the value from the JWT header.
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

  const choice = chooseJwk(key, alg, readKid(headerPart));
  if (choice.kind === 'error') {
    return { kind: 'error', message: choice.message };
  }
  const via = choice.kind === 'ok' ? noteFor(choice) : undefined;

  let keyData: BufferSource | null = null;
  if (choice.kind === 'none') {
    try {
      keyData = (
        spec.keyFormat === 'raw' ? new TextEncoder().encode(key) : pemToDer(key)
      ) as BufferSource;
    } catch (error) {
      return { kind: 'error', message: pemErrorMessage(error) };
    }
  }

  let cryptoKey: CryptoKey;
  try {
    cryptoKey =
      choice.kind === 'ok'
        ? await crypto.subtle.importKey('jwk', choice.jwk, spec.importParams, false, ['verify'])
        : await crypto.subtle.importKey(spec.keyFormat, keyData!, spec.importParams, false, [
            'verify',
          ]);
  } catch {
    return { kind: 'error', message: importErrorMessage(choice.kind === 'ok', spec.keyFormat) };
  }

  try {
    const ok = await crypto.subtle.verify(
      spec.verifyParams,
      cryptoKey,
      signature as BufferSource,
      signingInput as BufferSource,
    );
    return via ? { kind: ok ? 'valid' : 'invalid', via } : { kind: ok ? 'valid' : 'invalid' };
  } catch {
    return { kind: 'error', message: 'Verification failed. Check the key and algorithm.' };
  }
}

/** The token's `kid`, which is how a key is chosen out of a set. */
function readKid(headerPart: string): string {
  try {
    const decoded = new TextDecoder().decode(base64UrlToBytes(headerPart));
    const header = JSON.parse(decoded) as Record<string, unknown>;
    return typeof header['kid'] === 'string' ? header['kid'] : '';
  } catch {
    return '';
  }
}

function importErrorMessage(fromJwk: boolean, keyFormat: 'raw' | 'spki'): string {
  if (fromJwk) return 'That JWK is not a usable key for this algorithm.';
  return keyFormat === 'raw'
    ? 'Could not use that secret.'
    : 'That is not a valid public key for this algorithm.';
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
