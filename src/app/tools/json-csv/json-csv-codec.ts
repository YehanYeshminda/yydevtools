/**
 * JSON to CSV and back, as pure functions over text.
 *
 * The two shapes do not map one-to-one — CSV is flat, JSON is not — so the
 * rules that bridge them are the whole tool: nested objects become dot-path
 * columns (`address.city`) and are folded back on the way in, arrays of
 * scalars are written as JSON inside the cell, and column order is the order
 * keys were first seen, which is the order people wrote them in.
 */
import Papa from 'papaparse';

import { normaliseHeaders } from '../csv-viewer/csv-tools';

export type Direction = 'to-csv' | 'to-json';
export type Choice = 'auto' | Direction;
export type Delimiter = ',' | ';' | '\t';

export interface Options {
  /** For CSV output. Input CSV is sniffed. */
  delimiter: Delimiter;
  /** For JSON output: turn "42" and "true" into numbers and booleans. */
  typed: boolean;
}

export interface Conversion {
  direction: Direction;
  output: string;
  error: string | null;
  rows: number;
  columns: number;
}

/** JSON starts with a bracket or a brace; anything else is treated as CSV. */
export function detect(text: string): Direction {
  return /^[[{]/.test(text.trimStart()) ? 'to-csv' : 'to-json';
}

export function convert(text: string, choice: Choice, options: Options): Conversion {
  const direction = choice === 'auto' ? detect(text) : choice;
  if (text.trim() === '') {
    return { direction, output: '', error: null, rows: 0, columns: 0 };
  }
  return direction === 'to-csv' ? jsonToCsv(text, options) : csvToJson(text, options);
}

// --- JSON → CSV ------------------------------------------------------------

type Scalar = string | number | boolean | null;
type Row = Record<string, Scalar>;

function jsonToCsv(text: string, options: Options): Conversion {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return fail('to-csv', `Not valid JSON: ${(error as Error).message}`);
  }

  const items = asList(value);
  if (items === null) {
    return fail('to-csv', 'Expected an array of objects, or one object.');
  }

  // Arrays of arrays are already a table: no headers to invent.
  if (items.every(Array.isArray)) {
    const data = (items as unknown[][]).map((row) => row.map(cell));
    const columns = Math.max(0, ...data.map((row) => row.length));
    return ok('to-csv', unparse(data, options), data.length, columns);
  }

  const rows: Row[] = items.map((item) => flatten(item));
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  const data = rows.map((row) => columns.map((column) => row[column] ?? ''));
  return ok('to-csv', unparse([columns, ...data], options), rows.length, columns.length);
}

/** One object is one row; an array is many; a scalar list is a `value` column. */
function asList(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value.map((item) => (isObject(item) || Array.isArray(item) ? item : { value: item }));
  }
  return isObject(value) ? [value] : null;
}

/** `{ a: { b: 1 } }` becomes `{ "a.b": 1 }`; arrays of scalars stay as one cell. */
function flatten(value: unknown, prefix = '', into: Row = {}): Row {
  if (!isObject(value)) {
    into[prefix || 'value'] = cell(value);
    return into;
  }
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isObject(child)) {
      flatten(child, path, into);
    } else {
      into[path] = cell(child);
    }
  }
  return into;
}

function cell(value: unknown): Scalar {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value as Scalar;
}

function unparse(data: Scalar[][], options: Options): string {
  return Papa.unparse(data, { delimiter: options.delimiter, newline: '\n' });
}

// --- CSV → JSON ------------------------------------------------------------

function csvToJson(text: string, options: Options): Conversion {
  const parsed = Papa.parse<unknown[]>(text, {
    dynamicTyping: options.typed,
    skipEmptyLines: 'greedy',
  });
  const blocking = parsed.errors.find((error) => error.type !== 'FieldMismatch');
  if (blocking) {
    const where = blocking.row === undefined ? '' : ` (row ${blocking.row + 1})`;
    return fail('to-json', `${blocking.message}${where}.`);
  }
  const [head, ...body] = parsed.data;
  if (!head) {
    return fail('to-json', 'No rows found.');
  }
  const headers = normaliseHeaders(head.map((name) => String(name ?? '')));
  const objects = body.map((row) => {
    const object: Record<string, unknown> = {};
    headers.forEach((name, index) => {
      object[name] = row[index] ?? '';
    });
    return unflatten(object);
  });
  return ok('to-json', JSON.stringify(objects, null, 2), objects.length, headers.length);
}

/** The inverse of `flatten`: `address.city` goes back inside `address`. */
function unflatten(flat: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(flat)) {
    const keys = path.split('.');
    let target = out;
    for (const key of keys.slice(0, -1)) {
      const next = target[key];
      if (!isObject(next)) {
        target[key] = {};
      }
      target = target[key] as Record<string, unknown>;
    }
    target[keys[keys.length - 1]] = value;
  }
  return out;
}

// --- Helpers ----------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ok(direction: Direction, output: string, rows: number, columns: number): Conversion {
  return { direction, output, error: null, rows, columns };
}

function fail(direction: Direction, error: string): Conversion {
  return { direction, output: '', error, rows: 0, columns: 0 };
}
