import { describe, expect, it } from 'vitest';

import { describeProblem, excerptBlock, findDuplicateKeys } from './json-problem';

/**
 * These assert the line, the column and the excerpt, never the engine's
 * wording. The wording is V8's here and SpiderMonkey's in someone's Firefox,
 * and pinning it would make the suite a test of the JavaScript engine.
 */
describe('describeProblem', () => {
  it('says nothing about a document that parses', () => {
    expect(describeProblem('{"a":1}')).toBeNull();
    expect(describeProblem('[]')).toBeNull();
    expect(describeProblem('null')).toBeNull();
  });

  it('says nothing about an empty box', () => {
    expect(describeProblem('')).toBeNull();
    expect(describeProblem('   \n\t ')).toBeNull();
  });

  it('points at the trailing comma on a single line', () => {
    const problem = describeProblem('{"a":1,}');
    expect(problem).not.toBeNull();
    expect(problem!.line).toBe(1);
    // The eighth character is the '}' the parser choked on.
    expect(problem!.column).toBe(8);
    expect(problem!.excerpt).toBe('{"a":1,}');
  });

  it('finds the right line in a multi-line document', () => {
    const text = ['{', '  "a": 1,', '  "b": oops', '}'].join('\n');
    const problem = describeProblem(text)!;
    expect(problem.line).toBe(3);
    expect(problem.excerpt).toBe('  "b": oops');
  });

  it('handles a document that simply stops', () => {
    const problem = describeProblem('{"a":')!;
    expect(problem.line).toBe(1);
    // Past-the-end is clamped to the last character rather than running off it.
    expect(problem.column).toBeLessThanOrEqual(5);
    expect(problem.excerpt).toBe('{"a":');
  });

  it('strips the position tail out of the message', () => {
    const problem = describeProblem('{"a":1,}')!;
    expect(problem.message).not.toMatch(/position \d+/i);
    expect(problem.message).not.toMatch(/line \d+ column \d+/i);
    expect(problem.message).not.toMatch(/[.,]$/);
    // Still says something, and starts like a sentence.
    expect(problem.message.length).toBeGreaterThan(3);
    expect(problem.message[0]).toBe(problem.message[0].toUpperCase());
  });

  it('drops the slice of document V8 pastes into the message', () => {
    // The excerpt shows the offending line properly, so the engine's own
    // one-line rendering of it is noise sitting next to the real thing.
    const problem = describeProblem('{\n  "a": 1,\n  "b": oops\n}')!;
    expect(problem.message).not.toContain('is not valid JSON');
    expect(problem.message).not.toContain('oops');
    expect(problem.message).toContain('Unexpected token');
    // Still points at the right place.
    expect(problem.line).toBe(3);
    expect(problem.excerpt).toBe('  "b": oops');
  });

  it('flattens tabs so a column still counts characters', () => {
    const problem = describeProblem('{\n\t"a": oops\n}')!;
    expect(problem.line).toBe(2);
    expect(problem.excerpt).toBe(' "a": oops');
    expect(problem.excerpt).not.toContain('\t');
  });

  it('survives CRLF line endings', () => {
    const problem = describeProblem('{\r\n  "a": oops\r\n}')!;
    expect(problem.line).toBe(2);
    expect(problem.excerpt).toBe('  "a": oops');
  });
});

describe('excerptBlock', () => {
  it('puts the caret under the reported column', () => {
    const problem = describeProblem('{"a":1,}')!;
    const [source, caret] = excerptBlock(problem).split('\n');

    expect(source).toBe('1 | {"a":1,}');
    // The invariant is alignment, not length: under a fixed-width font the '^'
    // sits at the same index as the character it accuses. (The two lines are
    // the same length here, because the offender is the last character.)
    expect(caret.indexOf('^')).toBe(source.indexOf('{') + problem.column! - 1);
    expect(source[caret.indexOf('^')]).toBe('}');
  });

  it('keeps the gutter aligned when the line number is wider', () => {
    const text = `${'\n'.repeat(11)}  "a": oops`;
    const problem = describeProblem(`{${text}\n}`)!;
    const [source, caret] = excerptBlock(problem).split('\n');

    expect(source.startsWith('12 | ')).toBe(true);
    expect(caret.startsWith('   | ')).toBe(true);
  });

  it('returns nothing when the engine gave no position', () => {
    expect(excerptBlock({ message: 'Broken', line: null, column: null, excerpt: '' })).toBe('');
  });
});

describe('findDuplicateKeys', () => {
  it('finds a key written twice in one object', () => {
    expect(findDuplicateKeys('{"a":1,"a":2}')).toEqual([{ key: 'a', lines: [1, 1] }]);
  });

  it('says nothing about a document without duplicates', () => {
    expect(findDuplicateKeys('{"a":1,"b":2}')).toEqual([]);
    expect(findDuplicateKeys('[1,2,3]')).toEqual([]);
    expect(findDuplicateKeys('')).toEqual([]);
  });

  it('does not confuse two objects that share a key name', () => {
    // The naive text search reports "id" twice here, and is wrong: they are in
    // different objects, and JSON.parse keeps both.
    expect(findDuplicateKeys('[{"id":1},{"id":2}]')).toEqual([]);
    expect(findDuplicateKeys('{"a":{"id":1},"b":{"id":2}}')).toEqual([]);
  });

  it('does not confuse a nested key with its parent\u2019s', () => {
    expect(findDuplicateKeys('{"name":"outer","child":{"name":"inner"}}')).toEqual([]);
  });

  it('reports a duplicate inside a nested object', () => {
    const found = findDuplicateKeys('{"outer":{"c":1,"c":2}}');
    expect(found).toEqual([{ key: 'c', lines: [1, 1] }]);
  });

  it('ignores a repeated name that is a value, not a key', () => {
    // "a" appears three times in the text and is a key only once.
    expect(findDuplicateKeys('{"a":"a","b":"a"}')).toEqual([]);
  });

  it('treats an escaped key as the key it spells', () => {
    // JSON.parse sees one key here and keeps the last value, so this is a
    // duplicate even though the two tokens differ character for character.
    const found = findDuplicateKeys('{"caf\\u00e9":1,"caf\u00e9":2}');
    expect(found).toEqual([{ key: 'caf\u00e9', lines: [1, 1] }]);
    // And the premise: the parser really did collapse them.
    expect(Object.keys(JSON.parse('{"caf\\u00e9":1,"caf\u00e9":2}'))).toHaveLength(1);
  });

  it('gives the line of every occurrence, in order', () => {
    const text = ['{', '  "port": 8080,', '  "host": "a",', '  "port": 9090', '}'].join('\n');
    expect(findDuplicateKeys(text)).toEqual([{ key: 'port', lines: [2, 4] }]);
  });

  it('counts a key written three times', () => {
    expect(findDuplicateKeys('{"a":1,"a":2,"a":3}')).toEqual([{ key: 'a', lines: [1, 1, 1] }]);
  });

  it('reports every duplicated key, innermost object first', () => {
    // Each object is reported as it closes, so the nested "n" lands before the
    // outer "y". Worth pinning because it is the order they are shown in.
    const found = findDuplicateKeys('{"x":{"n":1,"n":2},"y":3,"y":4}');
    expect(found.map((d) => d.key)).toEqual(['n', 'y']);
  });

  it('keeps quiet on a document that does not parse', () => {
    // A broken document has a parse error to report first, and its recovered
    // tree is guesswork; a duplicate claimed from it would be noise.
    expect(describeProblem('{"a":1,"a":}')).not.toBeNull();
  });
});
