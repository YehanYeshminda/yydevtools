import { parser } from '@lezer/json';

/**
 * Where a JSON document failed to parse, in a form that can be shown in place.
 *
 * Knowing a document is invalid is the easy half; the box above already said
 * so. The useful half is *where*, and `JSON.parse` is only sometimes willing to
 * tell you: V8 appends "at position 7 (line 1 column 8)" for some failures, but
 * for the two commonest — "Unexpected token 'o'" and "Unexpected end of JSON
 * input" — it gives no position at all, only a snippet of surrounding text.
 *
 * So the two halves come from two places. `JSON.parse` decides whether the
 * document is valid and supplies the wording, which is good at saying what is
 * wrong. Lezer's error-recovering JSON grammar supplies the offset: it is the
 * same parser the editor already highlights with, it marks the first token it
 * could not accept, and it does so for every malformed document rather than
 * some of them.
 */
export interface JsonProblem {
  /** The engine's message, with its position tail removed and capitalised. */
  message: string;
  /** 1-based line, or null when no parser would say where. */
  line: number | null;
  /** 1-based column, null alongside {@link line}. */
  column: number | null;
  /** The offending line's text, tabs flattened so a caret can sit under it. */
  excerpt: string;
}

/**
 * A key written more than once in the same object.
 *
 * `JSON.parse` does not complain about this; it keeps the last one and drops
 * the rest, silently. A config file with two "port" keys is the bug where
 * everything looks right and the wrong value is in effect, and nothing in the
 * pipeline ever says so.
 */
export interface DuplicateKey {
  /** The key as JSON reads it, so "a" and "\\u0061" count as the same key. */
  key: string;
  /** 1-based lines where it appears, in document order. The last one wins. */
  lines: number[];
}

/** "… in JSON at position 7 (line 1 column 8)" and the bare "position 7" form. */
const POSITION = /\bposition (\d+)/i;
/** SpiderMonkey's wording, and the parenthesised half of V8's. */
const LINE_COLUMN = /\bline (\d+) column (\d+)/i;
/** Everything an engine appends once it has said what is wrong. */
const TAIL =
  /\s*(?:in JSON )?at position \d+(?:\s*\(line \d+ column \d+\))?|\s*at line \d+ column \d+(?: of the JSON data)?/i;
/**
 * V8 pastes a slice of the document into its "Unexpected token" messages —
 * `Unexpected token 'o', ..."b": oops\n}" is not valid JSON`. It is there
 * because `JSON.parse` has no other way to show you where it was; the excerpt
 * below does that properly, so the snippet is left out rather than printed
 * twice, mangled onto one line.
 */
const SNIPPET = /,\s*\.{0,3}"[\s\S]*"\.{0,3}\s*is not valid JSON\.?$/;

/**
 * The problem with `text`, or null when it parses.
 *
 * Whitespace-only input is not a problem to report: it is a box nobody has
 * typed in yet, and an error there would shout at someone mid-paste.
 */
export function describeProblem(text: string): JsonProblem | null {
  if (text.trim() === '') {
    return null;
  }
  try {
    JSON.parse(text);
    return null;
  } catch (error) {
    return describe(error instanceof Error ? error.message : String(error), text);
  }
}

function describe(raw: string, text: string): JsonProblem {
  const at = locate(raw, text);
  const lines = text.split(/\r?\n/);
  return {
    message: clean(raw),
    line: at?.line ?? null,
    column: at?.column ?? null,
    // Tabs become single spaces so the caret lands under the right character:
    // a column counts characters, and a rendered tab is worth several.
    excerpt: at ? (lines[at.line - 1] ?? '').replace(/\t/g, ' ') : '',
  };
}

/**
 * The 1-based line and column of the failure.
 *
 * Lezer first, because it answers for every document. The engine's own position
 * is the fallback for the cases Lezer's grammar is happy to accept but
 * `JSON.parse` is not — a leading zero, say — where there is no error node to
 * find.
 */
function locate(raw: string, text: string): { line: number; column: number } | null {
  const marked = firstErrorOffset(text);
  if (marked !== null) {
    return fromOffset(text, marked);
  }
  const offset = POSITION.exec(raw);
  if (offset) {
    return fromOffset(text, Number(offset[1]));
  }
  const pair = LINE_COLUMN.exec(raw);
  if (pair) {
    return { line: Number(pair[1]), column: Number(pair[2]) };
  }
  return null;
}

