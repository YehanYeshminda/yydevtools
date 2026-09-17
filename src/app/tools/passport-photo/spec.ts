/**
 * Photo specifications, and the arithmetic that turns them into pixels.
 *
 * Every official spec is written in millimetres and in head height, never in
 * pixels — a passport photo is a printed object. So the millimetres are the
 * source of truth here, and the pixel sizes are derived at whatever resolution
 * the print shop wants. Kept pure so the sums, which are the part that quietly
 * goes wrong, have tests.
 */

export interface PhotoSpec {
  key: string;
  name: string;
  widthMm: number;
  heightMm: number;
  /**
   * Head height — crown of the head to the bottom of the chin — as a fraction
   * of the photo's height. Published as a millimetre range, converted here.
   */
  headMin: number;
  headMax: number;
  note: string;
}

/** Millimetres to a fraction of the photo height, for readability below. */
const frac = (mm: number, ofMm: number) => mm / ofMm;

/**
 * The specifications, each from the issuing authority's own published range.
 *
 * Deliberately a short list of the ones that cover most requests rather than
 * every document in the world: several dozen countries use 35x45 mm with the
 * same head range, and they are served by the first entry.
 */
export const SPECS: readonly PhotoSpec[] = [
  {
    key: 'uk-eu',
    name: 'UK, EU & Schengen',
    widthMm: 35,
    heightMm: 45,
    headMin: frac(29, 45),
    headMax: frac(34, 45),
    note: 'Passport, visa and most national ID cards. Head 29–34 mm of the 45 mm height.',
  },
  {
    key: 'us',
    name: 'United States',
    widthMm: 50.8,
    heightMm: 50.8,
    headMin: frac(25.4, 50.8),
    headMax: frac(34.9, 50.8),
    note: 'Passport, visa and green card: 2 × 2 inches, head 1 – 1⅜ inches.',
  },
  {
    key: 'india',
    name: 'India',
    widthMm: 35,
    heightMm: 45,
    headMin: frac(25, 45),
    headMax: frac(35, 45),
    note: 'Passport and OCI. Also accepts 51 × 51 mm for some applications.',
  },
  {
    key: 'canada',
    name: 'Canada',
    widthMm: 50,
    heightMm: 70,
    headMin: frac(31, 70),
    headMax: frac(36, 70),
    note: 'Passport. The tallest of the common formats, at 50 × 70 mm.',
  },
  {
    key: 'china',
    name: 'China',
    widthMm: 33,
    heightMm: 48,
    headMin: frac(28, 48),
    headMax: frac(33, 48),
    note: 'Visa and passport. 33 × 48 mm, a narrower frame than the European one.',
  },
  {
    key: 'australia',
    name: 'Australia & New Zealand',
    widthMm: 35,
    heightMm: 45,
    headMin: frac(32, 45),
    headMax: frac(36, 45),
    note: 'Passport. Same paper size as the European one, but a larger head.',
  },
  {
    key: 'japan',
    name: 'Japan',
    widthMm: 35,
    heightMm: 45,
    headMin: frac(32, 45),
    headMax: frac(36, 45),
    note: 'Passport and residence card.',
  },
  {
    key: 'square',
    name: 'Profile picture (square)',
    widthMm: 50.8,
    heightMm: 50.8,
    headMin: frac(20, 50.8),
    headMax: frac(35, 50.8),
    note: 'Not an official document — a square headshot for a profile or a badge.',
  },
];

export interface SheetSpec {
  key: string;
  name: string;
  widthMm: number;
  heightMm: number;
}

/** Print sizes a photo shop or a home printer will actually take. */
export const SHEETS: readonly SheetSpec[] = [
  { key: '6x4', name: '6 × 4 inch print', widthMm: 152.4, heightMm: 101.6 },
  { key: '7x5', name: '7 × 5 inch print', widthMm: 177.8, heightMm: 127 },
  { key: 'a4', name: 'A4 page', widthMm: 210, heightMm: 297 },
];

