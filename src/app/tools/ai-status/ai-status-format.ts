import type { AiService, ServiceState } from '../../core/ai-status.client';

/** Pure helpers for the AI API Status tool, apart from the component so they can be tested. */

export type BadgeFormat = 'markdown' | 'html';

export const BADGE_BASE = 'https://prismix.dev/api/badge/';
export const STATUS_PAGE = 'https://prismix.dev/status';

export const STATE_LABELS: Record<ServiceState, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  outage: 'Outage',
  maintenance: 'Maintenance',
  unknown: 'No data',
};

/** The Markdown or HTML that embeds a service's Prismix badge, linked to Prismix's status page. */
export function badgeSnippet(service: Pick<AiService, 'id' | 'name'>, format: BadgeFormat): string {
  const src = `${BADGE_BASE}${service.id}.svg`;
  const alt = `${service.name} status`;
  return format === 'markdown'
    ? `[![${alt}](${src})](${STATUS_PAGE})`
    : `<a href="${STATUS_PAGE}"><img src="${src}" alt="${alt}"></a>`;
}

/** "just now", "5 min ago", "2 h ago" — the board refreshes every minute, so no finer. */
export function minutesAgo(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}