/**
 * Every key written more than once within one object.
 *
 * An object is reported as it closes, so the innermost come first.
 *
 * Scoped per object, which is the whole difficulty: the same name in a sibling
 * or a nested object is not a duplicate, and a plain text search for a repeated
 * key cannot tell the difference. Lezer’s tree makes each object its own node,
 * so the scoping comes for free — and it is the same parse the error locator
 * uses, rather than a second hand-written scanner to keep correct.
 *
 * Only asked of documents that parse. A broken document has a parse error to
 * report first, and its tree is full of recovered guesses.
 */
export function findDuplicateKeys(text: string): DuplicateKey[] {
  // Nothing without an object, which also skips the scan for arrays of scalars
  // and for the empty box on every keystroke.
  if (!text.includes('{')) {
    return [];
  }
  const found: DuplicateKey[] = [];
  // One map per object currently open; the innermost is the last.
  const scopes: Map<string, number[]>[] = [];

  parser.parse(text).iterate({
    enter: (node) => {
      if (node.name === 'Object') {
        scopes.push(new Map());
        return;
      }
      if (node.name !== 'PropertyName' || scopes.length === 0) {
        return;
      }
      const key = readKey(text.slice(node.from, node.to));
      const scope = scopes[scopes.length - 1];
      const lines = scope.get(key);
      const line = lineOf(text, node.from);
      if (lines) {
        lines.push(line);
      } else {
        scope.set(key, [line]);
      }
    },
    leave: (node) => {
      if (node.name !== 'Object') {
        return;
      }
      for (const [key, lines] of scopes.pop() ?? []) {
        if (lines.length > 1) {
          found.push({ key, lines });
        }
      }
    },
  });
  return found;
}

/**
 * A PropertyName token as the key it denotes.
 *
 * Read through `JSON.parse` so escapes are resolved: "caf\\u00e9" and "café" are
 * one key to a parser, and comparing the raw tokens would miss it. Falls back
 * to the token itself if it will not parse, which only happens in a document
 * that was going to be reported broken anyway.
 */
function readKey(token: string): string {
  try {
    const parsed: unknown = JSON.parse(token);
    return typeof parsed === 'string' ? parsed : token;
  } catch {
    return token;
  }
}

/** The 1-based line a character offset falls on. */
function lineOf(text: string, offset: number): number {
  return (text.slice(0, offset).match(/\n/g)?.length ?? 0) + 1;
}

/** The start of the first token Lezer could not accept, or null if it found none. */
function firstErrorOffset(text: string): number | null {
  let first: number | null = null;
  parser.parse(text).iterate({
    enter: (node) => {
      if (first === null && node.type.isError) {
        first = node.from;
      }
    },
  });
  return first;
}

/** A 0-based character offset as a 1-based line and column. */
function fromOffset(text: string, offset: number): { line: number; column: number } {
  // Past the end is where "Unexpected end of JSON input" points; the last
  // character is the closest thing to a location that document has.
  const at = Math.min(offset, Math.max(text.length - 1, 0));
  const before = text.slice(0, at);
  const lastBreak = before.lastIndexOf('\n');
  return {
    line: (before.match(/\n/g)?.length ?? 0) + 1,
    column: at - lastBreak,
  };
}

/** The engine's sentence without its position tail, capitalised, unpunctuated. */
function clean(raw: string): string {
  const message = raw
    .replace(/^JSON\.parse:\s*/i, '')
    .replace(SNIPPET, '')
    .replace(TAIL, '')
    .trim()
    .replace(/[.,]$/, '');
  return message === ''
    ? 'That input is not valid JSON'
    : message[0].toUpperCase() + message.slice(1);
}

/**
 * The offending line with a caret under the column, as one block of text.
 *
 * Built here rather than in the template because it only lines up in a
 * fixed-width block whose leading spaces survive, and because a template that
 * has to repeat a space n times is a template doing arithmetic.
 */
export function excerptBlock(problem: JsonProblem): string {
  if (problem.line === null || problem.column === null) {
    return '';
  }
  const gutter = String(problem.line);
  const pad = ' '.repeat(gutter.length);
  return `${gutter} | ${problem.excerpt}\n${pad} | ${' '.repeat(Math.max(problem.column - 1, 0))}^`;
}
