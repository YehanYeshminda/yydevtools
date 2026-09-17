/**
 * Drawing the invoice onto a page.
 *
 * Kept apart from the component because it is the only part that needs
 * pdf-lib, which is the heaviest thing the page loads, and apart from
 * invoice.ts because that file is arithmetic and this one is millimetres.
 */

import { PDFDocument, PDFFont, StandardFonts, rgb } from '@cantoo/pdf-lib';

import { formatDate, formatMoney, lineTotal, toMinor, totalsFor, type LineItem } from './invoice';

export interface InvoiceDocument {
  kind: 'invoice' | 'receipt';
  number: string;
  issueDate: string;
  /** Due date on an invoice; the date it was paid on a receipt. */
  secondDate: string;
  from: string;
  to: string;
  currency: string;
  taxLabel: string;
  taxRate: number;
  items: readonly LineItem[];
  notes: string;
}

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.42, 0.46);
const RULE = rgb(0.85, 0.85, 0.88);

/** Column x positions, measured from the left margin. */
const COLUMNS = { description: 0, quantity: 300, unit: 360, amount: 495 };

/**
 * Characters the standard fonts can actually draw.
 *
 * pdf-lib's built-in Helvetica is WinAnsi-encoded and *throws* on anything
 * outside it, so an address in Greek or a name in Chinese would not produce a
 * worse-looking PDF — it would produce no PDF and an error. Everything drawn
 * is filtered first.
 *
 * ponytail: the real fix is embedding a Unicode font, which means shipping a
 * TTF and adding fontkit. Worth doing the first time somebody asks for a
 * non-Latin invoice; not worth ~300 KB before that.
 */
const WIN_ANSI_EXTRAS = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ', ...'‘’“”•–—˜™š›œžŸ']);

function drawable(text: string): string {
  return [...text]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (
        code === 10 ||
        code === 13 ||
        (code >= 32 && code <= 126) ||
        (code >= 160 && code <= 255)
      ) {
        return char;
      }
      return WIN_ANSI_EXTRAS.has(char) ? char : '?';
    })
    .join('');
}

/** Splits `text` so that no line is wider than `width` at `size`. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of drawable(text).split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, size) > width) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function renderInvoice(doc: InvoiceDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const content = PAGE.width - MARGIN * 2;

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const text = (
    value: string,
    x: number,
    size: number,
    font: PDFFont = regular,
    color = INK,
  ): void => {
    page.drawText(drawable(value), { x: MARGIN + x, y, size, font, color });
  };

  /** Right-aligns at `x` measured from the left margin. */
  const rightText = (
    value: string,
    x: number,
    size: number,
    font: PDFFont = regular,
    color = INK,
  ): void => {
    const safe = drawable(value);
    page.drawText(safe, {
      x: MARGIN + x - font.widthOfTextAtSize(safe, size),
      y,
      size,
      font,
      color,
    });
  };

  /** Starts a new page when the next block would not fit above the margin. */
  const room = (needed: number): void => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
    }
  };

  // --- Header ----------------------------------------------------------
  y -= 24;
  text(doc.kind === 'receipt' ? 'RECEIPT' : 'INVOICE', 0, 24, bold);
  rightText(doc.number, content, 12, bold);
  y -= 16;
  rightText(`Issued ${formatDate(doc.issueDate)}`, content, 9, regular, MUTED);
  if (doc.secondDate) {
    y -= 12;
    const label = doc.kind === 'receipt' ? 'Paid' : 'Due';
    rightText(`${label} ${formatDate(doc.secondDate)}`, content, 9, regular, MUTED);
  }

  // --- From / To -------------------------------------------------------
  y -= 40;
  const blockTop = y;
  const blockWidth = content / 2 - 20;
  const fromLines = wrap(doc.from, regular, 9.5, blockWidth);
  const toLines = wrap(doc.to, regular, 9.5, blockWidth);

  text('FROM', 0, 7.5, bold, MUTED);
  y = blockTop;
  text(doc.kind === 'receipt' ? 'RECEIVED FROM' : 'BILL TO', content / 2, 7.5, bold, MUTED);

  y = blockTop - 14;
  for (const line of fromLines) {
    text(line, 0, 9.5);
    y -= 12;
  }
  const fromBottom = y;

  y = blockTop - 14;
  for (const line of toLines) {
    text(line, content / 2, 9.5);
    y -= 12;
  }
  y = Math.min(fromBottom, y);

  // --- Line items ------------------------------------------------------
  y -= 24;
  text('DESCRIPTION', COLUMNS.description, 7.5, bold, MUTED);
  rightText('QTY', COLUMNS.quantity + 40, 7.5, bold, MUTED);
  rightText('UNIT', COLUMNS.unit + 60, 7.5, bold, MUTED);
  rightText('AMOUNT', COLUMNS.amount, 7.5, bold, MUTED);
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + content, y },
    thickness: 0.75,
    color: RULE,
  });

  for (const item of doc.items) {
    const lines = wrap(item.description, regular, 9.5, COLUMNS.quantity - 20);
    room(lines.length * 12 + 10);
    y -= 16;
    const top = y;
    for (const line of lines) {
      text(line, COLUMNS.description, 9.5);
      y -= 12;
    }
    y = top;
    rightText(trimNumber(item.quantity), COLUMNS.quantity + 40, 9.5);
    rightText(
      formatMoney(toMinor(item.unitPrice, doc.currency), doc.currency),
      COLUMNS.unit + 60,
      9.5,
    );
    rightText(formatMoney(lineTotal(item, doc.currency), doc.currency), COLUMNS.amount, 9.5);
    y = top - lines.length * 12 + 4;
  }

  // --- Totals ----------------------------------------------------------
  const totals = totalsFor(doc.items, doc.taxRate, doc.currency);
  room(70);
  y -= 12;
  page.drawLine({
    start: { x: MARGIN + COLUMNS.unit - 40, y },
    end: { x: MARGIN + content, y },
    thickness: 0.75,
    color: RULE,
  });

  y -= 16;
  rightText('Subtotal', COLUMNS.unit + 60, 9.5, regular, MUTED);
  rightText(formatMoney(totals.subtotal, doc.currency), COLUMNS.amount, 9.5);

  if (totals.tax !== 0) {
    y -= 14;
    rightText(
      `${doc.taxLabel} ${trimNumber(doc.taxRate)}%`,
      COLUMNS.unit + 60,
      9.5,
      regular,
      MUTED,
    );
    rightText(formatMoney(totals.tax, doc.currency), COLUMNS.amount, 9.5);
  }

  y -= 20;
  rightText('Total', COLUMNS.unit + 60, 12, bold);
  rightText(formatMoney(totals.total, doc.currency), COLUMNS.amount, 12, bold);

  // --- Notes -----------------------------------------------------------
  if (doc.notes.trim()) {
    const lines = wrap(doc.notes, regular, 9, content);
    room(lines.length * 11 + 30);
    y -= 36;
    text('NOTES', 0, 7.5, bold, MUTED);
    y -= 13;
    for (const line of lines) {
      text(line, 0, 9, regular, MUTED);
      y -= 11;
    }
  }

  return pdf.save();
}

/** 2.5 stays 2.5; 3.0 becomes 3. Nobody writes "3.0 hours" on an invoice. */
function trimNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return `${Math.round(value * 1000) / 1000}`;
}
