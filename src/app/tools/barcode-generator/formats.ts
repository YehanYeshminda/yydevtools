/**
 * What each symbology will accept, checked before anything is drawn.
 *
 * JsBarcode validates too, but it reports failure by calling back with `false`
 * and drawing nothing, which leaves the page to say "that did not work". The
 * rules are cheap to state and the reason is the useful part: "EAN-13 needs 12
 * or 13 digits" is actionable where a blank canvas is not.
 */

export type FormatId = 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39' | 'ITF14';

export interface Format {
  id: FormatId;
  label: string;
  /** What JsBarcode calls it. */
  encoder: string;
  /** One line under the input saying what this format is for. */
  hint: string;
  /** A value that is valid, used as the starting point. */
  sample: string;
}

export const FORMATS: Format[] = [
  {
    id: 'CODE128',
    label: 'Code 128',
    encoder: 'CODE128',
    hint: 'Any text. The general-purpose choice for labels, tickets and internal codes.',
    sample: 'YYDEVTOOLS-001',
  },
  {
    id: 'EAN13',
    label: 'EAN-13',
    encoder: 'EAN13',
    hint: 'The barcode on retail packaging worldwide. 12 digits; the 13th is calculated.',
    sample: '501234567890',
  },
  {
    id: 'EAN8',
    label: 'EAN-8',
    encoder: 'EAN8',
    hint: 'The short form, for packages too small for a full EAN-13. 7 digits.',
    sample: '9638507',
  },
  {
    id: 'UPC',
    label: 'UPC-A',
    encoder: 'UPC',
    hint: 'The North American retail barcode. 11 digits; the 12th is calculated.',
    sample: '01234567890',
  },
  {
    id: 'CODE39',
    label: 'Code 39',
    encoder: 'CODE39',
    hint: 'Capitals, digits and - . $ / + % and space. Older, but still standard in defence and automotive.',
    sample: 'YYDEVTOOLS 39',
  },
  {
    id: 'ITF14',
    label: 'ITF-14',
    encoder: 'ITF14',
    hint: 'The carton and case code that wraps a retail item. 13 digits; the 14th is calculated.',
    sample: '1234567890123',
  },
];

export function formatById(id: string): Format | undefined {
  return FORMATS.find((format) => format.id === id);
}

/** Digit counts each format accepts, before and after the check digit. */
const DIGIT_RULES: Partial<Record<FormatId, { without: number; with: number; name: string }>> = {
  EAN13: { without: 12, with: 13, name: 'EAN-13' },
  EAN8: { without: 7, with: 8, name: 'EAN-8' },
  UPC: { without: 11, with: 12, name: 'UPC-A' },
  ITF14: { without: 13, with: 14, name: 'ITF-14' },
};

const CODE39_ALLOWED = /^[0-9A-Z\-. $/+%]*$/;

export type Check = { ok: true } | { ok: false; message: string };

/**
 * The GS1 modulo-10 check digit, used by EAN-8, EAN-13, UPC-A and ITF-14.
 *
 * Digits are weighted 3 and 1 alternately from the right, summed, and the
 * result subtracted from the next multiple of ten. Which end the weighting
 * starts from is the part that is easy to get backwards, and getting it
 * backwards produces a check digit that is right about one time in ten.
 */
export function checkDigit(digits: string): number {
  let sum = 0;
  const reversed = [...digits].reverse();
  for (const [index, char] of reversed.entries()) {
    const value = Number(char);
    sum += index % 2 === 0 ? value * 3 : value;
  }
  return (10 - (sum % 10)) % 10;
}

/** Appends the check digit if the value is one digit short of complete. */
export function withCheckDigit(format: FormatId, value: string): string {
  const rule = DIGIT_RULES[format];
  if (!rule || value.length !== rule.without || !/^\d+$/.test(value)) {
    return value;
  }
  return value + checkDigit(value);
}

export function validate(format: FormatId, value: string): Check {
  if (value.length === 0) {
    return { ok: false, message: 'Type something to encode.' };
  }

  const rule = DIGIT_RULES[format];
  if (rule) {
    if (!/^\d+$/.test(value)) {
      return { ok: false, message: `${rule.name} is digits only.` };
    }
    if (value.length === rule.without) {
      return { ok: true };
    }
    if (value.length === rule.with) {
      const expected = checkDigit(value.slice(0, -1));
      if (Number(value.at(-1)) !== expected) {
        // A refusal rather than a warning, because JsBarcode will not encode it
        // either — and a printed barcode that scans always has the right check
        // digit, so a wrong one is a typo, not a label being reproduced.
        return {
          ok: false,
          message: `The check digit should be ${expected}, not ${value.at(-1)}.`,
        };
      }
      return { ok: true };
    }
    return {
      ok: false,
      message: `${rule.name} needs ${rule.without} digits, or ${rule.with} with the check digit.`,
    };
  }

  if (format === 'CODE39' && !CODE39_ALLOWED.test(value)) {
    return {
      ok: false,
      message: 'Code 39 holds capitals, digits, space and - . $ / + % only.',
    };
  }

  return { ok: true };
}

/** A filename for the download, from the value rather than a generic name. */
export function fileStemFor(format: FormatId, value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${format.toLowerCase()}-${cleaned || 'barcode'}`.slice(0, 60);
}
