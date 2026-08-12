/**
 * Where a single image sits on the page it is placed on, in PDF points.
 *
 * This is the one piece of the Images-to-PDF path worth pinning down away from
 * the browser: getting "centre a landscape photo on a portrait A4 with a
 * margin" wrong is invisible until someone opens the export. pdf-lib, canvases
 * and object URLs all live in the component; the arithmetic that decides the
 * finished layout lives here, pure and testable.
 *
 * A PDF point is 1/72 inch. In "fit" mode an image pixel maps to a point
 * one-for-one, which is the usual meaning of "fit the page to the image": the
 * result prints at 72 DPI at its natural size and carries no whitespace beyond
 * the margin the user asked for.
 */

export interface Size {
  width: number;
  height: number;
}

/** Fixed page sizes, in points, portrait-oriented. */
export const PAGE_SIZES = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
} as const;

/** "fit" sizes the page to the image; the others are fixed paper sizes. */
export type PagePreset = 'fit' | 'a4' | 'letter';

export type Orientation = 'auto' | 'portrait' | 'landscape';

export type MarginPreset = 'none' | 'small' | 'large';

/** Margin presets in points: none, 0.25 inch and 0.75 inch. */
export const MARGINS: Record<MarginPreset, number> = {
  none: 0,
  small: 18,
  large: 54,
};

export interface Placement {
  /** Page size in points. */
  page: Size;
  /**
   * Bottom-left corner of the drawn image, in pdf-lib's coordinate system
   * (origin bottom-left, y increasing upward).
   */
  x: number;
  y: number;
  /** Drawn image size in points. */
  width: number;
  height: number;
}

/**
 * Chooses the page size for a fixed preset, honouring the orientation request.
 *
 * `auto` follows the image: a wide image gets a landscape page, so a set of
 * mixed photos each land on a page shaped like themselves rather than all being
 * forced upright with bands of white down the sides.
 */
function orientedPage(base: Size, orientation: Orientation, image: Size): Size {
  const portrait = { width: Math.min(base.width, base.height), height: Math.max(base.width, base.height) };
  const landscape = { width: portrait.height, height: portrait.width };

  if (orientation === 'portrait') {
    return portrait;
  }
  if (orientation === 'landscape') {
    return landscape;
  }
  return image.width > image.height ? landscape : portrait;
}

/**
 * Places `image` (in pixels) onto a page according to the preset, orientation
 * and margin.
 *
 * For a fixed page the image is scaled to the largest size that fits inside the
 * margins with its aspect ratio intact, then centred. For "fit" the page is the
 * image plus a uniform margin border, so nothing is ever scaled or cropped.
 */
export function placeImage(
  image: Size,
  preset: PagePreset,
  orientation: Orientation,
  margin: number,
): Placement {
  // A zero or negative dimension has no sensible layout; fall back to a point so
  // the caller still gets a valid, non-empty page rather than a divide-by-zero.
  const safe: Size = {
    width: image.width > 0 ? image.width : 1,
    height: image.height > 0 ? image.height : 1,
  };

  if (preset === 'fit') {
    return {
      page: { width: safe.width + margin * 2, height: safe.height + margin * 2 },
      x: margin,
      y: margin,
      width: safe.width,
      height: safe.height,
    };
  }

  const page = orientedPage(PAGE_SIZES[preset], orientation, safe);

  // A margin wider than half the page would invert the drawable area; clamp it
  // so there is always at least a sliver to draw into.
  const clamped = Math.max(0, Math.min(margin, page.width / 2 - 1, page.height / 2 - 1));
  const availWidth = page.width - clamped * 2;
  const availHeight = page.height - clamped * 2;

  const scale = Math.min(availWidth / safe.width, availHeight / safe.height);
  const width = safe.width * scale;
  const height = safe.height * scale;

  return {
    page,
    x: (page.width - width) / 2,
    y: (page.height - height) / 2,
    width,
    height,
  };
}

/** Scale factor that turns a page's natural (72 DPI) size into `dpi`. */
export function dpiScale(dpi: number): number {
  return dpi / 72;
}
