/**
 * The arithmetic and pixel work behind Sign PDF, kept apart from the component
 * so the coordinate mapping — the one thing that silently puts a signature in
 * the wrong place — has a test.
 */

/** Where the signature sits, as fractions of the page it is on. */
export interface Placement {
  page: number;
  /** Left edge, 0..1 of page width. */
  x: number;
  /** Top edge, 0..1 of page height — screen convention, origin top-left. */
  y: number;
  /** Width, 0..1 of page width. Height follows from the image's aspect. */
  width: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Converts a placement into pdf-lib's rectangle for the page: points, origin
 * bottom-left. `aspect` is the signature image's height divided by its width.
 */
export function toPdfRect(
  placement: Placement,
  page: { width: number; height: number },
  aspect: number,
): Rect {
  const width = placement.width * page.width;
  const height = width * aspect;
  return {
    x: placement.x * page.width,
    y: page.height - placement.y * page.height - height,
    width,
    height,
  };
}

/** Keeps a placement inside the page, given the signature's height as a fraction of page height. */
export function clamp(placement: Placement, heightFraction: number): Placement {
  return {
    ...placement,
    x: Math.min(Math.max(placement.x, 0), 1 - placement.width),
    y: Math.min(Math.max(placement.y, 0), Math.max(0, 1 - heightFraction)),
  };
}

/**
 * Crops a canvas to the bounding box of its non-transparent pixels, with a
 * little breathing room, so a signature drawn in one corner of the pad does not
 * become a mostly-empty box on the page. Null when nothing was drawn.
 */
export function trimTransparent(source: HTMLCanvasElement, padding = 8): HTMLCanvasElement | null {
  const context = source.getContext('2d');
  if (!context) {
    return null;
  }
  const { width, height } = source;
  const { data } = context.getImageData(0, 0, width, height);
  let top = height;
  let left = width;
  let bottom = -1;
  let right = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] !== 0) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) {
    return null;
  }
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding);
  bottom = Math.min(height - 1, bottom + padding);

  const out = document.createElement('canvas');
  out.width = right - left + 1;
  out.height = bottom - top + 1;
  out
    .getContext('2d')
    ?.drawImage(source, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** Renders a name in a handwriting-style face onto a transparent canvas. */
export function typedSignature(name: string): HTMLCanvasElement {
  const size = 72;
  const font = `italic ${size}px "Segoe Script", "Brush Script MT", "Apple Chancery", "Snell Roundhand", cursive`;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return canvas;
  }
  context.font = font;
  const metrics = context.measureText(name);
  canvas.width = Math.ceil(metrics.width) + size;
  canvas.height = size * 2;
  // Resizing resets the context, so the font is set twice on purpose.
  context.font = font;
  context.fillStyle = '#0b1f4d';
  context.textBaseline = 'middle';
  context.fillText(name, size / 2, canvas.height / 2);
  return canvas;
}

/** A canvas as PNG bytes (transparency kept). */
export function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('The signature could not be encoded.'));
        return;
      }
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, 'image/png');
  });
}
