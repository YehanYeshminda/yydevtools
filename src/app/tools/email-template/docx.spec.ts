import { unzipSync, strFromU8 } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';

import { parseDraft, type Draft } from './draft';
import { renderDocx } from './docx';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const draft = (text: string) => parseDraft(text, { infer: true });

/**
 * Unzip the result and parse every part.
 *
 * This is as close to opening the file in Word as a test can get without Word:
 * if the archive is malformed, or any part is not well-formed XML, it fails
 * here rather than in a dialog that says only "unreadable content".
 */
async function open(source: Draft | string) {
  const bytes = await renderDocx(typeof source === 'string' ? draft(source) : source);
  const files = unzipSync(bytes);
  const parser = new DOMParser();
  const docs: Record<string, Document> = {};
  for (const [name, content] of Object.entries(files)) {
    const xml = parser.parseFromString(strFromU8(content), 'text/xml');
    const failure = xml.getElementsByTagName('parsererror')[0];
    if (failure) {
      throw new Error(`${name} is not well-formed: ${failure.textContent}`);
    }
    docs[name] = xml;
  }
  return { names: Object.keys(files), text: (n: string) => strFromU8(files[n]), docs };
}

describe('renderDocx — the package', () => {
  it('holds the six parts Word looks for, content types first', async () => {
    const { names } = await open('Hello.');
    expect(names).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
      'word/_rels/document.xml.rels',
      'word/styles.xml',
      'word/numbering.xml',
    ]);
  });

  it('parses as XML in every part', async () => {
    // open() throws on a parser error, so reaching the assertion is the test.
    const { docs } = await open('# Title\n\nHi Ada,\n\n- one\n- two\n\nThanks');
    expect(Object.keys(docs)).toHaveLength(6);
  });

  it('declares document.xml as the main part', async () => {
    const { text } = await open('Hello.');
    expect(text('[Content_Types].xml')).toContain(
      'wordprocessingml.document.main+xml',
    );
  });

  it('points the package at the document', async () => {
    const { text } = await open('Hello.');
    expect(text('_rels/.rels')).toContain('Target="word/document.xml"');
  });

  it('opens even when there is nothing to say', async () => {
    // A body with no paragraph in it is a damaged file, not a blank page.
    const { docs } = await open('');
    const body = docs['word/document.xml'].getElementsByTagNameNS(W, 'body')[0];
    expect(body.getElementsByTagNameNS(W, 'p')).not.toHaveLength(0);
  });
});

describe('renderDocx — relationships', () => {
  it('resolves every r:id it refers to', async () => {
    // An id with no entry behind it is a corrupt file, not a dead link — this
    // is the single easiest way to produce one by hand.
    const { docs } = await open('See [the docs](https://example.com/a) and [more](https://example.com/b).');
    const doc = docs['word/document.xml'];
    const rels = docs['word/_rels/document.xml.rels'];

    const declared = new Set(
      [...rels.getElementsByTagName('Relationship')].map((rel) => rel.getAttribute('Id')),
    );
    const used = [...doc.getElementsByTagNameNS(W, 'hyperlink')].map((link) =>
      link.getAttributeNS(R, 'id'),
    );

    expect(used).toHaveLength(2);
    for (const id of used) {
      expect(declared.has(id), `${id} has no relationship`).toBe(true);
    }
  });

  it('never issues one id twice', async () => {
    // The check that matters, and the one "does every id resolve?" cannot make:
    // both sides of that come from the same generator, so they agree even when
    // the numbering is wrong. Hyperlinks are numbered from *after* the fixed
    // styles and numbering relationships; overlap puts two relationships under
    // one id, which is a corrupt package that still reads plausibly in a diff.
    const { docs } = await open('[a](https://example.com/a) and [b](https://example.com/b)');
    const ids = [
      ...docs['word/_rels/document.xml.rels'].getElementsByTagName('Relationship'),
    ].map((rel) => rel.getAttribute('Id'));
    expect(new Set(ids).size, `duplicate id among ${ids.join(', ')}`).toBe(ids.length);
  });

  it('leaves the fixed styles and numbering relationships where they belong', async () => {
    const { docs } = await open('[a](https://example.com/a)');
    const byId = new Map(
      [...docs['word/_rels/document.xml.rels'].getElementsByTagName('Relationship')].map(
        (rel) => [rel.getAttribute('Id'), rel.getAttribute('Type')] as const,
      ),
    );
    expect(byId.get('rId1')).toContain('/styles');
    expect(byId.get('rId2')).toContain('/numbering');
  });

  it('marks link relationships external, or Word looks for a local file', async () => {
    const { text } = await open('[docs](https://example.com/a)');
    expect(text('word/_rels/document.xml.rels')).toContain('TargetMode="External"');
  });

  it('writes one relationship for a target used twice', async () => {
    const { docs } = await open('[one](https://example.com/x) and [two](https://example.com/x)');
    const rels = [...docs['word/_rels/document.xml.rels'].getElementsByTagName('Relationship')];
    const links = rels.filter((rel) => rel.getAttribute('TargetMode') === 'External');
    expect(links).toHaveLength(1);
  });

  it('drops a link a client should not open, and keeps the words', async () => {
    const { docs, text } = await open('[Click me](javascript:alert(1))');
    expect(docs['word/document.xml'].getElementsByTagNameNS(W, 'hyperlink')).toHaveLength(0);
    expect(text('word/_rels/document.xml.rels')).not.toContain('javascript:');
    expect(text('word/document.xml')).toContain('Click me');
  });
});

