import { PDFDocument } from '@cantoo/pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';

import { looksLikePdf, readPageCount } from './pdf-probe';

/**
 * The probe replaces a full PDF library, so the thing worth testing is that it
 * agrees with one. Every fixture here is built with pdf-lib and then read back
 * with nothing but the probe.
 *
 * Both save modes matter: `useObjectStreams: false` writes the page tree in
 * plain text, which is the easy path, while the default packs it into a
 * compressed object stream that only the inflate fallback can see. Real
 * documents come in both shapes.
 */
async function makePdf(pages: number, useObjectStreams: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pages; index++) {
    doc.addPage([300, 400]);
  }
  return doc.save({ useObjectStreams });
}

describe('looksLikePdf', () => {
  it('accepts a real PDF', async () => {
    expect(looksLikePdf(await makePdf(1, false))).toBe(true);
  });

  it('accepts a header sitting behind leading junk', () => {
    const bytes = new TextEncoder().encode(`${' '.repeat(200)}%PDF-1.7\n`);
    expect(looksLikePdf(bytes)).toBe(true);
  });

  it('rejects a file with no header', () => {
    expect(looksLikePdf(new TextEncoder().encode('PK not a pdf'))).toBe(false);
  });

  it('rejects a header buried past the search window', () => {
    const bytes = new TextEncoder().encode(`${' '.repeat(4000)}%PDF-1.7\n`);
    expect(looksLikePdf(bytes)).toBe(false);
  });

  it('rejects an empty file', () => {
    expect(looksLikePdf(new Uint8Array())).toBe(false);
  });
});

describe('readPageCount', () => {
  describe.each([
    { label: 'plain page tree', useObjectStreams: false },
    { label: 'compressed object streams', useObjectStreams: true },
  ])('$label', ({ useObjectStreams }) => {
    it.each([1, 2, 7, 64])('reads %i pages', async (pages) => {
      expect(await readPageCount(await makePdf(pages, useObjectStreams))).toBe(pages);
    });
  });

  it('is not fooled by an outline /Count larger than the page count', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    doc.addPage([300, 400]);
    const bytes = await doc.save({ useObjectStreams: false });

    // Splice in an outline dictionary claiming far more entries than there are
    // pages. /Count means something different there, and must be ignored.
    const outline = new TextEncoder().encode(
      '\n99 0 obj\n<< /Type /Outlines /Count 500 /First 100 0 R >>\nendobj\n',
    );
    const spliced = new Uint8Array(bytes.length + outline.length);
    spliced.set(bytes.subarray(0, bytes.length - 6));
    spliced.set(outline, bytes.length - 6);
    spliced.set(bytes.subarray(bytes.length - 6), bytes.length - 6 + outline.length);

    expect(await readPageCount(spliced)).toBe(2);
  });

  it('returns null rather than guessing when there is no page tree', async () => {
    expect(
      await readPageCount(new TextEncoder().encode('%PDF-1.7\ntrailer<<>>\n%%EOF')),
    ).toBeNull();
  });
});

describe('agreement with pdf-lib', () => {
  let fixtures: Array<{ bytes: Uint8Array; expected: number }>;

  beforeAll(async () => {
    fixtures = await Promise.all(
      [1, 3, 12, 40].flatMap((pages) =>
        [true, false].map(async (useObjectStreams) => ({
          bytes: await makePdf(pages, useObjectStreams),
          expected: pages,
        })),
      ),
    );
  });

  it('matches getPageCount() on every fixture', async () => {
    for (const { bytes, expected } of fixtures) {
      const viaLibrary = (await PDFDocument.load(bytes)).getPageCount();
      expect(viaLibrary).toBe(expected);
      expect(await readPageCount(bytes)).toBe(viaLibrary);
    }
  });
});
