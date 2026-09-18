/**
 * Reading a token: what it says, and what is worrying about it.
 *
 * Kept free of Angular, like `jwt-verify.ts` beside it, so all of this can be
 * unit-tested directly. Nothing here touches the network or the signature —
 * every answer comes from the token's own bytes, which is what lets the page
 * keep its promise that a pasted token stays on the device.
 */

/** Registered time claims, in the order they are worth reading. */
const TIME_CLAIMS: readonly { key: string; label: string }[] = [
  { key: 'iat', label: 'Issued at' },
  { key: 'nbf', label: 'Not valid before' },
  { key: 'exp', label: 'Expires at' },
];

/** Registered non-time claims, shown next. */
const TEXT_CLAIMS: readonly { key: string; label: string }[] = [
  { key: 'iss', label: 'Issuer' },
  { key: 'sub', label: 'Subject' },
  { key: 'aud', label: 'Audience' },
  { key: 'jti', label: 'JWT ID' },
];

/**
 * Claims outside the registered set that a person still reads as a phrase.
 *
 * Everything else keeps its own name. These are the ones that turn up in real
 * tokens from the identity providers people actually use — an OIDC ID token or
 * an OAuth access token is mostly these, and "azp" means nothing to anyone
 * reading it for the first time.
 */
const KNOWN_LABELS: Record<string, string> = {
  acr: 'Authentication context',
  act: 'Acting as',
  amr: 'Authentication methods',
  at_hash: 'Access-token hash',
  auth_time: 'Authenticated at',
  azp: 'Authorized party',
  c_hash: 'Code hash',
  client_id: 'Client ID',
  cnf: 'Confirmation key',
  email: 'Email',
  email_verified: 'Email verified',
  family_name: 'Last name',
  given_name: 'First name',
  groups: 'Groups',
  name: 'Name',
  nonce: 'Nonce',
  permissions: 'Permissions',
  preferred_username: 'Username',
  role: 'Role',
  roles: 'Roles',
  scope: 'Scope',
  scp: 'Scope',
  sid: 'Session ID',
  tid: 'Tenant',
  updated_at: 'Profile updated at',
};

/** Custom claims that carry a Unix timestamp, so they get a date as well. */
const TIME_LIKE = new Set(['auth_time', 'updated_at']);

export interface Claim {
  key: string;
  /** Empty when the claim has no friendlier name than its own key. */
  label: string;
  value: string;
  /** For a time claim: the date it names, and how long ago or away that is. */
  detail?: string;
  relative?: string;
  /** Set when this claim is the reason the token is not usable right now. */
  state?: 'warn';
  /** False for the registered claims, so the table can group them. */
  custom: boolean;
}

/**
 * Every claim in the payload, registered ones first.
 *
 * The registered set is not the interesting part of a real token — `scope`,
 * `roles` and `permissions` are what people came to read — so anything not
 * recognised is listed too rather than being left to the raw JSON below.
 */
export function buildClaims(
  payload: Record<string, unknown>,
  nowSeconds: number,
  utc: boolean,
): Claim[] {
  const claims: Claim[] = [];
  const shown = new Set<string>();

  for (const { key, label } of TIME_CLAIMS) {
    const value = payload[key];
    if (typeof value !== 'number') continue;
    shown.add(key);
    const late = key === 'exp' && value < nowSeconds;
    const early = key === 'nbf' && value > nowSeconds;
    claims.push({
      key,
      label,
      value: String(value),
      detail: formatMoment(value, utc),
      relative: relativeTime(value, nowSeconds),
      state: late || early ? 'warn' : undefined,
      custom: false,
    });
  }

  for (const { key, label } of TEXT_CLAIMS) {
    const value = payload[key];
    if (value === undefined) continue;
    shown.add(key);
    claims.push({ key, label, value: display(value), custom: false });
  }

  for (const [key, value] of Object.entries(payload)) {
    if (shown.has(key)) continue;
    const timely = TIME_LIKE.has(key) && typeof value === 'number';
    claims.push({
      key,
      label: KNOWN_LABELS[key] ?? '',
      value: display(value),
      detail: timely ? formatMoment(value as number, utc) : undefined,
      relative: timely ? relativeTime(value as number, nowSeconds) : undefined,
      custom: true,
    });
  }

  return claims;
}

