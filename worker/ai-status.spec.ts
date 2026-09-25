import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAiStatus, normalise, stateFor } from './ai-status';

/** Shaped exactly like Prismix's GET /api/v1/statuses, optional fields included and omitted. */
const PRISMIX = {
  fetchedAt: '2026-09-25T12:00:00.000Z',
  cached: true,
  services: [
    {
      id: 'anthropic',
      name: 'Anthropic',
      indicator: 'none',
      description: 'All Systems Operational',
      updatedAt: '2026-09-25T11:58:00.000Z',
      reachable: true,
      activeIncidents: 0,
      latencyMs: 212,
      recentIncidents30d: 3,
      uptime30dPct: 99.87,
      lastIncidentAt: '2026-09-20T08:00:00.000Z',
      recentIncidentBriefs: [
        {
          id: 'x1',
          name: 'Elevated errors',
          impact: 'minor',
          createdAt: '2026-09-20T08:00:00.000Z',
          resolvedAt: '2026-09-20T09:00:00.000Z',
        },
      ],
      cachedAt: '2026-09-25T12:00:00.000Z',
    },
    {
      id: 'openai',
      name: 'OpenAI',
      indicator: 'minor',
      description: 'Partially Degraded Service',
      reachable: true,
      activeIncidents: 1,
      latencyMs: 340,
    },
    {
      id: 'deepgram',
      name: 'Deepgram',
      indicator: 'none',
      description: '',
      reachable: false,
      activeIncidents: 0,
      latencyMs: 8000,
      unreachableReason: 'timeout',
    },
  ],
};

function respond(body: unknown, init: ResponseInit = {}): typeof fetch {
  return vi.fn(async () =>
    typeof body === 'string' ? new Response(body, init) : Response.json(body, init),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('stateFor', () => {
  it('reads Statuspage indicators', () => {
    expect(stateFor('none', true)).toBe('operational');
    expect(stateFor('minor', true)).toBe('degraded');
    expect(stateFor('major', true)).toBe('outage');
    expect(stateFor('critical', true)).toBe('outage');
    expect(stateFor('maintenance', true)).toBe('maintenance');
  });

  it('reads the worded indicators other providers use, in any case', () => {
    expect(stateFor('Operational', true)).toBe('operational');
    expect(stateFor('partial_outage', true)).toBe('degraded');
    expect(stateFor('major_outage', true)).toBe('outage');
    expect(stateFor('under_maintenance', true)).toBe('maintenance');
  });

  it('says unknown rather than guessing', () => {
    expect(stateFor('purple', true)).toBe('unknown');
    expect(stateFor(undefined, true)).toBe('unknown');
    // An unreachable status page is no reading at all, whatever the indicator says.
    expect(stateFor('none', false)).toBe('unknown');
  });
});

describe('normalise', () => {
  it('keeps what the page shows and drops the rest', () => {
    const payload = normalise(PRISMIX)!;
    expect(payload.updated).toBe('2026-09-25T12:00:00.000Z');
    expect(payload.services).toEqual([
      {
        id: 'anthropic',
        name: 'Anthropic',
        state: 'operational',
        description: 'All Systems Operational',
        activeIncidents: 0,
        uptime30dPct: 99.87,
        latencyMs: 212,
        updated: '2026-09-25T11:58:00.000Z',
      },
      {
        id: 'openai',
        name: 'OpenAI',
        state: 'degraded',
        description: 'Partially Degraded Service',
        activeIncidents: 1,
        uptime30dPct: null,
        latencyMs: 340,
        updated: null,
      },
      {
        id: 'deepgram',
        name: 'Deepgram',
        state: 'unknown',
        description: '',
        activeIncidents: 0,
        uptime30dPct: null,
        latencyMs: 8000,
        updated: null,
      },
    ]);
  });

  it('drops a service whose id could not safely name a badge', () => {
    const payload = normalise({
      ...PRISMIX,
      services: [
        ...PRISMIX.services,
        { ...PRISMIX.services[0], id: '../admin' },
        { ...PRISMIX.services[0], id: 'a b' },
        { ...PRISMIX.services[0], name: '' },
        'not a service',
      ],
    })!;
    expect(payload.services.map((service) => service.id)).toEqual([
      'anthropic',
      'openai',
      'deepgram',
    ]);
  });

  it('clips a long description', () => {
    const long = 'x'.repeat(500);
    const payload = normalise({ services: [{ ...PRISMIX.services[0], description: long }] })!;
    expect(payload.services[0].description).toHaveLength(200);
  });

  it('turns junk counts into safe numbers', () => {
    const payload = normalise({
      services: [
        { ...PRISMIX.services[0], activeIncidents: -2, latencyMs: 'fast', uptime30dPct: NaN },
      ],
    })!;
    expect(payload.services[0]).toMatchObject({
      activeIncidents: 0,
      latencyMs: null,
      uptime30dPct: null,
    });
  });

  it('rejects anything that is not the expected shape', () => {
    for (const body of [null, 'text', [], {}, { services: 'no' }, { services: [] }]) {
      expect(normalise(body), JSON.stringify(body)).toBeNull();
    }
  });
});

describe('getAiStatus', () => {
  it('fetches the statuses endpoint and returns the normalised payload', async () => {
    const fetcher = respond(PRISMIX);
    const result = await getAiStatus(fetcher);

    expect(result.ok).toBe(true);
    expect(result.ok && result.payload.services).toHaveLength(3);
    expect(fetcher).toHaveBeenCalledWith(
      'https://prismix.dev/api/v1/statuses',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('reports the upstream unavailable on every kind of failure, and never throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failures: (typeof fetch)[] = [
      vi.fn(async () => {
        throw new DOMException('timed out', 'TimeoutError');
      }) as unknown as typeof fetch,
      respond({ error: 'down' }, { status: 503 }),
      respond('<html>not json</html>', { status: 200 }),
      respond({ services: [] }),
    ];
    for (const fetcher of failures) {
      expect(await getAiStatus(fetcher)).toEqual({ ok: false, code: 'UPSTREAM_UNAVAILABLE' });
    }
  });
});
