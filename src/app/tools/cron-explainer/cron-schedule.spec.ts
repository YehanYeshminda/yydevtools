import { describe, expect, it } from 'vitest';

import { explainCron } from './cron-schedule';

const from = new Date('2026-01-01T00:00:00Z');

describe('explainCron', () => {
  it('is idle for an empty expression', () => {
    expect(explainCron('   ', { from, tz: 'UTC', count: 5 })).toEqual({
      description: null,
      runs: [],
      error: null,
    });
  });

  it('describes a simple expression in plain English', () => {
    const { description, error } = explainCron('0 9 * * 1-5', { from, tz: 'UTC', count: 5 });
    expect(error).toBeNull();
    expect(description?.toLowerCase()).toContain('9:00 am');
  });

  it('returns the requested number of upcoming runs, ascending', () => {
    const { runs } = explainCron('0 0 * * *', { from, tz: 'UTC', count: 3 });
    expect(runs).toHaveLength(3);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].getTime()).toBeGreaterThan(runs[i - 1].getTime());
    }
  });

  it('interprets the daily run in the given time zone', () => {
    const utc = explainCron('0 0 * * *', { from, tz: 'UTC', count: 1 }).runs[0];
    // The anchor is exclusive: the next midnight UTC strictly after the start
    // instant (2026-01-01T00:00:00Z) is the following midnight.
    expect(utc.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('reports an error for gibberish', () => {
    const { error, runs, description } = explainCron('not a cron', {
      from,
      tz: 'UTC',
      count: 5,
    });
    expect(error).toBeTruthy();
    expect(runs).toHaveLength(0);
    expect(description).toBeNull();
  });

  it('handles the @daily macro', () => {
    const { runs, error } = explainCron('@daily', { from, tz: 'UTC', count: 2 });
    expect(error).toBeNull();
    expect(runs).toHaveLength(2);
  });
});
