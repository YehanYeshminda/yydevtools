/**
 * Reads an AcroForm into plain descriptions the template can render, and
 * writes plain values back. Buttons and signature fields are skipped: there
 * is nothing to type into them.
 */
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFField,
  PDFHexString,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFString,
  PDFTextField,
} from '@cantoo/pdf-lib';

interface Base {
  name: string;
  /** The tooltip (/TU) when the author set one, else the field name. */
  label: string;
  readOnly: boolean;
  required: boolean;
}

export type FieldInfo =
  | (Base & { kind: 'text'; value: string; multiline: boolean; maxLength: number | null })
  | (Base & { kind: 'checkbox'; checked: boolean })
  | (Base & { kind: 'radio'; options: string[]; value: string | null })
  | (Base & {
      kind: 'dropdown' | 'list';
      options: string[];
      values: string[];
      multi: boolean;
      editable: boolean;
    });

export type FieldValue = string | boolean | string[];
export type FieldValues = Record<string, FieldValue>;

export function readFields(doc: PDFDocument): FieldInfo[] {
  const form = doc.getForm();
  const fields: FieldInfo[] = [];
  for (const field of form.getFields()) {
    const base: Base = {
      name: field.getName(),
      label: labelOf(field),
      readOnly: field.isReadOnly(),
      required: field.isRequired(),
    };
    if (field instanceof PDFTextField) {
      fields.push({
        ...base,
        kind: 'text',
        value: field.getText() ?? '',
        multiline: field.isMultiline(),
        maxLength: field.getMaxLength() ?? null,
      });
    } else if (field instanceof PDFCheckBox) {
      fields.push({ ...base, kind: 'checkbox', checked: field.isChecked() });
    } else if (field instanceof PDFRadioGroup) {
      fields.push({
        ...base,
        kind: 'radio',
        options: field.getOptions(),
        value: field.getSelected() ?? null,
      });
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      fields.push({
        ...base,
        kind: field instanceof PDFDropdown ? 'dropdown' : 'list',
        options: field.getOptions(),
        values: field.getSelected(),
        multi: field.isMultiselect(),
        editable: field instanceof PDFDropdown && field.isEditable(),
      });
    }
  }
  return fields;
}

/** The values as the document currently holds them, keyed by field name. */
export function initialValues(fields: FieldInfo[]): FieldValues {
  const values: FieldValues = {};
  for (const field of fields) {
    switch (field.kind) {
      case 'text':
        values[field.name] = field.value;
        break;
      case 'checkbox':
        values[field.name] = field.checked;
        break;
      case 'radio':
        values[field.name] = field.value ?? '';
        break;
      default:
        values[field.name] = field.values;
    }
  }
  return values;
}

/**
 * Writes `values` into the document's form. Unknown names and read-only
 * fields are left alone. With `flatten`, the widgets are burned into the
 * pages so the result is no longer editable.
 */
export function applyValues(doc: PDFDocument, values: FieldValues, flatten: boolean): void {
  const form = doc.getForm();
  if (form.hasXFA()) {
    // The AcroForm underneath is what every viewer falls back to; the XFA
    // layer would otherwise override what was just filled in.
    form.deleteXFA();
  }
  for (const field of form.getFields()) {
    const value = values[field.getName()];
    if (value === undefined || field.isReadOnly()) {
      continue;
    }
    if (field instanceof PDFTextField) {
      field.setText(String(value) || undefined);
    } else if (field instanceof PDFCheckBox) {
      if (value) {
        field.check();
      } else {
        field.uncheck();
      }
    } else if (field instanceof PDFRadioGroup) {
      if (typeof value === 'string' && field.getOptions().includes(value)) {
        field.select(value);
      }
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      const wanted = (Array.isArray(value) ? value : [String(value)]).filter((v) => v !== '');
      const known = wanted.filter((v) => field.getOptions().includes(v));
      if (
        field instanceof PDFDropdown &&
        field.isEditable() &&
        wanted.length === 1 &&
        !known.length
      ) {
        // An editable combo accepts text that is not one of the options.
        field.select(wanted[0]);
      } else if (known.length > 0) {
        field.select(field.isMultiselect() ? known : known[0]);
      }
    }
  }
  if (flatten) {
    form.flatten();
  }
}

function labelOf(field: PDFField): string {
  const tooltip = field.acroField.dict.lookup(PDFName.of('TU'));
  if (tooltip instanceof PDFString || tooltip instanceof PDFHexString) {
    const text = tooltip.decodeText().trim();
    if (text) {
      return text;
    }
  }
  // "personal.name.first" reads better as "first".
  return field.getName().split('.').pop() || field.getName();
}
