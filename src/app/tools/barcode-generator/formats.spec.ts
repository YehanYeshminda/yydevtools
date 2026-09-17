import { FORMATS, checkDigit, fileStemFor, formatById, validate, withCheckDigit } from './formats';

describe('barcode formats', () => {
  it('gives every format a sample that validates', () => {
    for (const format of FORMATS) {
      expect(validate(format.id, format.sample).ok, `${format.id} sample`).toBe(true);
    }
  });

  it('finds a format by id', () => {
    expect(formatById('EAN13')?.label).toBe('EAN-13');
    expect(formatById('nope')).toBeUndefined();
  });

  describe('checkDigit', () => {
    // Real barcodes, so a weighting applied from the wrong end shows up.
    it('matches published EAN-13 codes', () => {
      expect(checkDigit('400638133393')).toBe(1);
      expect(checkDigit('978020137962')).toBe(4);
      expect(checkDigit('501234567890')).toBe(0);
    });

    it('matches a published UPC-A code', () => {
      expect(checkDigit('03600029145')).toBe(2);
    });

    it('matches a published EAN-8 code', () => {
      expect(checkDigit('9638507')).toBe(4);
    });

    it('handles an all-zero payload', () => {
      expect(checkDigit('000000000000')).toBe(0);
    });
  });

  describe('withCheckDigit', () => {
    it('completes a short value', () => {
      expect(withCheckDigit('EAN13', '501234567890')).toBe('5012345678900');
      expect(withCheckDigit('UPC', '03600029145')).toBe('036000291452');
      expect(withCheckDigit('EAN8', '9638507')).toBe('96385074');
    });

    it('leaves an already-complete value alone', () => {
      expect(withCheckDigit('EAN13', '5012345678900')).toBe('5012345678900');
    });

    it('leaves a format without a check digit alone', () => {
      expect(withCheckDigit('CODE128', 'HELLO')).toBe('HELLO');
    });

    it('leaves a non-numeric value alone rather than corrupting it', () => {
      expect(withCheckDigit('EAN13', 'ABCDEFGHIJKL')).toBe('ABCDEFGHIJKL');
    });
  });

  describe('validate', () => {
    it('refuses an empty value', () => {
      expect(validate('CODE128', '')).toEqual({ ok: false, message: 'Type something to encode.' });
    });

    it('accepts either length for a check-digit format', () => {
      expect(validate('EAN13', '501234567890').ok).toBe(true);
      expect(validate('EAN13', '5012345678900').ok).toBe(true);
    });

    it('rejects the wrong number of digits, and says how many', () => {
      const result = validate('EAN13', '5012345');
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.message).toContain('12 digits');
    });

    it('rejects letters in a numeric format', () => {
      const result = validate('EAN13', 'ABCDEFGHIJKL');
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.message).toContain('digits only');
    });

    // JsBarcode refuses these too, so accepting one here would show an error
    // from the library under a message saying it was fine.
    it('rejects a wrong check digit, and says what it should be', () => {
      const result = validate('EAN13', '5012345678901');
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.message).toContain('should be 0, not 1');
    });

    it('rejects characters Code 39 cannot hold', () => {
      expect(validate('CODE39', 'lower case').ok).toBe(false);
      expect(validate('CODE39', 'ABC-123 $/+%.').ok).toBe(true);
    });

    it('accepts anything for Code 128', () => {
      expect(validate('CODE128', 'anything at all! 123').ok).toBe(true);
    });
  });

  describe('fileStemFor', () => {
    it('builds a name from the value', () => {
      expect(fileStemFor('EAN13', '5012345678900')).toBe('ean13-5012345678900');
      expect(fileStemFor('CODE128', 'Hello World!')).toBe('code128-hello-world');
    });

    it('falls back when nothing survives', () => {
      expect(fileStemFor('CODE128', '!!!')).toBe('code128-barcode');
    });

    it('keeps the name a sensible length', () => {
      expect(fileStemFor('CODE128', 'x'.repeat(200)).length).toBeLessThanOrEqual(60);
    });
  });
});
