/**
 * Minimal client for the Adobe PDF Services REST API.
 *
 * This module only ever runs inside the Worker — the client secret must never
 * reach the browser. The flow for every operation is the same:
 *
 *   token -> create asset -> upload bytes -> start operation -> poll -> download
 */

const API_BASE = 'https://pdf-services.adobe.io';
const TOKEN_URL = `${API_BASE}/token`;

/** Stop polling after this long; Adobe jobs that slow have effectively failed. */
const POLL_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;

/** Refresh a little early so a token cannot expire mid-flight. */
const TOKEN_SKEW_MS = 60_000;

export type AdobeErrorCode =
  | 'NOT_CONFIGURED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_REJECTED'
  | 'TIMEOUT';

/** Errors carry a code so the route layer can decide whether to fall back. */
export class AdobeError extends Error {
  constructor(
    readonly code: AdobeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AdobeError';
  }
}

export interface AdobeCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Cached per isolate. Adobe tokens last ~24h, so this saves a round trip on
 * almost every request without needing shared storage.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(creds: AdobeCredentials, now: number): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_SKEW_MS > now) {
    return cachedToken.value;
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });

  if (!response.ok) {
    // A rejected token request is almost always bad or revoked credentials.
    throw new AdobeError(
      response.status === 400 || response.status === 401 ? 'NOT_CONFIGURED' : 'UPSTREAM_UNAVAILABLE',
      `Adobe token request failed (${response.status}).`,
    );
  }

  const body = (await response.json()) as { access_token?: string; expires_in?: number | string };
  if (!body.access_token) {
    throw new AdobeError('UPSTREAM_UNAVAILABLE', 'Adobe token response had no access_token.');
  }

  // Adobe returns this as a *string* of *milliseconds* (e.g. "86400000"), not
  // the seconds-as-number the OAuth spec implies. Coerce explicitly — leaving it
  // as a string made `now + lifetime` concatenate instead of add, which pinned
  // the expiry far into the future and stopped the token ever refreshing.
  const raw = Number(body.expires_in);
  const lifetimeMs = !Number.isFinite(raw) || raw <= 0 ? 86_400_000 : raw > 1_000_000 ? raw : raw * 1000;

  cachedToken = { value: body.access_token, expiresAt: now + lifetimeMs };
  return body.access_token;
}

/** Drop the cached token so the next call re-authenticates. */
function invalidateToken(): void {
  cachedToken = null;
}

function authHeaders(creds: AdobeCredentials, token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'x-api-key': creds.clientId,
  };
}

/** Uploads bytes and returns the assetID Adobe uses to refer to them. */
async function uploadAsset(
  creds: AdobeCredentials,
  token: string,
  bytes: ArrayBuffer,
  mediaType: string,
): Promise<string> {
  const created = await fetch(`${API_BASE}/assets`, {
    method: 'POST',
    headers: { ...authHeaders(creds, token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaType }),
  });

  if (!created.ok) {
    throw new AdobeError('UPSTREAM_REJECTED', `Could not create an asset (${created.status}).`);
  }

  const { uploadUri, assetID } = (await created.json()) as {
    uploadUri?: string;
    assetID?: string;
  };
  if (!uploadUri || !assetID) {
    throw new AdobeError('UPSTREAM_UNAVAILABLE', 'Adobe asset response was incomplete.');
  }

  // The upload URI is presigned — it takes the bytes directly, with no auth header.
  const uploaded = await fetch(uploadUri, {
    method: 'PUT',
    headers: { 'Content-Type': mediaType },
    body: bytes,
  });
  if (!uploaded.ok) {
    throw new AdobeError('UPSTREAM_REJECTED', `Upload failed (${uploaded.status}).`);
  }

  return assetID;
}

/** Polls the job location until it finishes, then returns the result bytes. */
async function awaitResult(
  creds: AdobeCredentials,
  token: string,
  location: string,
  deadline: number,
  sleep: (ms: number) => Promise<void>,
  clock: () => number,
): Promise<ArrayBuffer> {
  for (;;) {
    if (clock() > deadline) {
      throw new AdobeError('TIMEOUT', 'Adobe did not finish this job in time.');
    }

    const polled = await fetch(location, { headers: authHeaders(creds, token) });
    if (!polled.ok) {
      throw new AdobeError('UPSTREAM_REJECTED', `Job status check failed (${polled.status}).`);
    }

    const body = (await polled.json()) as {
      status?: string;
      asset?: { downloadUri?: string };
      error?: { message?: string };
    };
    const status = (body.status ?? '').toLowerCase();

    if (status === 'done') {
      const downloadUri = body.asset?.downloadUri;
      if (!downloadUri) {
        throw new AdobeError('UPSTREAM_UNAVAILABLE', 'Adobe reported done with no result asset.');
      }
      const downloaded = await fetch(downloadUri);
      if (!downloaded.ok) {
        throw new AdobeError('UPSTREAM_REJECTED', `Result download failed (${downloaded.status}).`);
      }
      return downloaded.arrayBuffer();
    }

    if (status === 'failed') {
      throw new AdobeError(
        'UPSTREAM_REJECTED',
        body.error?.message ?? 'Adobe could not process this document.',
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

export interface RunOptions {
  /** Adobe operation path, e.g. `operation/exportpdf`. */
  operation: string;
  /** Extra body fields merged alongside `assetID`. */
  params: Record<string, unknown>;
  input: ArrayBuffer;
  inputMediaType: string;
}

/**
 * Runs one PDF Services operation end to end and returns the resulting bytes.
 *
 * Counts as a single Adobe document transaction, so callers must reserve quota
 * before invoking this.
 */
export async function runOperation(
  creds: AdobeCredentials,
  options: RunOptions,
  deps: {
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<ArrayBuffer> {
  const clock = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  if (!creds.clientId || !creds.clientSecret) {
    throw new AdobeError('NOT_CONFIGURED', 'Adobe PDF Services credentials are not set.');
  }

  const deadline = clock() + POLL_TIMEOUT_MS;
  let token = await getAccessToken(creds, clock());

  const start = async (bearer: string) => {
    const assetID = await uploadAsset(creds, bearer, options.input, options.inputMediaType);
    return fetch(`${API_BASE}/${options.operation}`, {
      method: 'POST',
      headers: { ...authHeaders(creds, bearer), 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetID, ...options.params }),
    });
  };

  let started = await start(token);

  // A cached token can be revoked out from under us; retry once with a fresh one.
  if (started.status === 401) {
    invalidateToken();
    token = await getAccessToken(creds, clock());
    started = await start(token);
  }

  if (started.status === 429) {
    throw new AdobeError('UPSTREAM_REJECTED', 'Adobe rate-limited or quota-exhausted this account.');
  }
  if (!started.ok && started.status !== 201) {
    throw new AdobeError('UPSTREAM_REJECTED', `Adobe rejected the job (${started.status}).`);
  }

  const location = started.headers.get('location');
  if (!location) {
    throw new AdobeError('UPSTREAM_UNAVAILABLE', 'Adobe did not return a job location.');
  }

  return awaitResult(creds, token, location, deadline, sleep, clock);
}
