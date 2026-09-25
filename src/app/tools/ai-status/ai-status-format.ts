import type {
  AiIncident,
  AiService,
  IncidentImpact,
  ServiceState,
} from '../../core/ai-status.client';

/** Pure helpers for the AI API Status tool, apart from the component so they can be tested. */

export type BadgeFormat = 'markdown' | 'html';
export type BadgeTheme = 'light' | 'dark';

export const BADGE_BASE = 'https://prismix.dev/api/badge/';
export const STATUS_PAGE = 'https://prismix.dev/status';

export const STATE_LABELS: Record<ServiceState, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  outage: 'Outage',
  maintenance: 'Maintenance',
  unknown: 'No data',
};

export const IMPACT_LABELS: Record<IncidentImpact, string> = {
  none: 'No impact',
  minor: 'Minor',
  major: 'Major',
  critical: 'Critical',
  maintenance: 'Maintenance',
};

/** Prismix's MCP server, as its API docs give the client config. */
export const MCP_CONFIG = `{
  "mcpServers": {
    "prismix-status": {
      "url": "https://prismix.dev/api/v1/mcp"
    }
  }
}`;

/** The address of a service's badge image. */
export function badgeUrl(id: string, theme: BadgeTheme = 'light'): string {
  return `${BADGE_BASE}${id}.svg${theme === 'dark' ? '?theme=dark' : ''}`;
}

/** The Markdown or HTML that embeds a service's Prismix badge, linked to Prismix's status page. */
export function badgeSnippet(
  service: Pick<AiService, 'id' | 'name'>,
  format: BadgeFormat,
  theme: BadgeTheme = 'light',
): string {
  const src = badgeUrl(service.id, theme);
  const alt = `${service.name} status`;
  return format === 'markdown'
    ? `[![${alt}](${src})](${STATUS_PAGE})`
    : `<a href="${STATUS_PAGE}"><img src="${src}" alt="${alt}"></a>`;
}

/** "just now", "5 min ago", "2 h ago", "3 days ago" — never finer than a minute. */
export function timeAgo(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return `${Math.floor(minutes / (24 * 60))} days ago`;
}

/** How long an incident lasted: "38 min", "1 h 38 min", or "Ongoing" while it is open. */
export function incidentDuration(incident: Pick<AiIncident, 'started' | 'resolved'>): string {
  if (!incident.resolved) return 'Ongoing';
  const minutes = Math.max(
    0,
    Math.round((Date.parse(incident.resolved) - Date.parse(incident.started)) / 60_000),
  );
  if (minutes < 1) return 'under 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

export interface TimelineEntry {
  service: Pick<AiService, 'id' | 'name'>;
  incident: AiIncident;
}

/** Every service's recent incidents in one list, newest first. */
export function timeline(services: readonly AiService[]): TimelineEntry[] {
  return services
    .flatMap((service) => service.recentIncidents.map((incident) => ({ service, incident })))
    .sort((a, b) => Date.parse(b.incident.started) - Date.parse(a.incident.started));
}
