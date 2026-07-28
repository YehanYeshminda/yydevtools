/**
 * Generic client for the self-hosted PDF/image services on Fly.io.
 *
 * Every service speaks the same shape: POST the file with a `Bearer <secret>`
 * header, get the processed bytes back (or a `{ error: { code, message } }`
 * JSON body). This module forwards the request and re-classifies failures into
 * codes the route layer understands. It only ever runs inside the Worker — the
 * secrets must never reach the browser. These services are free per call, so
 * nothing here is metered.
 */

export type ServiceErrorCode =
  | 'NOT_CONFIGURED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_REJECTED'
  | 'TIMEOUT'
  | 'TOO_LARGE';

export class ServiceError extends Error {
  constructor(
    readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export interface ServiceEndpoint {
  /** Base URL of the Fly app, e.g. https://yydevtools-pdf-ocr.fly.dev */
  url: string;
  /** Shared secret; sent as `Authorization: Bearer <secret>`. */
  secret: string;
}

/** Builds an endpoint only when both halves are configured, else null. */
export function serviceEndpoint(
  url: string | undefined,
  secret: string | undefined,
): ServiceEndpoint | null {
  return url && secret ? { url, secret } : null;
}

export interface ForwardResult {
  body: ArrayBuffer;
  /** The upstream Content-Type, passed straight through to the browser. */
  contentType: string;
}

/** A cold Fly machine adds a wake-up hop, so allow more than the job needs. */
const DEFAULT_TIMEOUT_MS = 180_000;

/** Sends `input` to `pathname` on the service and returns the processed bytes. */
export async function forwardToService(
  endpoint: ServiceEndpoint,
  pathname: string,
  query: Record<string, string>,
  input: ArrayBuffer,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ForwardResult> {
  const target = new URL(pathname, endpoint.url);
  for (const [key, value] of Object.entries(query)) {
    target.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${endpoint.secret}`,
        'Content-Type': 'application/octet-stream',
      },
      body: input,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ServiceError('TIMEOUT', 'The service took too long and was stopped.');
    }
    throw new ServiceError('UPSTREAM_UNAVAILABLE', 'The service could not be reached.');
  }

  if (response.ok) {
    return {
      body: await response.arrayBuffer(),
      contentType: response.headers.get('Content-Type') ?? 'application/octet-stream',
    };
  }

  throw new ServiceError(classify(response.status), await failureMessage(response));
}

/** Maps an upstream HTTP status onto the code the route layer expects. */
function classify(status: number): ServiceErrorCode {
  if (status === 413) {
    return 'TOO_LARGE';
  }
  if (status === 504) {
    return 'TIMEOUT';
  }
  if (status === 401) {
    // The Worker holds the only secret, so a 401 means it is misconfigured.
    return 'NOT_CONFIGURED';
  }
  if (status >= 500) {
    return 'UPSTREAM_UNAVAILABLE';
  }
  // 400 and friends: the input itself was rejected — retrying will not help.
  return 'UPSTREAM_REJECTED';
}

async function failureMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) {
      return body.error.message;
    }
  } catch {
    // Non-JSON body — fall through to a generic message.
  }
  return 'The service could not process this file.';
}
