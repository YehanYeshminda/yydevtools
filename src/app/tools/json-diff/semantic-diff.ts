/**
 * A structural diff of two JSON values.
 *
 * A line diff of two API responses is mostly noise: reordered keys, a
 * reindented block and a trailing comma all show as changes, and the one field
 * that actually moved from 200 to 404 is buried in them. This compares the
 * parsed values instead. Objects are unordered, so key order never counts;
 * arrays are positional unless asked to ignore order, in which case items are
 * matched by an identity key when they have one and as a multiset when they
 * do not.
 *
 * Two projections come out of one walk: a flat list of changes with their
 * paths, which is the answer, and an annotated rendering of the merged
 * document, which is the context.
 */

export type ChangeKind = 'added' | 'removed' | 'changed';

export interface Change {
  /** Dot path to the value, e.g. `user.roles[2]` or `items[id=42].price`; '' is the root. */
  path: string;
  kind: ChangeKind;
  before?: unknown;
  after?: unknown;
}

export interface Line {
  kind: 'equal' | 'add' | 'remove';
  /** The rendered line, indented. */
  text: string;
}

export interface JsonDiffStats {
  added: number;
  removed: number;
  changed: number;
  /** Entries found equal on both sides. */
  unchanged: number;
}

export interface JsonDiffResult {
  changes: Change[];
  lines: Line[];
  stats: JsonDiffStats;
}

export interface JsonDiffOptions {
  /**
   * Compare arrays as sets rather than sequences. Arrays of objects are matched
   * on an identity key (id, name, …); anything else is matched by value.
   */
  ignoreArrayOrder?: boolean;
}

/** Keys that identify an item in a list, most conventional first. */
const ID_KEYS = ['id', '_id', 'uuid', 'key', 'slug', 'code', 'name'];

const INDENT = '  ';

export function diffJson(a: unknown, b: unknown, options: JsonDiffOptions = {}): JsonDiffResult {
  const result: JsonDiffResult = {
    changes: [],
    lines: [],
    stats: { added: 0, removed: 0, changed: 0, unchanged: 0 },
  };
  walk(a, b, '', 0, '', true, options, result);
  return result;
}

/** A stable serialisation: key order never makes two objects differ. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function walk(
  a: unknown,
  b: unknown,
  path: string,
  depth: number,
  prefix: string,
  last: boolean,
  options: JsonDiffOptions,
  out: JsonDiffResult,
): void {
  if (canonical(a) === canonical(b)) {
    out.stats.unchanged++;
    render(a, 'equal', depth, prefix, last, out.lines);
    return;
  }

  if (isObject(a) && isObject(b)) {
    const keys = [...Object.keys(a), ...Object.keys(b).filter((key) => !(key in a))];
    open('{', depth, prefix, out.lines);
    keys.forEach((key, index) => {
      const isLast = index === keys.length - 1;
      const childPath = join(path, key);
      const childPrefix = `${JSON.stringify(key)}: `;
      if (!(key in b)) {
        removed(a[key], childPath, depth + 1, childPrefix, isLast, out);
      } else if (!(key in a)) {
        added(b[key], childPath, depth + 1, childPrefix, isLast, out);
      } else {
        walk(a[key], b[key], childPath, depth + 1, childPrefix, isLast, options, out);
      }
    });
    close('}', depth, last, out.lines);
    return;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    open('[', depth, prefix, out.lines);
    if (options.ignoreArrayOrder) {
      unordered(a, b, path, depth + 1, options, out);
    } else {
      const length = Math.max(a.length, b.length);
      for (let i = 0; i < length; i++) {
        const isLast = i === length - 1;
        if (i >= b.length) {
          removed(a[i], `${path}[${i}]`, depth + 1, '', isLast, out);
        } else if (i >= a.length) {
          added(b[i], `${path}[${i}]`, depth + 1, '', isLast, out);
        } else {
          walk(a[i], b[i], `${path}[${i}]`, depth + 1, '', isLast, options, out);
        }
      }
    }
    close(']', depth, last, out.lines);
    return;
  }

  out.stats.changed++;
  out.changes.push({ path, kind: 'changed', before: a, after: b });
  render(a, 'remove', depth, prefix, last, out.lines);
  render(b, 'add', depth, prefix, last, out.lines);
}

/** Arrays compared without regard to position. */
function unordered(
  a: unknown[],
  b: unknown[],
  path: string,
  depth: number,
  options: JsonDiffOptions,
  out: JsonDiffResult,
): void {
  const key = identityKey(a, b);
  if (key) {
    const byKey = new Map(b.map((item) => [String((item as Record<string, unknown>)[key]), item]));
    const seen = new Set<string>();
    const entries: [unknown, unknown | undefined, string][] = a.map((item) => {
      const id = String((item as Record<string, unknown>)[key]);
      seen.add(id);
      return [item, byKey.get(id), `${path}[${key}=${id}]`];
    });
    for (const item of b) {
      const id = String((item as Record<string, unknown>)[key]);
      if (!seen.has(id)) {
        entries.push([undefined, item, `${path}[${key}=${id}]`]);
      }
    }
    entries.forEach(([left, right, childPath], index) => {
      const isLast = index === entries.length - 1;
      if (right === undefined) {
        removed(left, childPath, depth, '', isLast, out);
      } else if (left === undefined) {
        added(right, childPath, depth, '', isLast, out);
      } else {
        walk(left, right, childPath, depth, '', isLast, options, out);
      }
    });
    return;
  }

  // No identity: match by value, as a multiset.
  const remaining = new Map<string, number>();
  for (const item of b) {
    const id = canonical(item);
    remaining.set(id, (remaining.get(id) ?? 0) + 1);
  }
  const entries: ['equal' | 'remove' | 'add', unknown][] = [];
  for (const item of a) {
    const id = canonical(item);
    const count = remaining.get(id) ?? 0;
    if (count > 0) {
      remaining.set(id, count - 1);
      entries.push(['equal', item]);
    } else {
      entries.push(['remove', item]);
    }
  }
  for (const item of b) {
    const id = canonical(item);
    const count = remaining.get(id) ?? 0;
    if (count > 0) {
      remaining.set(id, count - 1);
      entries.push(['add', item]);
    }
  }
  entries.forEach(([kind, item], index) => {
    const isLast = index === entries.length - 1;
    const childPath = `${path}[${index}]`;
    if (kind === 'remove') {
      removed(item, childPath, depth, '', isLast, out);
    } else if (kind === 'add') {
      added(item, childPath, depth, '', isLast, out);
    } else {
      out.stats.unchanged++;
      render(item, 'equal', depth, '', isLast, out.lines);
    }
  });
}