/** A claim value as one line of text, whatever shape it arrived in. */
function display(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return value.map(display).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** A Unix timestamp as a date, in the reader's own zone or in UTC. */
export function formatMoment(seconds: number, utc: boolean): string {
  const at = new Date(seconds * 1000);
  if (Number.isNaN(at.getTime())) return 'not a valid date';
  return utc
    ? at
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d{3}Z$/, ' UTC')
    : at.toLocaleString();
}

/**
 * Units for the relative phrasing, largest first.
 *
 * No week: "10 days ago" says more than "1 week ago", and a month reads better
 * than "5 weeks". Months and years are the usual approximations — this is a
 * phrase to orient by, and the exact timestamp is on the same row.
 */
const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

/**
 * How far a timestamp is from now, in words.
 *
 * The single most common reason to open a JWT decoder is to find out whether
 * the thing has expired, and a Unix timestamp answers that for nobody.
 */
export function relativeTime(seconds: number, nowSeconds: number): string {
  if (!Number.isFinite(seconds)) return '';
  const delta = seconds - nowSeconds;
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(delta) >= size) return format.format(Math.round(delta / size), unit);
  }
  return format.format(Math.round(delta), 'second');
}

/** A length of time in words, for describing how long a token lives. */
function duration(seconds: number): string {
  for (const [unit, size] of UNITS) {
    if (seconds >= size) {
      const count = Math.round(seconds / size);
      return `${count} ${unit}${count === 1 ? '' : 's'}`;
    }
  }
  return `${Math.max(0, Math.round(seconds))} seconds`;
}

export interface Finding {
  /** Stable, so the template can track it and a test can name one. */
  id: string;
  level: 'danger' | 'warn' | 'info';
  title: string;
  detail: string;
}

const ORDER: Record<Finding['level'], number> = { danger: 0, warn: 1, info: 2 };

/**
 * Payload keys that should never have been put in a token.
 *
 * A JWT payload is signed, not encrypted — base64url and nothing more — so
 * anything in here is readable by everyone who holds the token, including the
 * browser it was sent to. Deliberately a short, specific list: a check that
 * cries wolf on `token_type` teaches people to ignore it.
 */
const SENSITIVE =
  /^(pass(word|wd)?|pwd|secret|client_secret|api[-_]?key|apikey|private[-_]?key|ssn|social_security(_number)?|credit_card|card_number|cvv|refresh_token)$/i;

/** Every sensitive-looking key anywhere in the payload, nesting included. */
function sensitiveKeys(value: unknown, depth = 0, found: string[] = []): string[] {
  if (depth > 4 || value === null || typeof value !== 'object') return found;
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE.test(key) && !found.includes(key)) found.push(key);
    sensitiveKeys(inner, depth + 1, found);
  }
  return found;
}

/** How much a token can grow before it stops fitting where tokens are kept. */
const COOKIE_LIMIT = 4096;
const HEADER_LIMIT = 8192;

/** A year, which is the point at which a bearer token stops being short-lived. */
const LONG_LIFE = 365 * 86_400;

/** Allowance for a clock that is merely wrong rather than lying. */
const SKEW = 60;

export interface InspectInput {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  /** The whole compact token, for the size checks. */
  token: string;
  /** Whatever is in the verification key box, which can itself be a mistake. */
  key: string;
  nowSeconds: number;
}

/**
 * What is worth knowing about a token before trusting it.
 *
 * All of this is decidable from the token alone — no key, no network, no
 * signature check. It is the part a decoder can answer that reading the JSON
 * cannot: expiry that never comes, an algorithm that signs nothing, a payload
 * carrying something that should not be readable.
 */
