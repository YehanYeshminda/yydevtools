/**
 * The live status of the major AI APIs, from Prismix (https://prismix.dev).
 *
 * Prismix polls the status pages of about 77 AI services and publishes the
 * result as a free, key-less JSON endpoint. The browser could call it directly
 * (it allows any origin), but it goes through the Worker instead, for three
 * reasons:
 *
 *   - A visitor's browser never contacts a third party for this page's data.
 *   - The edge cache in worker/index.ts collapses every visitor onto one
 *     upstream request a minute per location, which is "reasonable use" by any
 *     measure — and exactly Prismix's own cache window, so nothing is staler.
 *   - The upstream shape is read here, once. If Prismix renames a field, this
 *     normaliser breaks and the page shows "unavailable"; nothing else does.
 *
 * Like news.ts it never throws: every failure is `UPSTREAM_UNAVAILABLE`.
 */

/** How a service is doing, reduced to the five states the page can show. */
export type ServiceState = 'operational' | 'degraded' | 'outage' | 'maintenance' | 'unknown';

/** One service, trimmed to what the page renders. */
export interface AiService {
  /** Prismix's id, e.g. "anthropic". Also the name of its badge. */
  id: string;
  name: string;
  state: ServiceState;
  /** The provider's own summary, e.g. "All Systems Operational". */
  description: string;
  activeIncidents: number;
  /** Uptime over the last 30 days, as a percentage, when Prismix reports one. */
  uptime30dPct: number | null;
  /** How long the provider's status page took to answer Prismix. */
  latencyMs: number | null;
  /** When the provider last updated its status (ISO-8601), when known. */
  updated: string | null;
}

export interface AiStatusPayload {
  services: AiService[];
  /** When Prismix fetched this batch (ISO-8601). */
  updated: string;
}

export type AiStatusResult =
  { ok: true; payload: AiStatusPayload } | { ok: false; code: 'UPSTREAM_UNAVAILABLE' };

const STATUSES_URL = 'https://prismix.dev/api/v1/statuses';
const FETCH_TIMEOUT_MS = 8000;
const MAX_DESCRIPTION = 200;

/**
 * Ids end up in a badge URL on the page, so only plain slugs are accepted — a
 * service with anything else in its id is dropped rather than escaped.
 */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;

/**
 * Prismix passes on each provider's own indicator. Most providers use Atlassian
 * Statuspage (none / minor / major / critical / maintenance); the rest use
 * words. Anything not listed here is shown as "unknown" rather than guessed at.
 */
const STATES: Record<string, ServiceState> = {
  none: 'operational',
  operational: 'operational',
  minor: 'degraded',
  degraded: 'degraded',
  degraded_performance: 'degraded',
  partial_outage: 'degraded',
  major: 'outage',
  critical: 'outage',
  outage: 'outage',
  major_outage: 'outage',
  maintenance: 'maintenance',
  under_maintenance: 'maintenance',
};

/** A provider's indicator as one of the page's states. */
export function stateFor(indicator: unknown, reachable: unknown): ServiceState {
  // Prismix could not reach the provider's status page, so it has no reading.
  if (reachable === false) {
    return 'unknown';
  }
  return typeof indicator === 'string'
    ? (STATES[indicator.trim().toLowerCase()] ?? 'unknown')
    : 'unknown';
}

/** Prismix's response as the page's payload, or null when it is not the expected shape. */
export function normalise(body: unknown): AiStatusPayload | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record['services'])) {
    return null;
  }

  const services = record['services']
    .map(toService)
    .filter((service): service is AiService => service !== null);
  if (services.length === 0) {
    return null;
  }

  const fetchedAt = record['fetchedAt'];
  return {
    services,
    updated: typeof fetchedAt === 'string' ? fetchedAt : new Date().toISOString(),
  };
}

function toService(value: unknown): AiService | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = raw['id'];
  const name = raw['name'];
  if (typeof id !== 'string' || !ID_PATTERN.test(id) || typeof name !== 'string' || !name.trim()) {
    return null;
  }

  const description = typeof raw['description'] === 'string' ? raw['description'].trim() : '';
  return {
    id,
    name: name.trim(),
    state: stateFor(raw['indicator'], raw['reachable']),
    description:
      description.length > MAX_DESCRIPTION
        ? `${description.slice(0, MAX_DESCRIPTION - 1)}…`
        : description,
    activeIncidents: count(raw['activeIncidents']),
    uptime30dPct: finite(raw['uptime30dPct']),
    latencyMs: finite(raw['latencyMs']),
    updated: typeof raw['updatedAt'] === 'string' ? raw['updatedAt'] : null,
  };
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Fetches and normalises the current statuses. Never throws. */
// The default wraps the global rather than passing it bare: a detached `fetch`
// can throw "Illegal invocation" in a Worker.
export async function getAiStatus(
  fetcher: typeof fetch = (input, init) => fetch(input, init),
): Promise<AiStatusResult> {
  let response: Response;
  try {
    response = await fetcher(STATUSES_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    console.warn(`ai-status: fetch failed (${error instanceof Error ? error.name : 'error'})`);
    return { ok: false, code: 'UPSTREAM_UNAVAILABLE' };
  }

  if (!response.ok) {
    console.warn(`ai-status: upstream answered ${response.status}`);
    return { ok: false, code: 'UPSTREAM_UNAVAILABLE' };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    console.warn('ai-status: upstream sent invalid JSON');
    return { ok: false, code: 'UPSTREAM_UNAVAILABLE' };
  }

  const payload = normalise(body);
  if (!payload) {
    console.warn('ai-status: upstream response was not the expected shape');
    return { ok: false, code: 'UPSTREAM_UNAVAILABLE' };
  }
  return { ok: true, payload };
}
