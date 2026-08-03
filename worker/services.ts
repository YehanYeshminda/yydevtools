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
  /** Selected `X-*` headers the service reported, for the route to pass on. */
  meta: Record<string, string>;
}

/**
 * A cold Fly machine adds a wake-up hop, so allow more than the job needs.
 *
 * Each route overrides this with a budget that must stay *above* the matching
 * service's own timeout — the service should always be the one to give up
 * first, so a job that has run too long is killed at the source rather than
 * left running for a caller that has already gone.
 */
const DEFAULT_TIMEOUT_MS = 180_000;

/** Upstream headers worth surfacing to the browser. */
const PASS_THROUGH = ['X-Input-Bytes', 'X-Output-Bytes', 'X-Compressed'];

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

  const response = await send(target, endpoint.secret, input, timeoutMs);

  if (response.ok) {
    const meta: Record<string, string> = {};
    for (const name of PASS_THROUGH) {
      const value = response.headers.get(name);
      if (value !== null) {
        meta[name] = value;
      }
    }
    return {
      body: await response.arrayBuffer(),
      contentType: response.headers.get('Content-Type') ?? 'application/octet-stream',
      meta,
    };
  }

  throw new ServiceError(classify(response.status), await failureMessage(response));
}

/**
 * POSTs to the service, retrying once if the connection itself failed.
 *
 * The machines scale to zero, so the first request after an idle period has to
 * wake one. That wake occasionally loses a race and the connection is refused
 * outright — which the user would otherwise see as "the service could not be
 * reached" on a service that is, in fact, perfectly fine and now awake. One
 * retry converts that into a slightly slow success.
 *
 * Only connection-level failures are retried. A timeout is not: the budget has
 * already been spent, and re-running a job that just took three minutes would
 * only make the wait worse. Nor is any HTTP status — the service answered, and
 * its answer is the answer.
 */
async function send(
  target: URL,
  secret: string,
  input: ArrayBuffer,
  timeoutMs: number,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(target, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/octet-stream',
        },
        body: input,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new ServiceError('TIMEOUT', 'The service took too long and was stopped.');
      }
      if (attempt >= 1) {
        throw new ServiceError('UPSTREAM_UNAVAILABLE', 'The service could not be reached.');
      }
      // Give the machine a moment to finish booting before the second attempt.
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
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
