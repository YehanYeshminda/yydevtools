import { diffArrays } from 'diff';

/**
 * A line-oriented diff over the normalised lines, by one of two algorithms.
 *
 * An exact LCS table is lines × lines: quick and memory-cheap up to a few
 * thousand lines a side however different they are, but two 20k-line files
 * need 1.6 GB and several seconds even for a one-line edit. Myers (jsdiff) is
 * the reverse — milliseconds when the edits are few, whatever the size, but
 * seconds when the sides share little. So the table is used while it fits in
 * {@link MAX_TABLE_CELLS}, and Myers beyond that, where "two big revisions of
 * one file" is by far the likelier input.
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
 * 16M cells is 64 MB of Uint32Array, about 4k lines a side. Measured in Node,
 * 25M cells (5k × 5k) took 158 ms; the margin is for phones.
 */
const MAX_TABLE_CELLS = 16_000_000;

/**
 * How long Myers may run before the diff is reported as everything replaced.
 * It only gets slow when two large sides share almost nothing, and then that
 * is close to the true answer anyway.
 */
const MYERS_TIMEOUT_MS = 2_000;

interface Run {
  count: number;
  added: boolean;
  removed: boolean;
}

/** Exact LCS: `table[i][j]` is the LCS length of `a[i..]` and `b[j..]`. */
function lcsRuns(a: string[], b: string[]): Run[] {
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    const row = table[i];
    const next = table[i + 1];
    for (let j = b.length - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? next[j + 1] + 1 : Math.max(next[j], row[j + 1]);
    }
  }

  const runs: Run[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      runs.push({ count: 1, added: false, removed: false });
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && table[i + 1][j] >= table[i][j + 1])) {
      runs.push({ count: 1, added: false, removed: true });
      i++;
    } else {
      runs.push({ count: 1, added: true, removed: false });
      j++;
    }
  }
  return runs;
}

function myersRuns(a: string[], b: string[]): Run[] {
  return (
    diffArrays(a, b, { timeout: MYERS_TIMEOUT_MS }) ?? [
      { count: a.length, added: false, removed: true },
      { count: b.length, added: true, removed: false },
    ]
  );
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

  const changes =
    (left.length + 1) * (right.length + 1) <= MAX_TABLE_CELLS
      ? lcsRuns(left, right)
      : myersRuns(left, right);

  const rows: DiffRow[] = [];
  const stats: DiffStats = { added: 0, removed: 0, unchanged: 0 };
  let i = 0;
  let j = 0;
  for (const change of changes) {
    for (let k = 0; k < change.count; k++) {
      if (change.removed) {
        rows.push({ kind: 'remove', text: leftText[i], leftLine: i + 1, rightLine: null });
        stats.removed++;
        i++;
      } else if (change.added) {
        rows.push({ kind: 'add', text: rightText[j], leftLine: null, rightLine: j + 1 });
        stats.added++;
        j++;
      } else {
        rows.push({ kind: 'equal', text: leftText[i], leftLine: i + 1, rightLine: j + 1 });
        stats.unchanged++;
        i++;
        j++;
      }
    }
  }

  return { rows, stats };
}
