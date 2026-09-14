/**
 * What a Word, Excel or PowerPoint file records about the people who made it,
 * and removing it without disturbing anything else in the package.
 *
 * An Office file is a ZIP, and the personal data lives in two small XML parts:
 * `docProps/core.xml` (author, last editor, dates, revision) and
 * `docProps/app.xml` (application, company, total editing time). Comments and
 * tracked changes carry author names too, but they are woven through the body
 * and cannot be removed without editing the document, so they are reported and
 * left alone.
 *
 * Stripping rewrites only those two parts and drops the embedded thumbnail;
 * every other member is re-packed byte for byte, so the document itself is
 * exactly as it was.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { compressionLevel } from '../../core/zip';

export interface OfficeField {
  label: string;
  value: string;
  /** True for fields that name a person, a company or a moment. */
  identifying: boolean;
}

export interface OfficeMetadata {
  fields: OfficeField[];
  /** Authors named in comments and tracked changes — reported, not removable here. */
  authors: string[];
  comments: number;
  revisions: number;
  hasThumbnail: boolean;
}

/** core.xml elements, in display order. */
const CORE: [string, string, boolean][] = [
  ['dc:title', 'Title', false],
  ['dc:subject', 'Subject', false],
  ['dc:creator', 'Author', true],
  ['cp:lastModifiedBy', 'Last modified by', true],
  ['cp:keywords', 'Keywords', false],
  ['dc:description', 'Description', false],
  ['cp:category', 'Category', false],
  ['cp:contentStatus', 'Status', false],
  ['cp:revision', 'Revision', false],
  ['dcterms:created', 'Created', true],
  ['dcterms:modified', 'Modified', true],
  ['cp:lastPrinted', 'Last printed', true],
];

/** app.xml elements worth showing. */
const APP: [string, string, boolean][] = [
  ['Application', 'Application', false],
  ['AppVersion', 'Application version', false],
  ['Company', 'Company', true],
  ['Manager', 'Manager', true],
  ['TotalTime', 'Total editing time (minutes)', true],
  ['Template', 'Template', false],
  ['Pages', 'Pages', false],
  ['Slides', 'Slides', false],
  ['Words', 'Words', false],
  ['Characters', 'Characters', false],
  ['Paragraphs', 'Paragraphs', false],
];

/** The app.xml elements the stripper removes; the counts are harmless. */
const APP_PRIVATE = ['Company', 'Manager', 'TotalTime', 'Template'];

const PARTS =
  /^(docProps\/(core|app)\.xml|word\/(document|comments)\.xml|xl\/comments\d*\.xml|ppt\/comments\/.*\.xml|ppt\/commentAuthors\.xml|docProps\/thumbnail\.[a-z]+)$/;

/** Reads the metadata, or null when the bytes are not an Office package. */
export function readOfficeMetadata(bytes: Uint8Array): OfficeMetadata | null {
  let parts: Record<string, Uint8Array>;
  try {
    parts = unzipSync(bytes, { filter: (file) => PARTS.test(file.name) });
  } catch {
    return null;
  }
  const xml = (name: string) => (parts[name] ? strFromU8(parts[name]) : '');
  const core = xml('docProps/core.xml');
  const app = xml('docProps/app.xml');
  if (!core && !app && !parts['word/document.xml']) {
    return null;
  }

  const fields: OfficeField[] = [];
  for (const [tag, label, identifying] of CORE) {
    const value = element(core, tag);
    if (value) {
      fields.push({ label, value, identifying });
    }
  }
  for (const [tag, label, identifying] of APP) {
    const value = element(app, tag);
    if (value) {
      fields.push({ label, value, identifying });
    }
  }

  const authors = new Set<string>();
  let comments = 0;
  let revisions = 0;
  for (const [name, data] of Object.entries(parts)) {
    if (!/comment/i.test(name) && name !== 'word/document.xml') {
      continue;
    }
    const body = strFromU8(data);
    if (name === 'word/document.xml') {
      const changes = body.match(/<w:(ins|del) [^>]*w:author="([^"]*)"/g) ?? [];
      revisions += changes.length;
      for (const change of changes) {
        authors.add(decode(/w:author="([^"]*)"/.exec(change)?.[1] ?? ''));
      }
      continue;
    }
    comments += (body.match(/<(w:comment|comment|p:cm) /g) ?? []).length;
    for (const match of body.matchAll(/(?:w:author|name)="([^"]*)"|<author>([^<]*)<\/author>/g)) {
      authors.add(decode(match[1] ?? match[2] ?? ''));
    }
  }
  authors.delete('');

  return {
    fields,
    authors: [...authors],
    comments,
    revisions,
    hasThumbnail: Object.keys(parts).some((name) => name.startsWith('docProps/thumbnail.')),
  };
}

/**
 * A copy with the identifying properties and the thumbnail removed, or null
 * when there was nothing to remove. Comments and tracked changes stay.
 */
export function stripOfficeMetadata(bytes: Uint8Array): Uint8Array | null {
  let parts: Record<string, Uint8Array>;
  try {
    parts = unzipSync(bytes);
  } catch {
    return null;
  }
  let changed = false;

  if (parts['docProps/core.xml']) {
    const before = strFromU8(parts['docProps/core.xml']);
    const after = CORE.reduce((xml, [tag]) => remove(xml, tag), before);
    if (after !== before) {
      parts['docProps/core.xml'] = strToU8(after);
      changed = true;
    }
  }
  if (parts['docProps/app.xml']) {
    const before = strFromU8(parts['docProps/app.xml']);
    const after = APP_PRIVATE.reduce((xml, tag) => remove(xml, tag), before);
    if (after !== before) {
      parts['docProps/app.xml'] = strToU8(after);
      changed = true;
    }
  }
  const thumbnail = Object.keys(parts).find((name) => name.startsWith('docProps/thumbnail.'));
  if (thumbnail && parts['_rels/.rels']) {
    delete parts[thumbnail];
    parts['_rels/.rels'] = strToU8(
      strFromU8(parts['_rels/.rels']).replace(/<Relationship\b[^>]*\/thumbnail"[^>]*\/>/, ''),
    );
    changed = true;
  }
  if (!changed) {
    return null;
  }

  const zippable: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const [name, data] of Object.entries(parts)) {
    zippable[name] = [data, { level: compressionLevel(name) }];
  }
  return zipSync(zippable);
}

function element(xml: string, tag: string): string {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`).exec(xml);
  return match ? decode(match[1]).trim() : '';
}

function remove(xml: string, tag: string): string {
  return xml.replace(
    new RegExp(`<${tag}(?:\\s[^>]*)?>[^<]*</${tag}>|<${tag}(?:\\s[^>]*)?/>`, 'g'),
    '',
  );
}

function decode(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}