/** The first conventional key every item on both sides carries, with unique scalar values. */
function identityKey(a: unknown[], b: unknown[]): string | null {
  const items = [...a, ...b];
  if (items.length === 0 || !items.every(isObject)) {
    return null;
  }
  for (const key of ID_KEYS) {
    const ok = items.every((item) => key in item && isScalar(item[key]));
    if (!ok) {
      continue;
    }
    const unique = (side: unknown[]) =>
      new Set(side.map((item) => String((item as Record<string, unknown>)[key]))).size ===
      side.length;
    if (unique(a) && unique(b)) {
      return key;
    }
  }
  return null;
}

function removed(
  value: unknown,
  path: string,
  depth: number,
  prefix: string,
  last: boolean,
  out: JsonDiffResult,
): void {
  out.stats.removed++;
  out.changes.push({ path, kind: 'removed', before: value });
  render(value, 'remove', depth, prefix, last, out.lines);
}

function added(
  value: unknown,
  path: string,
  depth: number,
  prefix: string,
  last: boolean,
  out: JsonDiffResult,
): void {
  out.stats.added++;
  out.changes.push({ path, kind: 'added', after: value });
  render(value, 'add', depth, prefix, last, out.lines);
}

/** Pretty-print a whole value as lines of one kind. */
function render(
  value: unknown,
  kind: Line['kind'],
  depth: number,
  prefix: string,
  last: boolean,
  lines: Line[],
): void {
  const comma = last ? '' : ',';
  const indent = INDENT.repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push({ kind, text: `${indent}${prefix}[]${comma}` });
      return;
    }
    lines.push({ kind, text: `${indent}${prefix}[` });
    value.forEach((item, index) =>
      render(item, kind, depth + 1, '', index === value.length - 1, lines),
    );
    lines.push({ kind, text: `${indent}]${comma}` });
    return;
  }
  if (isObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      lines.push({ kind, text: `${indent}${prefix}{}${comma}` });
      return;
    }
    lines.push({ kind, text: `${indent}${prefix}{` });
    keys.forEach((key, index) =>
      render(
        value[key],
        kind,
        depth + 1,
        `${JSON.stringify(key)}: `,
        index === keys.length - 1,
        lines,
      ),
    );
    lines.push({ kind, text: `${indent}}${comma}` });
    return;
  }
  lines.push({ kind, text: `${indent}${prefix}${JSON.stringify(value) ?? 'null'}${comma}` });
}

function open(bracket: string, depth: number, prefix: string, lines: Line[]): void {
  lines.push({ kind: 'equal', text: `${INDENT.repeat(depth)}${prefix}${bracket}` });
}

function close(bracket: string, depth: number, last: boolean, lines: Line[]): void {
  lines.push({ kind: 'equal', text: `${INDENT.repeat(depth)}${bracket}${last ? '' : ','}` });
}

function join(path: string, key: string): string {
  const segment = /^[A-Za-z_$][\w$]*$/.test(key) ? key : `[${JSON.stringify(key)}]`;
  return path === '' || segment.startsWith('[') ? `${path}${segment}` : `${path}.${segment}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): boolean {
  return value === null || (typeof value !== 'object' && typeof value !== 'function');
}
