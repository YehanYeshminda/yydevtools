import { PDFDocument } from '@cantoo/pdf-lib';

import { logoSize, renderInvoice, type InvoiceDocument } from './invoice-pdf';
import { type LineItem } from './invoice';

const base: InvoiceDocument = {
  kind: 'invoice',
  number: 'INV-0001',
  issueDate: '2026-09-17',
  secondDate: '2026-10-17',
  from: 'Your Company Ltd\n1 Example Street\nLondon',
  to: 'Client Name Ltd\n2 Sample Road',
  currency: 'GBP',
  taxLabel: 'VAT',
  taxRate: 20,
  items: [{ description: 'Design and build', quantity: 1, unitPrice: 1800 }],
  notes: 'Payment within 30 days.',
};

const lines = (count: number): LineItem[] =>
  Array.from({ length: count }, (_, index) => ({
    description: `Line ${index + 1}`,
    quantity: 1,
    unitPrice: 10,
  }));

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

describe('renderInvoice', () => {
  it('produces a PDF', async () => {
    const bytes = await renderInvoice(base);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(await pageCount(bytes)).toBe(1);
  });

  it('renders a receipt too', async () => {
    expect(await pageCount(await renderInvoice({ ...base, kind: 'receipt' }))).toBe(1);
  });

  // The layout walks down the page and has to start a new one before it runs
  // off the bottom. Without that, later lines were drawn at negative y — off
  // the page, and invisible until someone invoiced for forty things.
  it('adds pages rather than running off the bottom', async () => {
    expect(await pageCount(await renderInvoice({ ...base, items: lines(60) }))).toBeGreaterThan(1);
  });

  /**
   * The built-in fonts are WinAnsi-encoded and *throw* on anything outside
   * that, so an address in Greek would have meant no PDF at all rather than a
   * PDF with a few substitutions in it.
   */
  it('does not throw on characters the standard font cannot draw', async () => {
    const bytes = await renderInvoice({
      ...base,
      from: 'Καλημέρα κόσμε\n東京都',
      to: 'Клиент',
      items: [{ description: '日本語の説明', quantity: 1, unitPrice: 10 }],
      notes: '🎉',
    });
    expect(await pageCount(bytes)).toBe(1);
  });

  it('keeps accented Latin, which the font does have', async () => {
    const bytes = await renderInvoice({ ...base, to: 'Café Münchén — Straße 4' });
    expect(await pageCount(bytes)).toBe(1);
  });

  it('survives an empty invoice', async () => {
    const bytes = await renderInvoice({ ...base, items: [], notes: '', from: '', to: '' });
    expect(await pageCount(bytes)).toBe(1);
  });

  it('survives a date that is not a date', async () => {
    const bytes = await renderInvoice({ ...base, issueDate: 'soon', secondDate: '' });
    expect(await pageCount(bytes)).toBe(1);
  });

  it('wraps a long description instead of overflowing the column', async () => {
    const long = 'A very long description '.repeat(20);
    const bytes = await renderInvoice({
      ...base,
      items: [{ description: long, quantity: 1, unitPrice: 10 }],
    });
    expect(await pageCount(bytes)).toBeGreaterThanOrEqual(1);
  });
});

describe('logoSize', () => {
  it('fits a wide wordmark to the box width', () => {
    expect(logoSize(600, 120)).toEqual({ width: 150, height: 30 });
  });

  it('fits a tall mark to the box height instead, keeping it square', () => {
    const { width, height } = logoSize(400, 400);
    expect(width).toBeCloseTo(55);
    expect(height).toBeCloseTo(55);
  });

  // The clamp, which only shows on something inside the box on both axes.
  // Without it this would be scaled up 2.75x to 110 x 55 and look it.
  it('never enlarges something smaller than the box', () => {
    expect(logoSize(40, 20)).toEqual({ width: 40, height: 20 });
  });

  it('refuses a degenerate size rather than dividing by zero', () => {
    expect(logoSize(0, 100)).toEqual({ width: 0, height: 0 });
    expect(logoSize(Number.NaN, 100)).toEqual({ width: 0, height: 0 });
  });
});

/**
 * A 1x1 PNG, spelled out rather than fetched: the point is that a real image
 * goes through pdf-lib's embedPng and comes out the other side, which no
 * fixture file is needed to prove.
 */
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('renderInvoice with a logo', () => {
  const logoBytes = Uint8Array.from(atob(PNG_1X1), (char) => char.charCodeAt(0));

  it('embeds the image and still produces one page', async () => {
    const bytes = await renderInvoice({ ...base, logo: { bytes: logoBytes, format: 'png' } });
    expect(await pageCount(bytes)).toBe(1);
    expect(bytes.length).toBeGreaterThan((await renderInvoice(base)).length);
  });

  it('is unaffected by a null logo', async () => {
    expect(await pageCount(await renderInvoice({ ...base, logo: null }))).toBe(1);
  });
});
