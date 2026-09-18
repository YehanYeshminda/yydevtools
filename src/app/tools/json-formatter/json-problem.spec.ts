import { describe, expect, it } from 'vitest';

import { describeProblem, excerptBlock } from './json-problem';

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
