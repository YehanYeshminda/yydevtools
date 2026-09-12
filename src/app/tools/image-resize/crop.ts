/**
 * Crop-box arithmetic, in source pixels. Kept pure so the corner-drag rules —
 * the part that goes subtly wrong — have a test.
 */
import type { PixelRect } from '../../core/image/image-codec.client';

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

export interface Point {
  x: number;
  y: number;
}

/** Smallest crop worth making, in pixels. */
export const MIN_CROP = 8;

/** Keeps a rectangle inside a `width × height` image, at least MIN_CROP each way. */
export function clampRect(rect: PixelRect, width: number, height: number): PixelRect {
  const w = Math.min(Math.max(Math.round(rect.width), MIN_CROP), width);
  const h = Math.min(Math.max(Math.round(rect.height), MIN_CROP), height);
  return {
    x: Math.min(Math.max(Math.round(rect.x), 0), width - w),
    y: Math.min(Math.max(Math.round(rect.y), 0), height - h),
    width: w,
    height: h,
  };
}

/** The largest rectangle of `aspect` (w/h) that fits, centred. Null aspect = whole image. */
export function centeredRect(aspect: number | null, width: number, height: number): PixelRect {
  if (!aspect) {
    return { x: 0, y: 0, width, height };
  }
  let w = width;
  let h = Math.round(w / aspect);
  if (h > height) {
    h = height;
    w = Math.round(h * aspect);
  }
  return { x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), width: w, height: h };
}

/**
 * The rectangle spanned by a fixed `anchor` corner and the pointer, honouring
 * `aspect` (grown to the larger of the two dimensions, then shrunk to stay
 * inside the image) and never smaller than MIN_CROP.
 */
export function fromCorner(
  anchor: Point,
  pointer: Point,
  aspect: number | null,
  width: number,
  height: number,
): PixelRect {
  const px = Math.min(Math.max(pointer.x, 0), width);
  const py = Math.min(Math.max(pointer.y, 0), height);
  const right = px >= anchor.x;
  const down = py >= anchor.y;
  let w = Math.max(Math.abs(px - anchor.x), MIN_CROP);
  let h = Math.max(Math.abs(py - anchor.y), MIN_CROP);

  if (aspect) {
    // Follow whichever axis the pointer pushed further.
    if (w / aspect >= h) {
      h = w / aspect;
    } else {
      w = h * aspect;
    }
    const roomW = right ? width - anchor.x : anchor.x;
    const roomH = down ? height - anchor.y : anchor.y;
    if (w > roomW) {
      w = roomW;
      h = w / aspect;
    }
    if (h > roomH) {
      h = roomH;
      w = h * aspect;
    }
  }

  return clampRect(
    {
      x: right ? anchor.x : anchor.x - w,
      y: down ? anchor.y : anchor.y - h,
      width: w,
      height: h,
    },
    width,
    height,
  );
}

/** The corner opposite the one being dragged. */
export function anchorOf(rect: PixelRect, corner: Corner): Point {
  return {
    x: corner === 'nw' || corner === 'sw' ? rect.x + rect.width : rect.x,
    y: corner === 'nw' || corner === 'ne' ? rect.y + rect.height : rect.y,
  };
}

/**
 * Output size from the crop and what was asked for. A null dimension follows
 * the crop; with `lock` the other dimension follows the crop's aspect.
 */
export function outputSize(
  crop: PixelRect,
  want: { width: number | null; height: number | null },
  lock: boolean,
): { width: number; height: number } {
  const aspect = crop.width / crop.height;
  let width = want.width ?? (lock && want.height ? want.height * aspect : crop.width);
  let height = want.height ?? (lock && want.width ? want.width / aspect : crop.height);
  if (lock && want.width && want.height) {
    height = want.width / aspect;
  }
  width = Math.min(Math.max(Math.round(width), 1), 16384);
  height = Math.min(Math.max(Math.round(height), 1), 16384);
  return { width, height };
}
