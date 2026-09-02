/**
 * Zoom arithmetic for the document viewer.
 *
 * A Word page is a fixed width — A4 is 794 CSS pixels at 96dpi, US Letter 816 —
 * and the column this tool renders into is narrower than that on most laptops
 * and far narrower on a phone. The answer is the one every word processor
 * already ships: scale the whole page.
 *
 * A geometric scale is the *honest* option, not a compromise. It changes
 * nothing about the layout — the same words break on the same lines, on the
 * same pages, exactly where Word put them. Reflowing the text to fit the column
 * would be the thing that misrepresents the document, and so would the previous
 * behaviour here, which was to let the page overflow and be clipped.
 */

/** The zoom levels the buttons step through. */
export const ZOOM_STEPS: readonly number[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

const MIN_STEP = ZOOM_STEPS[0];
const MAX_STEP = ZOOM_STEPS[ZOOM_STEPS.length - 1];

/** Either an explicit scale, or "whatever makes the document fit". */
export type Zoom = 'fit' | number;

/**
 * The scale at which `contentWidth` fits inside `availableWidth`.
 *
 * Capped at 1, because enlarging a page that already fits is not what "fit
 * width" means to anyone — a document at 140% on a wide monitor looks like a
 * mistake. Deliberately *not* clamped at the bottom: a wide landscape page on a
 * phone genuinely needs less than the smallest step, and returning a scale that
 * does not fit would make the button's own label untrue. The viewer scrolls
 * either way, so the worst case is a small page, not a lost one.
 */
export function fitScale(contentWidth: number, availableWidth: number): number {
  if (!(contentWidth > 0) || !(availableWidth > 0)) {
    return 1;
  }
  return Math.min(1, availableWidth / contentWidth);
}

/** Turn a zoom setting into the scale to actually apply. */
export function resolveScale(zoom: Zoom, contentWidth: number, availableWidth: number): number {
  if (zoom === 'fit') {
    return fitScale(contentWidth, availableWidth);
  }
  return Math.min(MAX_STEP, Math.max(MIN_STEP, zoom));
}

/**
 * The next step above or below `current`.
 *
 * `current` need not be one of the steps — after "fit width" it usually is not
 * — so this moves to the nearest step in the chosen direction rather than
 * indexing into the list. Returns `current` unchanged at either end, which is
 * what the buttons use to decide when to disable themselves.
 */
export function stepZoom(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    return ZOOM_STEPS.find((step) => step > current + 0.001) ?? current;
  }
  return [...ZOOM_STEPS].reverse().find((step) => step < current - 0.001) ?? current;
}
