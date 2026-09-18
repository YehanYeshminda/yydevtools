import { PDFDocument, PDFName, StandardFonts, type PDFDict } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';

import { EditablePdf } from './document';

/**
 * These go the whole way round: a document is built, opened for editing,
 * changed, saved, and opened again from the saved bytes. Reading the result
 * back through the same walker is what makes the check meaningful — an edit
 * that only looks right in memory has not been written.
 */
async function build(content: string, size: [number, number] = [400, 300]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(size);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.node.set(
    PDFName.of('Resources'),
    doc.context.obj({ Font: { F1: font.ref, F2: bold.ref } }) as PDFDict,
  );
  page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.stream(content)));
  return doc.save({ useObjectStreams: false });
}

const THREE_LINES = `BT /F1 12 Tf 1 0 0 1 40 250 Tm (Invoice 1024) Tj ET
BT /F2 12 Tf 1 0 0 1 40 220 Tm (Acme Limited) Tj ET
BT /F1 12 Tf 1 0 0 1 40 190 Tm (Total 480.00) Tj ET`;

/** Opens saved bytes again and returns what each run now says, with its place. */
async function reread(bytes: Uint8Array): Promise<Array<{ text: string; x: number; y: number }>> {
  const pdf = await EditablePdf.open(bytes);
  return pdf.runs(0).map((run) => ({
    text: run.text,
    x: Number(run.x.toFixed(2)),
    y: Number(run.y.toFixed(2)),
  }));
}

describe('editing a run', () => {
  it('changes what the document says, and nothing else about it', async () => {
    const pdf = await EditablePdf.open(await build(THREE_LINES));
    const runs = pdf.runs(0);
    expect(runs.map((run) => run.text)).toEqual(['Invoice 1024', 'Acme Limited', 'Total 480.00']);

    pdf.setText(0, runs[0], 'Invoice 2087');
    const after = await reread(await pdf.save());
    expect(after.map((run) => run.text)).toEqual(['Invoice 2087', 'Acme Limited', 'Total 480.00']);
    // The two lines nobody touched are exactly where they were.
    expect(after.slice(1)).toEqual([
      { text: 'Acme Limited', x: 40, y: 220 },
      { text: 'Total 480.00', x: 40, y: 190 },
    ]);
  });

  it('keeps the edited run on its own baseline', async () => {
    const pdf = await EditablePdf.open(await build(THREE_LINES));
    pdf.setText(0, pdf.runs(0)[1], 'A much longer company name');
    const after = await reread(await pdf.save());
    expect(after[1]).toEqual({ text: 'A much longer company name', x: 40, y: 220 });
  });

  it('takes a run off the page when the text is emptied', async () => {
    const pdf = await EditablePdf.open(await build(THREE_LINES));
    pdf.setText(0, pdf.runs(0)[1], '');
    const after = await reread(await pdf.save());
    expect(after.map((run) => run.text)).toEqual(['Invoice 1024', '', 'Total 480.00']);
  });

  it('reports a change and then forgets it when the text is put back', async () => {
    const pdf = await EditablePdf.open(await build(THREE_LINES));
    const run = pdf.runs(0)[0];
    pdf.setText(0, run, 'Invoice 9');
    expect(pdf.changeCount).toBe(1);
    expect(pdf.edited(run)).toBe(true);
    expect(pdf.textOf(run)).toBe('Invoice 9');

    pdf.setText(0, run, 'Invoice 1024');
    expect(pdf.changeCount).toBe(0);
    expect(pdf.edited(run)).toBe(false);
  });

  it('holds several edits at once without them treading on each other', async () => {
    const pdf = await EditablePdf.open(await build(THREE_LINES));
    const runs = pdf.runs(0);
    pdf.setText(0, runs[0], 'Invoice 7');
    pdf.setText(0, runs[2], 'Total 9.99');
    const after = await reread(await pdf.save());
    expect(after.map((run) => run.text)).toEqual(['Invoice 7', 'Acme Limited', 'Total 9.99']);
  });

  it('leaves the rest of the line where it was when a word grows', async () => {
    // One text object, three shows, each leaning on the pen the last left.
    const chained = 'BT /F1 12 Tf 1 0 0 1 40 250 Tm (one ) Tj (two ) Tj (three) Tj ET';
    const pdf = await EditablePdf.open(await build(chained));
    const before = pdf.runs(0).map((run) => Number(run.x.toFixed(2)));
    pdf.setText(0, pdf.runs(0)[1], 'a far longer middle ');
    const after = await reread(await pdf.save());
    expect(after.map((run) => run.text)).toEqual(['one ', 'a far longer middle ', 'three']);
    expect(after.map((run) => run.x)).toEqual(before);
  });
});

