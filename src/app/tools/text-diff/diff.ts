/**
 * A line-oriented diff, computed with the classic Myers longest-common-
 * subsequence recurrence over a memoised LCS table. No dependency: the input a
 * developer pastes here is small (two revisions of a file), so an O(n·m) table
 * is more than fast enough and far simpler than the full Myers edit graph.
 *
 * The output is a flat list of rows the UI renders in either a unified or a
 * split view — both are just two projections of the same row list.
 */

export type RowKind = 'equal' | 'add' | 'remove';

export interface DiffRow {
  kind: RowKind;
  /** The line's text (without its trailing newline). */
  text: string;
  /** 1-based line number in the original (left) side, null for added lines. */
  leftLine: number | null;
  /** 1-based line number in the changed (right) side, null for removed lines. */
  rightLine: number | null;
}

export interface DiffStats {
  added: number;
  removed: number;
  /** Lines present, unchanged, in both sides. */
  unchanged: number;
}

export interface DiffResult {
  rows: DiffRow[];
  stats: DiffStats;
}

export interface DiffOptions {
  /** Compare lines case-insensitively. */
  ignoreCase?: boolean;
  /** Trim leading/trailing whitespace on each line before comparing. */
  ignoreWhitespace?: boolean;
}

/** Split text into lines, tolerant of CRLF and a trailing newline. */
function toLines(text: string): string[] {
  if (text === '') {
    return [];
  }
  const normalised = text.replace(/\r\n?/g, '\n');
  const lines = normalised.split('\n');
  // A trailing newline produces one empty final element; drop it so "a\n" is a
  // single line, not a line plus a phantom blank.
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

function normalise(line: string, options: DiffOptions): string {
  let value = line;
  if (options.ignoreWhitespace) {
    value = value.trim();
  }
  if (options.ignoreCase) {
    value = value.toLowerCase();
  }
  return value;
}

/**
 * Build the LCS length table for two line arrays. `table[i][j]` is the length
 * of the longest common subsequence of `a[i..]` and `b[j..]`.
 */
function lcsTable(a: string[], b: string[]): Uint32Array[] {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: Uint32Array[] = Array.from({ length: rows }, () => new Uint32Array(cols));

  for (let i = a.length - 1; i >= 0; i--) {
    const row = table[i];
    const next = table[i + 1];
    for (let j = b.length - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? next[j + 1] + 1 : Math.max(next[j], row[j + 1]);
    }
  }
  return table;
}

export function diffLines(
  original: string,
  changed: string,
  options: DiffOptions = {},
): DiffResult {
  const leftText = toLines(original);
  const rightText = toLines(changed);
  const left = leftText.map((line) => normalise(line, options));
  const right = rightText.map((line) => normalise(line, options));

  const table = lcsTable(left, right);
  const rows: DiffRow[] = [];
  const stats: DiffStats = { added: 0, removed: 0, unchanged: 0 };

  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      rows.push({ kind: 'equal', text: leftText[i], leftLine: i + 1, rightLine: j + 1 });
      stats.unchanged++;
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      rows.push({ kind: 'remove', text: leftText[i], leftLine: i + 1, rightLine: null });
      stats.removed++;
      i++;
    } else {
      rows.push({ kind: 'add', text: rightText[j], leftLine: null, rightLine: j + 1 });
      stats.added++;
      j++;
    }
  }
  while (i < left.length) {
    rows.push({ kind: 'remove', text: leftText[i], leftLine: i + 1, rightLine: null });
    stats.removed++;
    i++;
  }
  while (j < right.length) {
    rows.push({ kind: 'add', text: rightText[j], leftLine: null, rightLine: j + 1 });
    stats.added++;
    j++;
  }

  return { rows, stats };
}
