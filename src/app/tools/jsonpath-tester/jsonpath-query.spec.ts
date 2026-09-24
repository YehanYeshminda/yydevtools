import { describe, expect, it } from 'vitest';

import { runQuery } from './jsonpath-query';

const store = {
  store: {
    book: [
      { title: 'Sayings', price: 8.95 },
      { title: 'Sword', price: 12.99, isbn: '0-553' },
    ],
  },
};

describe('runQuery', () => {
  it('returns each match with the path that reaches it', () => {
    expect(runQuery(store, '$..book[?(@.price < 10)].title')).toEqual({
      matches: [{ path: '$.store.book[0].title', value: 'Sayings' }],
      error: null,
    });
  });

  it('writes awkward keys in brackets, escaped, and tells a key "0" from an index', () => {
    const json = { "it's": { 'a]b': 1 }, '0': { list: [{ '~/': 2 }] } };
    expect(runQuery(json, '$..*').matches.map((match) => match.path)).toEqual([
      "$['0']",
      "$['it\\'s']",
      "$['0'].list",
      "$['0'].list[0]",
      "$['0'].list[0]['~/']",
      "$['it\\'s']['a]b']",
    ]);
  });

  it('reports a filter that tries to reach outside the data, instead of running it', () => {
    const result = runQuery(store, '$..book[?(@.price.constructor)]');
    expect(result.matches).toEqual([]);
    expect(result.error).toMatch(/constructor/);
  });

  it('matches nothing, quietly, for an empty expression or a missing key', () => {
    expect(runQuery(store, '  ')).toEqual({ matches: [], error: null });
    expect(runQuery(store, '$.nope')).toEqual({ matches: [], error: null });
  });
});
