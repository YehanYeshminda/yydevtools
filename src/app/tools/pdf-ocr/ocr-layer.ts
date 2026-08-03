/**
 * Turning recognised words into an invisible text layer.
 *
 * This is the part of OCR that decides whether the result is any good. The
 * recognition itself gives words and pixel boxes; making the output *searchable
 * and selectable* means putting each word back at the exact spot on the page it
 * was read from, in text that draws nothing.
 *
 * Two coordinate systems meet here and they disagree about almost everything.
 * Tesseract works in image pixels with the origin at the top-left and y growing
 * downwards. PDF works in points with the origin at the bottom-left and y
 * growing upwards. Getting the flip wrong produces a document that looks
 * perfect and selects upside down, which is why this lives in its own tested
 * module rather than inline in the component.
 */

/** A word as Tesseract reports it: pixels, origin top-left. */
export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  /** 0–100. */
  confidence: number;
}

/** A word ready to draw: points, origin bottom-left, baseline at `y`. */
export interface Placement {
  text: string;
  x: number;
  y: number;
  size: number;
  /** Width the drawn word must span, so selection lines up with the ink. */
  targetWidth: number;
}

export interface PlacementOptions {
  /** Rendered image pixels per PDF point. */
  scale: number;
  /** Unrotated page height, in points. */
  pageHeight: number;
  /** Words below this confidence are dropped. */
  minConfidence?: number;
}

/**
 * Words Tesseract is confident enough about to be worth indexing.
 *
 * Below roughly this, recognition is mostly noise from page edges, staple holes
 * and scan artefacts — and a wrong word in the text layer is worse than no
 * word, because it makes the document findable under something it does not say.
 */
const DEFAULT_MIN_CONFIDENCE = 55;

/** Boxes thinner or shorter than this many pixels are artefacts, not text. */
const MIN_BOX_PIXELS = 2;

export function placeWords(words: readonly OcrWord[], options: PlacementOptions): Placement[] {
  const { scale, pageHeight } = options;
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  if (!(scale > 0)) {
    return [];
  }

  const placements: Placement[] = [];
  for (const word of words) {
    if (word.confidence < minConfidence) {
      continue;
    }
    const text = sanitiseForPdf(word.text);
    if (text === '') {
      continue;
    }

    const { x0, y0, x1, y1 } = word.bbox;
    const pixelWidth = x1 - x0;
    const pixelHeight = y1 - y0;
    if (pixelWidth < MIN_BOX_PIXELS || pixelHeight < MIN_BOX_PIXELS) {
      continue;
    }

    placements.push({
      text,
      x: x0 / scale,
      // y1 is the *bottom* of the box in image space, which is where the text
      // sits in PDF space once the axis is flipped.
      y: pageHeight - y1 / scale,
      size: pixelHeight / scale,
      targetWidth: pixelWidth / scale,
    });
  }
  return placements;
}

/**
 * The horizontal scale factor that makes `naturalWidth` span `targetWidth`.
 *
 * The text layer is drawn in Helvetica whatever the page was actually set in,
 * so a word's natural width rarely matches the ink underneath it. Squeezing or
 * stretching each word to its measured box is what makes dragging a selection
 * across the page highlight the words you are actually pointing at.
 *
 * Clamped because a single mis-measured box should not produce a wildly
 * stretched word that breaks selection for the whole line.
 */
export function horizontalScale(naturalWidth: number, targetWidth: number): number {
  if (!(naturalWidth > 0) || !(targetWidth > 0)) {
    return 1;
  }
  return clamp(targetWidth / naturalWidth, 0.1, 10);
}

/**
 * Typographic characters folded to the ASCII equivalent WinAnsi is sure of.
 *
 * The layer exists to be searched, and nobody types a curly apostrophe into a
 * search box — folding them means "don't" in the scan is findable by "don't".
 */
const REPLACEMENTS: ReadonlyArray<[RegExp, string]> = [
  [/[‘’‚‛]/g, "'"],
  [/[“”„‟]/g, '"'],
  [/[‐‑‒–—―]/g, '-'],
  [/…/g, '...'],
];

const NON_BREAKING_SPACE = 0xa0;
const FIRST_PRINTABLE = 0x20;
const DELETE_CHARACTER = 0x7f;
const C1_START = 0x80;
const C1_END = 0x9f;
/** The highest code point WinAnsi can represent. */
const LAST_ENCODABLE = 0xff;

/**
 * Makes a recognised word safe to draw in a standard PDF font.
 *
 * The text layer uses Helvetica, whose WinAnsi encoding cannot represent
 * everything Tesseract might return — and pdf-lib throws rather than skipping a
 * character it cannot encode, which would abandon a whole document over one
 * stray glyph.
 *
 * The filtering is written against code points rather than as a character-class
 * regex deliberately: a range covering the control characters has to contain
 * them literally, and those bytes do not survive being written and read back as
 * source. One that quietly degraded would strip every hyphen out of the layer
 * instead, which is exactly the kind of bug nobody looks for.
 */
export function sanitiseForPdf(text: string): string {
  let folded = text;
  for (const [pattern, replacement] of REPLACEMENTS) {
    folded = folded.replace(pattern, replacement);
  }

  let out = '';
  for (const character of folded) {
    const code = character.codePointAt(0) ?? 0;
    if (code === NON_BREAKING_SPACE) {
      out += ' ';
    } else if (
      code >= FIRST_PRINTABLE &&
      code !== DELETE_CHARACTER &&
      !(code >= C1_START && code <= C1_END) &&
      code <= LAST_ENCODABLE
    ) {
      out += character;
    }
  }
  return out.trim();
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
