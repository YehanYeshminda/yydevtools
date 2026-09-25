import { describe, expect, it } from 'vitest';

import type { AiService } from '../../core/ai-status.client';
import { badgeSnippet, incidentDuration, timeAgo, timeline } from './ai-status-format';

describe('badgeSnippet', () => {
  const service = { id: 'anthropic', name: 'Anthropic' };

  it('writes a Markdown image linked to the status page', () => {
    expect(badgeSnippet(service, 'markdown')).toBe(
      '[![Anthropic status](https://prismix.dev/api/badge/anthropic.svg)](https://prismix.dev/status)',
    );
  });

  it('writes the same badge as HTML', () => {
    expect(badgeSnippet(service, 'html')).toBe(
      '<a href="https://prismix.dev/status"><img src="https://prismix.dev/api/badge/anthropic.svg" alt="Anthropic status"></a>',
    );
  });

  it('asks for the dark badge when chosen', () => {
    expect(badgeSnippet(service, 'markdown', 'dark')).toBe(
      '[![Anthropic status](https://prismix.dev/api/badge/anthropic.svg?theme=dark)](https://prismix.dev/status)',
    );
  });
});

describe('timeAgo', () => {
  const at = Date.parse('2026-09-25T12:00:00Z');

  it('rounds down to whole minutes, then hours', () => {
    expect(timeAgo('2026-09-25T12:00:00Z', at + 30_000)).toBe('just now');
    expect(timeAgo('2026-09-25T12:00:00Z', at + 5 * 60_000)).toBe('5 min ago');
    expect(timeAgo('2026-09-25T12:00:00Z', at + 125 * 60_000)).toBe('2 h ago');
    expect(timeAgo('2026-09-25T12:00:00Z', at + 47 * 3_600_000)).toBe('47 h ago');
    expect(timeAgo('2026-09-25T12:00:00Z', at + 74 * 3_600_000)).toBe('3 days ago');
  });

  it('never claims the future or a nonsense time', () => {
    expect(timeAgo('2026-09-25T12:00:00Z', at - 60_000)).toBe('just now');
    expect(timeAgo('not a date', at)).toBe('just now');
  });
});

describe('incidentDuration', () => {
  const started = '2026-09-22T00:57:26Z';

  it('rounds to minutes, and says hours once it runs past one', () => {
    expect(incidentDuration({ started, resolved: '2026-09-22T01:35:00Z' })).toBe('38 min');
    expect(incidentDuration({ started, resolved: '2026-09-22T02:35:23Z' })).toBe('1 h 38 min');
    expect(incidentDuration({ started, resolved: '2026-09-22T02:57:26Z' })).toBe('2 h');
  });

  it('does not claim an incident lasted no time at all', () => {
    expect(incidentDuration({ started, resolved: '2026-09-22T00:57:40Z' })).toBe('under 1 min');
  });

  it('calls an open incident ongoing', () => {
    expect(incidentDuration({ started, resolved: null })).toBe('Ongoing');
  });
});

describe('timeline', () => {
  const service = (id: string, starts: string[]): AiService => ({
    id,
    name: id,
    state: 'operational',
    description: '',
    activeIncidents: 0,
    uptime30dPct: null,
    latencyMs: null,
    updated: null,
    incidents30d: starts.length,
    lastIncidentAt: starts[0] ?? null,
    recentIncidents: starts.map((started) => ({
      name: `${id} ${started}`,
      impact: 'minor',
      started,
      resolved: null,
      link: null,
    })),
    note: null,
  });

  it('merges every service into one list, newest first', () => {
    const entries = timeline([
      service('a', ['2026-09-20T00:00:00Z', '2026-09-10T00:00:00Z']),
      service('b', ['2026-09-15T00:00:00Z']),
      service('c', []),
    ]);
    expect(entries.map((entry) => entry.incident.name)).toEqual([
      'a 2026-09-20T00:00:00Z',
      'b 2026-09-15T00:00:00Z',
      'a 2026-09-10T00:00:00Z',
    ]);
  });
});