export function inspect({ header, payload, token, key, nowSeconds }: InspectInput): Finding[] {
  const found: Finding[] = [];
  const alg = typeof header['alg'] === 'string' ? header['alg'] : '';

  if (alg.toLowerCase() === 'none') {
    found.push({
      id: 'alg-none',
      level: 'danger',
      title: 'This token is not signed',
      detail:
        'The alg header is "none", so there is no signature to check. Anyone holding this token can change any claim in it and it will still look valid. A server that accepts alg "none" accepts forgeries.',
    });
  }

  for (const name of ['jku', 'x5u'] as const) {
    if (typeof header[name] !== 'string') continue;
    found.push({
      id: `header-${name}`,
      level: 'danger',
      title: `The header points at a remote key (${name})`,
      detail: `${name} tells the verifier to fetch the signing key from a URL in the token itself. Unless that URL is checked against an allow-list, whoever sends the token chooses the key it is verified against — which means they can sign their own.`,
    });
  }

  if (alg.startsWith('HS') && /-----BEGIN/.test(key)) {
    found.push({
      id: 'key-confusion',
      level: 'danger',
      title: 'HMAC algorithm with a public key in the key box',
      detail:
        'This is the RS256-to-HS256 confusion attack: a token is re-signed with HS256 using the public key as the shared secret, and a verifier that trusts the header’s alg will accept it. If this token came from a service that issues RS256, treat it as hostile.',
    });
  }

  const leaked = sensitiveKeys(payload);
  if (leaked.length > 0) {
    found.push({
      id: 'sensitive-claims',
      level: 'danger',
      title: `The payload carries ${leaked.join(', ')}`,
      detail:
        'A JWT payload is signed, not encrypted. Everyone who holds this token can read those values, including the browser it was sent to and anything that logged the request.',
    });
  }

  const exp = payload['exp'];
  const iat = payload['iat'];
  if (typeof exp !== 'number') {
    found.push({
      id: 'no-expiry',
      level: 'warn',
      title: 'No expiry',
      detail:
        'There is no exp claim, so this token never stops being valid on its own. Once it leaks, it stays useful until whatever issued it is revoked or its key is rotated.',
    });
  } else {
    const life = exp - (typeof iat === 'number' ? iat : nowSeconds);
    if (life > LONG_LIFE) {
      found.push({
        id: 'long-lived',
        level: 'warn',
        title: `Valid for ${duration(life)}`,
        detail:
          'A bearer token is usable by anyone who has it, so its lifetime is how long a leak stays dangerous. Long-lived tokens are normally a sign that a refresh flow was meant to be here instead.',
      });
    }
  }

  if (typeof iat === 'number' && iat > nowSeconds + SKEW) {
    found.push({
      id: 'issued-ahead',
      level: 'warn',
      title: 'Issued in the future',
      detail: `The iat claim is ${relativeTime(iat, nowSeconds)}. Usually a clock out of step between the issuer and this machine, but it is also what a hand-edited token looks like.`,
    });
  }

  if (payload['aud'] === undefined) {
    found.push({
      id: 'no-audience',
      level: 'info',
      title: 'No audience',
      detail:
        'Without an aud claim, nothing in the token says which service it was meant for, so any service sharing the signing key will accept it. That is what makes a token issued for one API usable against another.',
    });
  }

  if (token.length > HEADER_LIMIT) {
    found.push({
      id: 'oversized',
      level: 'warn',
      title: `${token.length} characters long`,
      detail: `Past about ${HEADER_LIMIT} characters a token stops fitting in a default request-header buffer, and the request is rejected before the application sees it.`,
    });
  } else if (token.length > COOKIE_LIMIT) {
    found.push({
      id: 'large',
      level: 'info',
      title: `${token.length} characters long`,
      detail: `A single cookie holds about ${COOKIE_LIMIT} characters, so this one no longer fits in one. It still fits in an Authorization header.`,
    });
  }

  return found.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

/**
 * A JWS or JWE in compact form: segments of base64url, starting `eyJ`.
 *
 * The `eyJ` is not a guess — a JWT header is a JSON object, so its first two
 * bytes are always `{"`, which base64url-encodes to that prefix. Anchoring on
 * it is what makes finding a token inside a wall of text reliable instead of
 * matching every dotted word in the paste.
 */
const SHAPE = /eyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]*){2,4}/;
const WHOLE = new RegExp(`^${SHAPE.source}$`);

/**
 * The token inside whatever was pasted.
 *
 * People paste what they copied, which is rarely a bare token: an
 * `Authorization: Bearer …` header, a quoted string out of a JSON response, a
 * curl command, a cookie, or a token wrapped across several lines by the
 * terminal it came from. Each of those used to produce "a JWT has three parts;
 * this one has 1", which is true and useless.
 *
 * Returns the input unchanged when nothing token-shaped is in it, so a genuinely
 * malformed token still reaches the decoder and gets a real error.
 */
export function extractToken(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  // A token wrapped across lines is still one token, so try it whole first.
  const compact = trimmed.replace(/\s+/g, '');
  if (WHOLE.test(compact)) return compact;
  return SHAPE.exec(trimmed)?.[0] ?? trimmed;
}
