import { PDFDocument, PDFName, PDFString } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';

import { applyValues, initialValues, readFields } from './form-fields';

async function makeForm(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 400]);
  const form = doc.getForm();

  const name = form.createTextField('applicant.name');
  name.addToPage(page, { x: 20, y: 340, width: 200, height: 24 });
  name.acroField.dict.set(PDFName.of('TU'), PDFString.of('Full name'));

  const agree = form.createCheckBox('agree');
  agree.addToPage(page, { x: 20, y: 300, width: 18, height: 18 });

  const colour = form.createRadioGroup('colour');
  colour.addOptionToPage('Red', page, { x: 20, y: 260, width: 18, height: 18 });
  colour.addOptionToPage('Blue', page, { x: 60, y: 260, width: 18, height: 18 });

  const size = form.createDropdown('size');
  size.addOptions(['S', 'M', 'L']);
  size.select('M');
  size.addToPage(page, { x: 20, y: 220, width: 100, height: 24 });

  const locked = form.createTextField('locked');
  locked.setText('fixed');
  locked.enableReadOnly();
  locked.addToPage(page, { x: 20, y: 180, width: 100, height: 24 });

  return doc.save();
}

describe('readFields', () => {
  it('describes each field, using the tooltip as the label', async () => {
    const doc = await PDFDocument.load(await makeForm());
    const fields = readFields(doc);
    expect(fields.map((f) => [f.kind, f.name, f.label])).toEqual([
      ['text', 'applicant.name', 'Full name'],
      ['checkbox', 'agree', 'agree'],
      ['radio', 'colour', 'colour'],
      ['dropdown', 'size', 'size'],
      ['text', 'locked', 'locked'],
    ]);
    expect(fields[3]).toMatchObject({ options: ['S', 'M', 'L'], values: ['M'], multi: false });
    expect(fields[4]).toMatchObject({ readOnly: true, value: 'fixed' });
    expect(initialValues(fields)).toEqual({
      'applicant.name': '',
      agree: false,
      colour: '',
      size: ['M'],
      locked: 'fixed',
    });
  });
});

describe('applyValues', () => {
  it('writes every kind of value and leaves read-only fields alone', async () => {
    const doc = await PDFDocument.load(await makeForm());
    applyValues(
      doc,
      {
        'applicant.name': 'Ada Lovelace',
        agree: true,
        colour: 'Blue',
        size: ['L'],
        locked: 'nope',
      },
      false,
    );
    const form = doc.getForm();
    expect(form.getTextField('applicant.name').getText()).toBe('Ada Lovelace');
    expect(form.getCheckBox('agree').isChecked()).toBe(true);
    expect(form.getRadioGroup('colour').getSelected()).toBe('Blue');
    expect(form.getDropdown('size').getSelected()).toEqual(['L']);
    expect(form.getTextField('locked').getText()).toBe('fixed');
  });

  it('ignores a radio value that is not an option', async () => {
    const doc = await PDFDocument.load(await makeForm());
    applyValues(doc, { colour: 'Green' }, false);
    expect(doc.getForm().getRadioGroup('colour').getSelected()).toBeUndefined();
  });

  it('flattens on request, leaving no fields behind', async () => {
    const doc = await PDFDocument.load(await makeForm());
    applyValues(doc, { 'applicant.name': 'Ada' }, true);
    expect(doc.getForm().getFields()).toHaveLength(0);
    const reloaded = await PDFDocument.load(await doc.save());
    expect(reloaded.getForm().getFields()).toHaveLength(0);
  });
});
