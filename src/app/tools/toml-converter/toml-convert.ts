import { TomlError, parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { YAMLParseError, parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { describeProblem } from '../json-formatter/json-problem';

export type Format = 'toml' | 'json' | 'yaml';

export interface ConvertProblem {
  message: string;
  line: number | null;
  column: number | null;
}

export type ConvertResult =
  | { output: string; warnings: string[]; problem: null }
  | { output: ''; warnings: []; problem: ConvertProblem };

/**
 * `text` in `from`, rewritten as `to`.
 *
 * The three formats do not hold quite the same things, and the differences are
 * where a converter quietly loses data — so each one is either carried across
 * or said out loud:
 * - TOML has no null. A null key would simply vanish, so it is named in a
 *   warning; a null inside an array cannot be written at all and is an error.
 * - JSON has no inf or nan; they become null, with a warning.
 * - Integers past 2^53 are read from TOML as BigInt and written back as the
 *   same digits, not rounded to the nearest double.
 * - TOML dates keep the form they were written in (a local date stays a date).
 */
export function convert(text: string, from: Format, to: Format): ConvertResult {
  if (text.trim() === '') {
    return { output: '', warnings: [], problem: null };
  }
  let value: unknown;
  try {
    value = read(text, from);
  } catch (error) {
    return failed(readProblem(error, text, from));
  }
  try {
    const warnings: string[] = [];
    return { output: write(value, to, warnings), warnings, problem: null };
  } catch (error) {
    return failed({ message: (error as Error).message, line: null, column: null });
  }
}

function read(text: string, from: Format): unknown {
  switch (from) {
    case 'toml':
      return parseToml(text, { integersAsBigInt: 'asNeeded' });
    case 'json':
      return JSON.parse(text);
    case 'yaml':
      return parseYaml(text);
  }
}

function write(value: unknown, to: Format, warnings: string[]): string {
  switch (to) {
    case 'toml': {
      if (!isTable(value)) {
        throw new Error(
          'TOML needs a table at the top level. Put the value under a key first, e.g. {"items": [...]}.',
        );
      }
      const dropped = nullKeys(value, '');
      if (dropped.length) {
        warnings.push(`TOML has no null, so ${list(dropped)} ${dropped.length === 1 ? 'was' : 'were'} left out.`);
      }
      return stringifyToml(value);
    }
    case 'json': {
      let lost = 0;
      const json = JSON.stringify(
        value,
        (_key, item: unknown) => {
          if (typeof item === 'bigint') {
            // The exact digits as a JSON number, where the browser can write one.
            return rawJson?.(item.toString()) ?? item.toString();
          }
          if (typeof item === 'number' && !Number.isFinite(item)) {
            lost++;
          }
          return item;
        },
        2,
      );
      if (lost) {
        warnings.push(`JSON has no inf or nan, so ${lost === 1 ? 'one value was' : `${lost} values were`} written as null.`);
      }
      return json;
    }
    case 'yaml':
      return stringifyYaml(value);
  }
}

const rawJson = (JSON as { rawJSON?: (text: string) => unknown }).rawJSON;

function isTable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/**
 * The keys holding null, which TOML would leave out without a word. A null in
 * an array is found too — smol-toml refuses those, so it becomes a clear error.
 */
function nullKeys(value: unknown, path: string): string[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (item === null || item === undefined) {
        throw new Error(`TOML arrays cannot hold null, and ${path}[${index}] is null.`);
      }
    });
    return value.flatMap((item, index) => nullKeys(item, `${path}[${index}]`));
  }
  if (!isTable(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, item]) => {
    const at = path ? `${path}.${key}` : key;
    return item === null ? [at] : nullKeys(item, at);
  });
}

function list(keys: string[]): string {
  const shown = keys.slice(0, 5).map((key) => `"${key}"`);
  return keys.length > 5 ? `${shown.join(', ')} and ${keys.length - 5} more` : shown.join(', ');
}

function readProblem(error: unknown, text: string, from: Format): ConvertProblem {
  if (error instanceof TomlError) {
    const message = error.message.split('\n')[0].replace(/^Invalid TOML document:\s*/i, '');
    return { message: capitalise(message), line: error.line, column: error.column };
  }
  if (error instanceof YAMLParseError) {
    const at = error.linePos?.[0];
    return {
      message: error.message.split('\n')[0].replace(/ at line \d+, column \d+:?$/, ''),
      line: at?.line ?? null,
      column: at?.col ?? null,
    };
  }
  if (from === 'json') {
    const problem = describeProblem(text);
    if (problem) {
      return { message: problem.message, line: problem.line, column: problem.column };
    }
  }
  return { message: (error as Error).message, line: null, column: null };
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function failed(problem: ConvertProblem): ConvertResult {
  return { output: '', warnings: [], problem };
}
