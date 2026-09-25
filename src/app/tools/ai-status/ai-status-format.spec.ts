import { describe, expect, it } from 'vitest';

import { badgeSnippet, minutesAgo } from './ai-status-format';

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
});

describe('minutesAgo', () => {
  const at = Date.parse('2026-09-25T12:00:00Z');

  it('rounds down to whole minutes, then hours', () => {
    expect(minutesAgo('2026-09-25T12:00:00Z', at + 30_000)).toBe('just now');
    expect(minutesAgo('2026-09-25T12:00:00Z', at + 5 * 60_000)).toBe('5 min ago');
    expect(minutesAgo('2026-09-25T12:00:00Z', at + 125 * 60_000)).toBe('2 h ago');
  });

  it('never claims the future or a nonsense time', () => {
    expect(minutesAgo('2026-09-25T12:00:00Z', at - 60_000)).toBe('just now');
    expect(minutesAgo('not a date', at)).toBe('just now');
  });
});
