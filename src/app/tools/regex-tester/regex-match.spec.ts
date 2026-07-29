import { describe, expect, it } from 'vitest';

import { compile, run } from './regex-match';

describe('compile', () => {
  it('returns a usable regex for a valid pattern', () => {
    const { regex, error } = compile('\\d+', 'g');
    expect(error).toBeNull();
    expect(regex).toBeInstanceOf(RegExp);
  });

  it('reports an error for an invalid pattern', () => {
    const { regex, error } = compile('(', '');
    expect(regex).toBeNull();
    expect(error).toBeTruthy();
  });

  it('treats an empty pattern as idle, not an error', () => {
    expect(compile('', 'g')).toEqual({ regex: null, error: null });
  });
});

describe('run', () => {
  it('returns only the first match without the global flag', () => {
    const { regex } = compile('\\d+', '');
    const { matches } = run(regex, 'a1 b2 c3');
    expect(matches).toHaveLength(1);
    expect(matches[0].value).toBe('1');
    expect(matches[0].index).toBe(1);
  });

  it('returns every match with the global flag', () => {
    const { regex } = compile('\\d+', 'g');
    const { matches } = run(regex, 'a1 b2 c3');
    expect(matches.map((m) => m.value)).toEqual(['1', '2', '3']);
  });

  it('exposes positional capture groups', () => {
    const { regex } = compile('(\\w)(\\d)', 'g');
    const { matches } = run(regex, 'a1');
    expect(matches[0].groups).toEqual([
      { label: '1', value: 'a' },
      { label: '2', value: '1' },
    ]);
  });

  it('labels named capture groups by name', () => {
    const { regex } = compile('(?<year>\\d{4})-(?<month>\\d{2})', '');
    const { matches } = run(regex, '2026-07');
    expect(matches[0].groups.map((g) => g.label)).toEqual(['year', 'month']);
    expect(matches[0].groups.map((g) => g.value)).toEqual(['2026', '07']);
  });

  it('terminates on a zero-width global match', () => {
    const { regex } = compile('a*', 'g');
    const { matches } = run(regex, 'aXa');
    // Should not hang; every position is probed.
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].value).toBe('a');
  });

  it('returns nothing for empty input', () => {
    const { regex } = compile('\\d', 'g');
    expect(run(regex, '')).toEqual({ matches: [], truncated: false });
  });
});
