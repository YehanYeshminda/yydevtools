/**
 * Geometry for stamping text on PDF pages.
 *
 * Everything is worked out in the *display* frame — the page as a viewer shows
 * it, honouring /Rotate — and converted to the page's own coordinate frame at
 * the end. That is what makes "bottom centre" mean the bottom the reader sees
 * on a scanned, rotated page rather than the bottom of the stored bitmap.
 */

export type NumberFormat = 'n' | 'page-n' | 'page-n-of-total' | 'n-of-total';
export type NumberPosition =
  'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right';

export interface Point {
  x: number;
  y: number;
}

export function numberLabel(format: NumberFormat, n: number, total: number): string {
  switch (format) {
    case 'n':
      return String(n);
    case 'page-n':
      return `Page ${n}`;
    case 'page-n-of-total':
      return `Page ${n} of ${total}`;
    case 'n-of-total':
      return `${n} / ${total}`;
  }
}

/** Width and height as displayed, after the page's /Rotate. */
export function displaySize(
  rotation: number,
  width: number,
  height: number,
): { width: number; height: number } {
  return rotation % 180 === 0 ? { width, height } : { width: height, height: width };
}

/**
 * Maps a point in the display frame back to the page's stored frame.
 * `width`/`height` are the stored (unrotated) page size; `rotation` is /Rotate,
 * a clockwise multiple of 90.
 */
export function toPageFrame(point: Point, rotation: number, width: number, height: number): Point {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { x: width - point.y, y: point.x };
    case 180:
      return { x: width - point.x, y: height - point.y };
    case 270:
      return { x: point.y, y: height - point.x };
    default:
      return point;
  }
}

/**
 * The baseline origin that centres a block of text of `textWidth` × `textHeight`
 * on `center`, when the text is drawn rotated by `angle` degrees anticlockwise.
 */
export function centeredOrigin(
  center: Point,
  textWidth: number,
  textHeight: number,
  angle: number,
): Point {
  const t = (angle * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return {
    x: center.x - (textWidth / 2) * cos + (textHeight / 2) * sin,
    y: center.y - (textWidth / 2) * sin - (textHeight / 2) * cos,
  };
}

/** Where a page number's baseline starts in the display frame. */
export function numberOrigin(
  position: NumberPosition,
  page: { width: number; height: number },
  textWidth: number,
  size: number,
  margin: number,
): Point {
  const [vertical, horizontal] = position.split('-');
  const x =
    horizontal === 'center'
      ? (page.width - textWidth) / 2
      : horizontal === 'right'
        ? page.width - margin - textWidth
        : margin;
  const y = vertical === 'top' ? page.height - margin - size : margin;
  return { x, y };
}
