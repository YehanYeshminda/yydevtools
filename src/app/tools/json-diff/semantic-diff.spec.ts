import { describe, expect, it } from 'vitest';

import { canonical, diffJson } from './semantic-diff';

const paths = (a: unknown, b: unknown, ignoreArrayOrder = false) =>
  diffJson(a, b, { ignoreArrayOrder }).changes.map((c) => `${c.kind} ${c.path}`);

describe('diffJson', () => {
  it('ignores key order and formatting, and reports nothing for equal values', () => {
    const result = diffJson({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 });
    expect(result.changes).toEqual([]);
    expect(result.stats.unchanged).toBe(1);
    expect(result.lines.every((line) => line.kind === 'equal')).toBe(true);
  });

  it('finds added, removed and changed keys with their paths', () => {
    const before = { user: { name: 'Ada', email: 'ada@example.com', age: 36 }, plan: 'free' };
    const after = {
      user: { name: 'Ada', email: 'ada@lovelace.org', city: 'London' },
      plan: 'free',
    };
    expect(paths(before, after)).toEqual([
      'changed user.email',
      'removed user.age',
      'added user.city',
    ]);
    const change = diffJson(before, after).changes[0];
    expect(change.before).toBe('ada@example.com');
    expect(change.after).toBe('ada@lovelace.org');
  });

  it('treats a type change as a change, not a removal and an addition', () => {
    expect(paths({ id: 1 }, { id: '1' })).toEqual(['changed id']);
    expect(paths({ id: null }, { id: {} })).toEqual(['changed id']);
  });

  it('compares arrays by position unless told otherwise', () => {
    expect(paths({ tags: ['a', 'b'] }, { tags: ['b', 'a'] })).toEqual([
      'changed tags[0]',
      'changed tags[1]',
    ]);
    expect(paths({ tags: ['a', 'b'] }, { tags: ['b', 'a'] }, true)).toEqual([]);
    expect(paths({ tags: ['a', 'b'] }, { tags: ['b', 'c'] }, true)).toEqual([
      'removed tags[0]',
      'added tags[2]',
    ]);
  });

  it('matches array items by an identity key when ignoring order', () => {
    const before = [
      { id: 1, price: 10 },
      { id: 2, price: 20 },
    ];
    const after = [
      { id: 2, price: 25 },
      { id: 3, price: 30 },
    ];
    expect(paths(before, after, true)).toEqual([
      'removed [id=1]',
      'changed [id=2].price',
      'added [id=3]',
    ]);
  });

  it('quotes keys that are not identifiers in paths', () => {
    expect(paths({ 'content-type': 'a' }, { 'content-type': 'b' })).toEqual([
      'changed ["content-type"]',
    ]);
  });

  it('renders the merged document with the changed lines marked', () => {
    const { lines } = diffJson({ a: 1, b: [1] }, { a: 2, b: [1, 2] });
    expect(lines.map((line) => `${line.kind[0]} ${line.text}`)).toEqual([
      'e {',
      'r   "a": 1,',
      'a   "a": 2,',
      'e   "b": [',
      'e     1,',
      'a     2',
      'e   ]',
      'e }',
    ]);
  });

  it('counts the summary', () => {
    const { stats } = diffJson({ a: 1, b: 2, c: 3 }, { a: 1, b: 9, d: 4 });
    expect(stats).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 1 });
  });

  it('canonical serialisation sorts keys at every depth', () => {
    expect(canonical({ b: { d: 1, c: 2 }, a: [3] })).toBe('{"a":[3],"b":{"c":2,"d":1}}');
    expect(canonical(undefined)).toBe('null');
  });
});
