/**
 * Comparing two rendered pages, pixel by pixel.
 *
 * Kept away from the canvas so it can be tested on plain arrays: the awkward
 * parts are not the drawing but the edges — pages of different sizes, files
 * with different numbers of pages, and deciding how different two pixels have
 * to be before a difference is real rather than the renderer's own noise.
 *
 * Both documents are rasterised by the same pdf.js at the same scale, so
 * identical content produces identical bytes. The tolerance below is there for
 * the small variation a re-saved file can introduce in anti-aliased edges, not
 * to paper over a real change.
 */

export interface Frame {
  width: number;
  height: number;
  /** RGBA, four bytes per pixel, as `ImageData.data` gives it. */
  data: Uint8ClampedArray;
}

export interface PixelDiff {
  /** Pixels that differ, including any outside one page's bounds. */
  changed: number;
  /** Pixels looked at: the union of the two pages, not the overlap. */
  compared: number;
  ratio: number;
  /**
   * An RGBA overlay the size of the union, ready for `new ImageData`.
   *
   * Pinned to ArrayBuffer rather than the default ArrayBufferLike: ImageData
   * will not take one that might be backed by a SharedArrayBuffer.
   */
  overlay: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}

/**
 * How far apart two channels may be before the pixel counts as changed.
 *
 * Zero would be defensible — the same renderer at the same scale is
 * deterministic — but a file that has been through another tool can come back
 * with imperceptibly different anti-aliasing, and a page glowing red over
 * differences nobody can see is worse than useless.
 */
const TOLERANCE = 12;

/** How much of the unchanged page shows through, so the red has context. */
const GHOST = 0.12;

function sample(frame: Frame, x: number, y: number): [number, number, number, number] {
  if (x >= frame.width || y >= frame.height) {
    return [0, 0, 0, 0];
  }
  const at = (y * frame.width + x) * 4;
  return [frame.data[at], frame.data[at + 1], frame.data[at + 2], frame.data[at + 3]];
}

/**
 * Compares two frames over the union of their sizes.
 *
 * The union rather than the overlap: if B is a longer page than A, the extra
 * strip down the bottom is a difference, and cropping to the smaller of the
 * two would report the pages as identical.
 */
export function diffFrames(a: Frame, b: Frame): PixelDiff {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const overlay = new Uint8ClampedArray(width * height * 4);
  let changed = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [ar, ag, ab, aa] = sample(a, x, y);
      const [br, bg, bb, ba] = sample(b, x, y);
      const differs =
        Math.abs(ar - br) > TOLERANCE ||
        Math.abs(ag - bg) > TOLERANCE ||
        Math.abs(ab - bb) > TOLERANCE ||
        Math.abs(aa - ba) > TOLERANCE;

      const at = (y * width + x) * 4;
      if (differs) {
        changed += 1;
        overlay[at] = 214;
        overlay[at + 1] = 40;
        overlay[at + 2] = 40;
        overlay[at + 3] = 255;
      } else {
        // The unchanged page, faded almost to white, so a red mark has
        // something to sit on and you can see where on the page it is.
        overlay[at] = 255 - (255 - ar) * GHOST;
        overlay[at + 1] = 255 - (255 - ag) * GHOST;
        overlay[at + 2] = 255 - (255 - ab) * GHOST;
        overlay[at + 3] = 255;
      }
    }
  }

  const compared = width * height;
  return {
    changed,
    compared,
    ratio: compared === 0 ? 0 : changed / compared,
    overlay,
    width,
    height,
  };
}

export type PageStatus = 'same' | 'changed' | 'only-a' | 'only-b';

export interface PagePlan {
  index: number;
  inA: boolean;
  inB: boolean;
}

/**
 * Which page numbers to compare.
 *
 * Pages are paired by position, which is the only pairing that needs no
 * guessing. A page inserted in the middle therefore shows every page after it
 * as changed — which is true, and is also the thing you most want to be told.
 */
export function planPages(countA: number, countB: number): PagePlan[] {
  return Array.from({ length: Math.max(countA, countB) }, (_, index) => ({
    index,
    inA: index < countA,
    inB: index < countB,
  }));
}

export function statusFor(plan: PagePlan, ratio: number): PageStatus {
  if (!plan.inB) {
    return 'only-a';
  }
  if (!plan.inA) {
    return 'only-b';
  }
  return ratio > 0 ? 'changed' : 'same';
}

/** "3 of 12 pages differ", or the happy version of it. */
export function summarise(statuses: readonly PageStatus[]): string {
  const total = statuses.length;
  if (total === 0) {
    return 'Nothing to compare.';
  }
  const differing = statuses.filter((status) => status !== 'same').length;
  if (differing === 0) {
    return total === 1 ? 'The page is identical.' : `All ${total} pages are identical.`;
  }
  const pages = total === 1 ? 'page' : 'pages';
  return `${differing} of ${total} ${pages} ${differing === 1 ? 'differs' : 'differ'}.`;
}

/** A percentage for a page's change ratio, never rounded down to a bare 0%. */
export function formatRatio(ratio: number): string {
  if (ratio === 0) {
    return '0%';
  }
  if (ratio < 0.001) {
    return '<0.1%';
  }
  return `${(ratio * 100).toFixed(ratio < 0.01 ? 2 : 1)}%`;
}
