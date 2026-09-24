import { JSONPath } from 'jsonpath-plus';

export interface PathMatch {
  /** Where the value sits, as a JSONPath: `$.store.book[0].title`. */
  path: string;
  value: unknown;
}

export interface QueryResult {
  matches: PathMatch[];
  error: string | null;
}

/**
 * Every match for `path` in `json`, each with the path that reaches it.
 *
 * Filters run in jsonpath-plus's "safe" evaluator, never through `eval`: the
 * expression arrives from a share link as readily as from the keyboard, and
 * `$..[?(@.constructor…)]` must not become a way to run code on this page.
 */
export function runQuery(json: unknown, path: string): QueryResult {
  if (path.trim() === '') {
    return { matches: [], error: null };
  }
  try {
    const results = JSONPath({
      path,
      json: json as object,
      resultType: 'all',
      wrap: true,
      eval: 'safe',
    }) as { pointer: string; value: unknown }[];
    return {
      matches: results.map((result) => ({
        path: displayPath(json, result.pointer),
        value: result.value,
      })),
      error: null,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { matches: [], error: detail.replace(/^jsonPath:\s*/i, '') };
  }
}

/**
 * A JSON Pointer (`/store/book/0/title`) as a JSONPath (`$.store.book[0].title`).
 *
 * Built from the pointer rather than jsonpath-plus's own path string, which
 * drops a `]` from a key, leaves a `'` unescaped and writes an object key "0"
 * as the index `[0]`. Walking the document is what tells an index from a key.
 */
export function displayPath(root: unknown, pointer: string): string {
  let path = '$';
  let node = root;
  const segments = pointer === '' ? [] : pointer.slice(1).split('/');
  for (const raw of segments) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(node)) {
      path += `[${key}]`;
    } else if (/^[A-Za-z_$][\w$]*$/.test(key)) {
      path += `.${key}`;
    } else {
      path += `['${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`;
    }
    node = (node as Record<string, unknown> | null)?.[key];
  }
  return path;
}
