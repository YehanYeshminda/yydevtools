import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServiceError, forwardToService, type ServiceEndpoint } from './services';

const endpoint: ServiceEndpoint = { url: 'https://compress.example', secret: 'shh' };

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Runs one forward against a stubbed upstream response and returns the failure. */
async function failureFrom(response: Response): Promise<ServiceError> {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  try {
    await forwardToService(endpoint, '/compress', { preset: 'ebook' }, new ArrayBuffer(8));
  } catch (error) {
    if (error instanceof ServiceError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected forwardToService to reject');
}

function errorBody(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

describe('forwardToService failure classification', () => {
  it('reports a rejected input as INVALID_INPUT, not as an upstream failure', async () => {
    // The services sniff for %PDF- at offset 0 and answer 400 when it is not
    // there. That is the user's file being wrong, so it must not surface as a
    // 5xx — INVALID_INPUT is what maps to 400 in the route layer, and it is
    // absent from the clients' fallback set, so they show the message as-is.
    const failure = await failureFrom(errorBody('INVALID_INPUT', 'That file is not a PDF.', 400));

    expect(failure.code).toBe('INVALID_INPUT');
    expect(failure.message).toBe('That file is not a PDF.');
  });

  it('still reports a genuine upstream failure as UPSTREAM_UNAVAILABLE', async () => {
    // The other side of the same boundary: the services answer 502 when the
    // tool itself failed on a file that was perfectly valid.
    const failure = await failureFrom(
      errorBody('UPSTREAM_REJECTED', 'Ghostscript could not process this document.', 502),
    );

    expect(failure.code).toBe('UPSTREAM_UNAVAILABLE');
  });
});