export const DPIS = [300, 600] as const;
export type Dpi = (typeof DPIS)[number];

export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

/** The photo's pixel size at a given resolution. */
export function photoPixels(spec: PhotoSpec, dpi: number): { width: number; height: number } {
  return { width: mmToPx(spec.widthMm, dpi), height: mmToPx(spec.heightMm, dpi) };
}

export interface Guides {
  /** Distance from the top of the frame, as a fraction of its height. */
  crown: number;
  chin: number;
  eyes: number;
}

/**
 * Where the head should sit in the frame.
 *
 * The specs give a head height but are vaguer about its position, so this uses
 * the framing every official example photo shows: the head at the middle of its
 * permitted size range, and the leftover space split 40% above the crown and
 * 60% below the chin, because a portrait needs room for shoulders and looks
 * wrong when the head is centred. Eyes sit a little above the middle of the
 * head, which is where they are on a face.
 */
export function guides(spec: PhotoSpec): Guides {
  const head = (spec.headMin + spec.headMax) / 2;
  const crown = (1 - head) * 0.4;
  return { crown, chin: crown + head, eyes: crown + head * 0.4 };
}

export interface SheetLayout {
  columns: number;
  rows: number;
  count: number;
  /** Sheet size in pixels. */
  width: number;
  height: number;
  /** One photo's size in pixels. */
  cellWidth: number;
  cellHeight: number;
  gap: number;
  /** Margin that centres the block of photos on the sheet. */
  offsetX: number;
  offsetY: number;
}

/**
 * How many copies fit on a sheet, and where each one goes.
 *
 * Tries the sheet both ways round and keeps whichever orientation fits more —
 * six 35x45 photos fit a landscape 6x4 print but only four a portrait one, and
 * nobody wants to reason about that themselves.
 */
export function sheetLayout(
  spec: PhotoSpec,
  sheet: SheetSpec,
  dpi: number,
  gapMm = 2,
): SheetLayout {
  const cellWidth = mmToPx(spec.widthMm, dpi);
  const cellHeight = mmToPx(spec.heightMm, dpi);
  const gap = mmToPx(gapMm, dpi);

  const fit = (sheetWidthMm: number, sheetHeightMm: number) => {
    const width = mmToPx(sheetWidthMm, dpi);
    const height = mmToPx(sheetHeightMm, dpi);
    // A margin of one gap all the way round, so nothing is cut off by a
    // printer's own unprintable border.
    const columns = Math.max(0, Math.floor((width - gap) / (cellWidth + gap)));
    const rows = Math.max(0, Math.floor((height - gap) / (cellHeight + gap)));
    return { width, height, columns, rows, count: columns * rows };
  };

  const portrait = fit(sheet.widthMm, sheet.heightMm);
  const landscape = fit(sheet.heightMm, sheet.widthMm);
  const best = landscape.count > portrait.count ? landscape : portrait;

  const blockWidth = best.columns * cellWidth + Math.max(0, best.columns - 1) * gap;
  const blockHeight = best.rows * cellHeight + Math.max(0, best.rows - 1) * gap;

  return {
    columns: best.columns,
    rows: best.rows,
    count: best.count,
    width: best.width,
    height: best.height,
    cellWidth,
    cellHeight,
    gap,
    offsetX: Math.round((best.width - blockWidth) / 2),
    offsetY: Math.round((best.height - blockHeight) / 2),
  };
}

/** A filename that says what the photo actually is. */
export function photoFilename(spec: PhotoSpec, dpi: number, sheet: SheetSpec | null): string {
  const size = `${trim(spec.widthMm)}x${trim(spec.heightMm)}mm`;
  const stem = sheet ? `${size}-sheet-${sheet.key}` : size;
  return `passport-photo-${stem}-${dpi}dpi.jpg`;
}

function trim(mm: number): string {
  return String(Math.round(mm * 10) / 10);
}