describe('renderDocx — the content', () => {
  it('makes the subject the first heading', async () => {
    const { docs } = await open('Subject: Quarterly update\n\nAll is well.');
    const first = docs['word/document.xml'].getElementsByTagNameNS(W, 'p')[0];
    const style = first.getElementsByTagNameNS(W, 'pStyle')[0];
    expect(style.getAttributeNS(W, 'val')).toBe('Heading1');
  });

  it('gives bullets and numbers different list definitions', async () => {
    const bullets = await open('- one\n- two');
    const numbers = await open('1. one\n2. two');
    const numId = (docs: Record<string, Document>) =>
      docs['word/document.xml']
        .getElementsByTagNameNS(W, 'numId')[0]
        .getAttributeNS(W, 'val');
    expect(numId(bullets.docs)).toBe('1');
    expect(numId(numbers.docs)).toBe('2');
  });

  it('defines both list formats in numbering.xml', async () => {
    const { text } = await open('- one');
    expect(text('word/numbering.xml')).toContain('w:numFmt w:val="bullet"');
    expect(text('word/numbering.xml')).toContain('w:numFmt w:val="decimal"');
  });

  it('keeps a hard-wrapped line as a break in one paragraph', async () => {
    const { docs } = await open('Thanks,\nAda');
    const paragraphs = docs['word/document.xml'].getElementsByTagNameNS(W, 'p');
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].getElementsByTagNameNS(W, 'br')).toHaveLength(1);
  });

  it('carries bold and italic as run properties', async () => {
    const { docs } = await open('A **bold** and an *italic* word.');
    const doc = docs['word/document.xml'];
    expect(doc.getElementsByTagNameNS(W, 'b')).not.toHaveLength(0);
    expect(doc.getElementsByTagNameNS(W, 'i')).not.toHaveLength(0);
  });
});

describe('renderDocx — text Word would otherwise choke on', () => {
  let escaped: Awaited<ReturnType<typeof open>>;

  beforeAll(async () => {
    escaped = await open('a & b, 3 < 4, and a "quote"');
  });

  it('escapes the markup characters', () => {
    const raw = escaped.text('word/document.xml');
    expect(raw).toContain('&amp;');
    expect(raw).toContain('&lt;');
  });

  it('round-trips the text through a parser unchanged', () => {
    const text = [...escaped.docs['word/document.xml'].getElementsByTagNameNS(W, 't')]
      .map((node) => node.textContent)
      .join('');
    expect(text).toBe('a & b, 3 < 4, and a "quote"');
  });

  it('preserves the space a run begins or ends with', async () => {
    // Without xml:space, Word silently drops it and words run together.
    const { docs } = await open('one **two** three');
    const runs = [...docs['word/document.xml'].getElementsByTagNameNS(W, 't')];
    expect(runs.every((run) => run.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'space') === 'preserve')).toBe(true);
    expect(runs.map((run) => run.textContent).join('')).toBe('one two three');
  });

  it('drops control characters XML cannot carry', async () => {
    // A vertical tab comes through a paste from a PDF and makes the file
    // unopenable rather than merely odd.
    const { docs } = await open(`before${String.fromCharCode(0x0b)}after`);
    const text = [...docs['word/document.xml'].getElementsByTagNameNS(W, 't')]
      .map((node) => node.textContent)
      .join('');
    expect(text).toBe('beforeafter');
  });

  it('drops half an emoji', async () => {
    // A lone surrogate is not a character; it is what a truncated paste leaves
    // behind, and it is not representable in XML at all.
    const { docs } = await open(`hi \ud83d there`);
    const text = [...docs['word/document.xml'].getElementsByTagNameNS(W, 't')]
      .map((node) => node.textContent)
      .join('');
    expect(text).toBe('hi  there');
  });

  it('keeps a whole emoji', async () => {
    const { docs } = await open('hi \u{1f600} there');
    const text = [...docs['word/document.xml'].getElementsByTagNameNS(W, 't')]
      .map((node) => node.textContent)
      .join('');
    expect(text).toContain('\u{1f600}');
  });
});
