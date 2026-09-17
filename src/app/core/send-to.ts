import { encodeState } from './tool-state';

/**
 * Tools that can receive text from another tool.
 *
 * "Send to" needs no new mechanism: every one of these already restores itself
 * from an `#s=` fragment on load (see tool-state.ts), so handing work across is
 * just building that URL. All this table adds is which key each tool keeps its
 * main text under, because they disagree — `input`, `source`, `text`,
 * `original`.
 *
 * Only text tools are here. The image and PDF tools chain conceptually but not
 * through a URL, since a file cannot travel in a fragment.
 */
export interface SendTarget {
  /** Route slug under /tools. */
  slug: string;
  label: string;
  /** The state key this tool reads its main text from. */
  field: string;
}

export const SEND_TARGETS: readonly SendTarget[] = [
  { slug: 'json-formatter', label: 'JSON Formatter', field: 'input' },
  { slug: 'json-to-types', label: 'JSON to Types', field: 'input' },
  { slug: 'xml-viewer', label: 'XML Viewer', field: 'source' },
  { slug: 'sql-formatter', label: 'SQL Formatter', field: 'input' },
  { slug: 'code-formatter', label: 'Code Formatter', field: 'input' },
  { slug: 'markdown-editor', label: 'Markdown Editor', field: 'source' },
  { slug: 'html-preview', label: 'HTML Preview', field: 'source' },
  { slug: 'json-csv', label: 'JSON ↔ CSV', field: 'input' },
  { slug: 'url-encoder', label: 'URL Encoder', field: 'input' },
  { slug: 'base64-converter', label: 'Base64 Converter', field: 'text' },
  { slug: 'text-cleaner', label: 'Text Cleaner', field: 'input' },
  { slug: 'case-converter', label: 'Case Converter', field: 'input' },
  { slug: 'text-diff', label: 'Text Diff', field: 'original' },
  { slug: 'json-diff', label: 'JSON Diff', field: 'original' },
  { slug: 'regex-tester', label: 'Regex Tester', field: 'text' },
  { slug: 'word-counter', label: 'Word Counter', field: 'text' },
];

/**
 * The fragment that makes `target` open with `text` already in it, or null if
 * it will not encode (see encodeState) — the caller should then do nothing
 * rather than navigate to a tool that silently drops the payload.
 */
export function sendFragment(target: SendTarget, text: string): string | null {
  const encoded = encodeState({ [target.field]: text });
  return encoded === null ? null : `s=${encoded}`;
}
