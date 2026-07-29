import { describe, expect, it } from 'vitest';

import { diffLines } from './diff';

describe('diffLines', () => {
  it('reports two identical inputs as all equal', () => {
    const { rows, stats } = diffLines('a\nb\nc', 'a\nb\nc');
    expect(rows.every((row) => row.kind === 'equal')).toBe(true);
    expect(stats).toEqual({ added: 0, removed: 0, unchanged: 3 });
  });

  it('detects an inserted line', () => {
    const { rows, stats } = diffLines('a\nc', 'a\nb\nc');
    expect(stats).toEqual({ added: 1, removed: 0, unchanged: 2 });
    const added = rows.find((row) => row.kind === 'add');
    expect(added?.text).toBe('b');
    expect(added?.rightLine).toBe(2);
    expect(added?.leftLine).toBeNull();
  });

  it('detects a removed line', () => {
    const { rows, stats } = diffLines('a\nb\nc', 'a\nc');
    expect(stats).toEqual({ added: 0, removed: 1, unchanged: 2 });
    expect(rows.find((row) => row.kind === 'remove')?.text).toBe('b');
  });

  it('treats a changed line as a remove plus an add', () => {
    const { stats } = diffLines('hello', 'world');
    expect(stats).toEqual({ added: 1, removed: 1, unchanged: 0 });
  });

  it('numbers surviving lines on each side independently', () => {
    const { rows } = diffLines('a\nb\nc', 'a\nx\nc');
    const c = rows.find((row) => row.kind === 'equal' && row.text === 'c');
    expect(c?.leftLine).toBe(3);
    expect(c?.rightLine).toBe(3);
  });

  it('honours ignoreCase', () => {
    expect(diffLines('Hello', 'hello').stats.unchanged).toBe(0);
    expect(diffLines('Hello', 'hello', { ignoreCase: true }).stats.unchanged).toBe(1);
  });

  it('honours ignoreWhitespace', () => {
    expect(diffLines('a ', ' a').stats.unchanged).toBe(0);
    expect(diffLines('a ', ' a', { ignoreWhitespace: true }).stats.unchanged).toBe(1);
  });

  it('normalises CRLF and a trailing newline', () => {
    expect(diffLines('a\r\nb\r\n', 'a\nb').stats).toEqual({
      added: 0,
      removed: 0,
      unchanged: 2,
    });
  });

  it('handles one empty side', () => {
    const { stats } = diffLines('', 'a\nb');
    expect(stats).toEqual({ added: 2, removed: 0, unchanged: 0 });
  });
});