describe('planning an edit', () => {
  it('says the run can be written in its own font', async () => {
    const pdf = await EditablePdf.open(await build(THREE_LINES));
    const plan = pdf.plan(0, pdf.runs(0)[0], 'Invoice 2087');
    expect(plan.kind).toBe('same-font');
  });

  it('measures how much wider the new text would be', async () => {
    const pdf = await EditablePdf.open(await build(THREE_LINES));
    const run = pdf.runs(0)[0];
    const plan = pdf.plan(0, run, `${run.text} and more`);
    expect(plan.kind).toBe('same-font');
    expect(plan.kind === 'same-font' ? plan.overrun : 0).toBeGreaterThan(0);
  });

  it('refuses text no font here could carry', async () => {
    const pdf = await EditablePdf.open(await build(THREE_LINES));
    const plan = pdf.plan(0, pdf.runs(0)[0], 'Invoice 日本');
    expect(plan).toEqual({ kind: 'refused', missing: ['日', '本'] });
    expect(() => pdf.setText(0, pdf.runs(0)[0], 'Invoice 日本')).toThrow();
  });
});

describe('adding text', () => {
  it('puts a new line on the page where it was asked for', async () => {
    const pdf = await EditablePdf.open(await build(THREE_LINES));
    pdf.addText({
      page: 0,
      text: 'Paid in full',
      x: 40,
      y: 160,
      size: 12,
      color: '#cc0000',
      bold: false,
    });
    expect(pdf.changeCount).toBe(1);
    const after = await reread(await pdf.save());
    expect(after).toContainEqual({ text: 'Paid in full', x: 40, y: 160 });
  });

  it('draws an added line once however many times it is saved', async () => {
    const pdf = await EditablePdf.open(await build(THREE_LINES));
    pdf.addText({
      page: 0,
      text: 'Paid in full',
      x: 40,
      y: 160,
      size: 12,
      color: '#000000',
      bold: false,
    });
    await pdf.save();
    const after = await reread(await pdf.save());
    expect(after.filter((run) => run.text === 'Paid in full')).toHaveLength(1);
  });

  it('drops an addition that is taken back', async () => {
    const pdf = await EditablePdf.open(await build(THREE_LINES));
    const item = { page: 0, text: 'oops', x: 10, y: 10, size: 8, color: '#000000', bold: false };
    pdf.addText(item);
    pdf.removeAdded(0);
    expect(pdf.additions).toEqual([]);
    const after = await reread(await pdf.save());
    expect(after.map((run) => run.text)).not.toContain('oops');
  });
});

describe('a page whose content is split across streams', () => {
  it('reads it as one and writes it back as one', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.node.set(PDFName.of('Resources'), doc.context.obj({ Font: { F1: font.ref } }) as PDFDict);
    // The split falls between two operators, which is where the spec allows it.
    page.node.set(
      PDFName.of('Contents'),
      doc.context.obj([
        doc.context.register(doc.context.stream('BT /F1 12 Tf 1 0 0 1 20 200 Tm')),
        doc.context.register(doc.context.stream('(split across streams) Tj ET')),
      ]),
    );

    const pdf = await EditablePdf.open(await doc.save({ useObjectStreams: false }));
    const runs = pdf.runs(0);
    expect(runs.map((run) => run.text)).toEqual(['split across streams']);
    pdf.setText(0, runs[0], 'joined up again');
    expect(await reread(await pdf.save())).toEqual([{ text: 'joined up again', x: 20, y: 200 }]);
  });
});
