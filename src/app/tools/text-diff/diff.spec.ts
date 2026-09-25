import { describe, expect, it } from 'vitest';

import { diffAlgorithm, diffLines } from './diff';

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

  // The old LCS table was lines × lines: two 20k-line files meant a 1.6 GB
  // allocation and a crashed tab, for the ordinary case of one edited line.
  it('diffs two large files that differ in one line, quickly', () => {
    const lines = Array.from({ length: 20_000 }, (_, i) => `line ${i}`);
    const edited = [...lines];
    edited[12_345] = 'changed';
    const started = performance.now();
    const { stats } = diffLines(lines.join('\n'), edited.join('\n'));
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(stats).toEqual({ added: 1, removed: 1, unchanged: 19_999 });
  });

  // Measured in Node: the exact table does this in ~80 ms, Myers in ~1 s — which
  // is why the two are combined rather than one swapped for the other. It asks
  // which path runs instead of timing it: a 400 ms budget failed on a loaded
  // machine (471–686 ms) while the table path was still the one taken.
  it('stays on the fast exact path for a mid-sized, heavily edited file', () => {
    const left = Array.from({ length: 3_900 }, (_, i) => `l${i}`);
    const right = left.map((line, i) => (i % 2 ? `x${i}` : line));
    expect(diffAlgorithm(left.length, right.length)).toBe('table');
    const { stats } = diffLines(left.join('\n'), right.join('\n'));
    expect(stats).toEqual({ added: 1_950, removed: 1_950, unchanged: 1_950 });
  });

  it('hands two sides too big for the table to Myers', () => {
    expect(diffAlgorithm(20_000, 20_000)).toBe('myers');
  });

  it('still produces a valid diff for two large, entirely different files', () => {
    const left = Array.from({ length: 5_000 }, (_, i) => `a${i}`).join('\n');
    const right = Array.from({ length: 5_000 }, (_, i) => `b${i}`).join('\n');
    const { stats } = diffLines(left, right);
    expect(stats).toEqual({ added: 5_000, removed: 5_000, unchanged: 0 });
  });
});
