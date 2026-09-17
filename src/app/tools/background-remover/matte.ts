/**
 * Turning a segmentation mask into a cut-out.
 *
 * The network answers at a fixed 320x320 whatever the photo's size, so the mask
 * has to be stretched back over the original pixels before it can be used as an
 * alpha channel. Everything here is pure and works on plain arrays, so it can be
 * tested without a canvas, a worker or a model.
 */

/** A background colour to matte onto, as 0-255 channels. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Stretches the raw network output to the full 0-1 range.
 *
 * U^2-Net's head is a sigmoid, so the values are already inside 0-1, but a
 * confident cut-out rarely uses all of it — a mask that runs 0.08 to 0.86 leaves
 * a grey haze over what should be empty background. Rescaling to the extremes is
 * what the reference implementation does, and it is the difference between a
 * clean edge and a faint ghost of the original rectangle.
 */
export function normaliseMask(values: Float32Array): Float32Array {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }

  const span = max - min;
  const out = new Float32Array(values.length);
  if (span <= 0) {
    // A uniform mask carries no information; treat it as fully opaque rather
    // than dividing by zero and handing back NaN.
    out.fill(min > 0 ? 1 : 0);
    return out;
  }
  for (let i = 0; i < values.length; i++) {
    out[i] = (values[i] - min) / span;
  }
  return out;
}

/**
 * Resamples a square mask up to the image's dimensions, bilinearly.
 *
 * Nearest-neighbour is cheaper and looks it: at the 6x or 8x scale factors a
 * phone photo needs, every edge turns into visible 320ths-of-the-image steps.
 * Interpolating costs four reads per pixel and hides the mask's real resolution.
 */
export function resampleAlpha(
  mask: Float32Array,
  side: number,
  width: number,
  height: number,
): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(width * height);
  // Map pixel centres, not corners, so the mask is not shifted by half a texel.
  const scaleX = width === 1 ? 0 : side / width;
  const scaleY = height === 1 ? 0 : side / height;

  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(side - 1, Math.max(0, (y + 0.5) * scaleY - 0.5));
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(side - 1, y0 + 1);
    const fracY = sourceY - y0;
    const row0 = y0 * side;
    const row1 = y1 * side;

    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(side - 1, Math.max(0, (x + 0.5) * scaleX - 0.5));
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(side - 1, x0 + 1);
      const fracX = sourceX - x0;

      const top = mask[row0 + x0] + (mask[row0 + x1] - mask[row0 + x0]) * fracX;
      const bottom = mask[row1 + x0] + (mask[row1 + x1] - mask[row1 + x0]) * fracX;
      alpha[y * width + x] = Math.round((top + (bottom - top) * fracY) * 255);
    }
  }
  return alpha;
}

/**
 * Applies an alpha channel to RGBA pixels, in place.
 *
 * With no background the result is a transparent PNG. With one, the subject is
 * composited over it and the image comes back fully opaque — which is what a
 * passport photo or a product shot on white actually needs, and it saves the
 * caller a second canvas.
 */
export function applyAlpha(
  pixels: Uint8ClampedArray,
  alpha: Uint8ClampedArray,
  background: Rgb | null,
): void {
  for (let i = 0; i < alpha.length; i++) {
    const offset = i * 4;
    const a = alpha[i];
    if (background === null) {
      // Premultiplying is wrong here: canvas expects straight alpha, and the
      // colour under a transparent pixel is what keeps the edge from fringing.
      pixels[offset + 3] = a;
      continue;
    }
    const weight = a / 255;
    pixels[offset] = pixels[offset] * weight + background.r * (1 - weight);
    pixels[offset + 1] = pixels[offset + 1] * weight + background.g * (1 - weight);
    pixels[offset + 2] = pixels[offset + 2] * weight + background.b * (1 - weight);
    pixels[offset + 3] = 255;
  }
}

/** `#rrggbb` to channels. Returns null for anything that is not one. */
export function parseHex(value: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) {
    return null;
  }
  const number = parseInt(match[1], 16);
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
}

/**
 * How much of the picture survived, as a percentage.
 *
 * Shown next to the result because it is the cheapest honest signal that the
 * model misfired: a cut-out that kept 99% of the frame found no subject, and one
 * that kept 0.2% found a speck.
 */
export function coverage(alpha: Uint8ClampedArray): number {
  let kept = 0;
  for (const value of alpha) {
    if (value > 127) {
      kept++;
    }
  }
  return alpha.length === 0 ? 0 : (kept / alpha.length) * 100;
}
