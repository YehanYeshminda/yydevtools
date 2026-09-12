import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServiceError, forwardToService, serviceEndpoint } from './services';

const endpoint = { url: 'https://svc.example', secret: 'shh' };

/** Answers one request with the given status and our services' error shape. */
function respondWith(status: number, message = 'nope') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ error: { code: 'WHATEVER', message } }, { status }),
    ),
  );
}

async function forwardAndCatch(): Promise<ServiceError> {
  try {
    await forwardToService(endpoint, '/compress', {}, new ArrayBuffer(8), 1000);
  } catch (error) {
    return error as ServiceError;
  }
  throw new Error('expected forwardToService to throw');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('classify', () => {
  it('reports a rejected file as bad input, not as a broken server', async () => {
    // The regression this guards: a 400 used to become UPSTREAM_REJECTED, which
    // the route layer serves as a 502. Both browser clients treat any 5xx as
    // "the hosted service is down" and show the unavailable banner, so
    // uploading a non-PDF reported an outage instead of naming the real problem.
    respondWith(400, 'That file is not a PDF.');
    const error = await forwardAndCatch();

    expect(error.code).toBe('INVALID_INPUT');
    // The service's own wording has to survive — it is what the user reads.
    expect(error.message).toBe('That file is not a PDF.');
  });

  it('keeps any other 4xx as an upstream problem, not the user’s', async () => {
    // A 404 means this Worker asked for a path the service does not have. That
    // is our bug; telling the user their file is wrong would be a lie.
    for (const status of [404, 405, 418]) {
      respondWith(status);
      expect((await forwardAndCatch()).code, String(status)).toBe('UPSTREAM_REJECTED');
    }
  });

  it('maps the statuses that have their own meaning', async () => {
    const cases: Array<[number, string]> = [
      [413, 'TOO_LARGE'],
      [504, 'TIMEOUT'],
      // The Worker holds the only secret, so a 401 is misconfiguration here.
      [401, 'NOT_CONFIGURED'],
      [500, 'UPSTREAM_UNAVAILABLE'],
      [502, 'UPSTREAM_UNAVAILABLE'],
      // The services return 503 when every slot is busy or the tool is missing.
      [503, 'UPSTREAM_UNAVAILABLE'],
    ];
    for (const [status, code] of cases) {
      respondWith(status);
      expect((await forwardAndCatch()).code, String(status)).toBe(code);
    }
  });

  it('falls back to a usable message when the body is not our error shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 400 })));
    const error = await forwardAndCatch();

    expect(error.code).toBe('INVALID_INPUT');
    expect(error.message).toBeTruthy();
  });
});

describe('serviceEndpoint', () => {
  it('is null unless both halves are configured, so no half-set service is called', () => {
    expect(serviceEndpoint('https://svc.example', 'shh')).toEqual({
      url: 'https://svc.example',
      secret: 'shh',
    });
    expect(serviceEndpoint('https://svc.example', undefined)).toBeNull();
    expect(serviceEndpoint(undefined, 'shh')).toBeNull();
    expect(serviceEndpoint('', '')).toBeNull();
  });
});
