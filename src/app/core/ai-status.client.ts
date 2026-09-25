import { Injectable, computed, signal } from '@angular/core';

/**
 * Fetches the AI API status board's data from the Worker's `/api/ai-status`
 * route (which reads Prismix and caches it at the edge) and exposes it as
 * signals.
 *
 * Built like NewsService: the page is prerendered, so live data can only arrive
 * after hydration, from one browser fetch. Anything that is not a JSON success
 * — no Worker under `ng serve`, Prismix down — becomes `unavailable`, never an
 * error. Unlike the news, a status board is worth refreshing, so `reload()`
 * fetches again on request.
 */

export type ServiceState = 'operational' | 'degraded' | 'outage' | 'maintenance' | 'unknown';

/** One service, matching the Worker's `AiService` shape. */
export interface AiService {
  id: string;
  name: string;
  state: ServiceState;
  description: string;
  activeIncidents: number;
  uptime30dPct: number | null;
  latencyMs: number | null;
  updated: string | null;
  incidents30d: number | null;
  lastIncidentAt: string | null;
  recentIncidents: AiIncident[];
  note: string | null;
}

export type IncidentImpact = 'none' | 'minor' | 'major' | 'critical' | 'maintenance';

/** Matches the Worker's `AiIncident`. */
export interface AiIncident {
  name: string;
  impact: IncidentImpact;
  started: string;
  resolved: string | null;
  /** Always https when present — the Worker drops anything else. */
  link: string | null;
}

interface AiStatusPayload {
  services: AiService[];
  updated: string;
}

export type AiStatusLoad = 'idle' | 'loading' | 'ready' | 'unavailable';

@Injectable({ providedIn: 'root' })
export class AiStatusService {
  private readonly payload = signal<AiStatusPayload | null>(null);
  private readonly state = signal<AiStatusLoad>('idle');

  readonly status = this.state.asReadonly();
  readonly services = computed<readonly AiService[]>(() => this.payload()?.services ?? []);
  /** When Prismix fetched the batch (ISO-8601), or null before it loads. */
  readonly updated = computed<string | null>(() => this.payload()?.updated ?? null);

  /** Fetches once per session; later calls are no-ops while data is loaded or loading. */
  load(): void {
    if (this.state() === 'idle') {
      void this.run();
    }
  }

  /** Fetches again, keeping what is on screen until the new data arrives. */
  reload(): void {
    if (this.state() !== 'loading') {
      void this.run();
    }
  }

  private async run(): Promise<void> {
    this.state.set('loading');
    const body = await fetchJson('/api/ai-status');
    if (isPayload(body)) {
      this.payload.set(body);
      this.state.set('ready');
    } else {
      this.state.set('unavailable');
    }
  }
}

async function fetchJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const type = response.headers.get('Content-Type') ?? '';
    // Under `ng serve` the SPA fallback answers with index.html and a 200.
    if (!response.ok || !type.includes('application/json')) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

function isPayload(value: unknown): value is AiStatusPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record['services']) &&
    record['services'].length > 0 &&
    typeof record['updated'] === 'string'
  );
}
