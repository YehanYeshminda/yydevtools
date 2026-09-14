import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';

import { readPdfMetadata, stripPdfMetadata } from './pdf-metadata';

async function samplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  doc.setTitle('Budget');
  doc.setAuthor('Priya');
  doc.setCreator('Sheets');
  return doc.save();
}

describe('pdf metadata', () => {
  it('reads the Info dictionary', async () => {
    const meta = (await readPdfMetadata(await samplePdf()))!;
    expect(meta.pages).toBe(1);
    expect(meta.encrypted).toBe(false);
    expect(meta.fields).toEqual(
      expect.arrayContaining([
        { label: 'Title', value: 'Budget', identifying: false },
        { label: 'Author', value: 'Priya', identifying: true },
        { label: 'Created with', value: 'Sheets', identifying: false },
      ]),
    );
    expect(meta.fields.map((f) => f.label)).toContain('Producer');
    expect(meta.fields.map((f) => f.label)).toContain('Created');
  });

  it('strips everything and does not let pdf-lib write a producer back', async () => {
    const clean = await stripPdfMetadata(await samplePdf());
    const meta = (await readPdfMetadata(clean!))!;
    expect(meta.fields).toEqual([]);
    expect(meta.pages).toBe(1);
    expect(meta.hasXmp).toBe(false);
  });

  it('returns null for something that is not a PDF', async () => {
    expect(await readPdfMetadata(new TextEncoder().encode('hello'))).toBeNull();
  });
});
