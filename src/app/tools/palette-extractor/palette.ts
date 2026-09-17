/**
 * Pulling a palette out of an image, by median cut.
 *
 * Median cut is the classic quantiser and still the right one here. It starts
 * with every pixel in one box, then repeatedly takes whichever box spans the
 * widest range on any one channel and splits it at that channel's median. A
 * box that holds a wide spread of colour gets divided; one holding a single
 * flat colour is left alone. That is what makes the result track the picture:
 * a photo of a sunset really does have several oranges in it, and a palette
 * that collapsed them to one would be describing a different photo.
 *
 * k-means would give slightly tighter clusters for a great deal more work and
 * a random starting seed, which would mean the same image gave a different
 * palette each time it was dropped in. Median cut is deterministic.
 */

import { luminance, type Rgb } from '../color-converter/color';

export interface PaletteColor {
  rgb: Rgb;
  /** Fraction of the counted pixels this colour stands for, 0 to 1. */
  share: number;
}

/** Below this, a pixel is treated as not being there at all. */
const MIN_ALPHA = 128;

type Channel = 0 | 1 | 2;

interface Box {
  /** Offsets into the pixel array, one per pixel: r at i, g at i+1, b at i+2. */
  pixels: number[];
  data: Uint8ClampedArray;
}

function rangeOf(box: Box, channel: Channel): number {
  let min = 255;
  let max = 0;
  for (const offset of box.pixels) {
    const value = box.data[offset + channel];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return max - min;
}

/** The channel this box is most spread out on, and by how much. */
function widest(box: Box): { channel: Channel; range: number } {
  const channels: Channel[] = [0, 1, 2];
  let best = { channel: 0 as Channel, range: -1 };
  for (const channel of channels) {
    const range = rangeOf(box, channel);
    if (range > best.range) {
      best = { channel, range };
    }
  }
  return best;
}

/**
 * Splits a box at the median of its widest channel, nudged off a flat run.
 *
 * Plain median cut divides the sorted pixels in half by count. That is right
 * on a photograph, where values are spread out, and wrong the moment a large
 * flat area exists: an image that is 90% sky puts the halfway mark in the
 * middle of the sky, so one box gets sky and the other gets sky *plus* the
 * sunset, and averaging that box gives a muddy colour belonging to neither.
 *
 * So the cut starts at the median and slides to the nearest point where the
 * value actually changes. Populations stay as even as the picture allows, and
 * two genuinely different colours are never averaged across the cut. The
 * chosen channel always has a range above zero, so such a point always exists.
 */
function split(box: Box): [Box, Box] | null {
  const { channel } = widest(box);
  const sorted = [...box.pixels].sort((a, b) => box.data[a + channel] - box.data[b + channel]);
  const at = boundaryNear(sorted, box.data, channel, sorted.length >> 1);
  if (at === null) {
    return null;
  }
  return [
    { pixels: sorted.slice(0, at), data: box.data },
    { pixels: sorted.slice(at), data: box.data },
  ];
}

/** The index nearest `from` where the sorted channel value changes. */
function boundaryNear(
  sorted: number[],
  data: Uint8ClampedArray,
  channel: Channel,
  from: number,
): number | null {
  const changes = (index: number): boolean =>
    index > 0 &&
    index < sorted.length &&
    data[sorted[index - 1] + channel] !== data[sorted[index] + channel];

  for (let step = 0; step <= sorted.length; step += 1) {
    if (changes(from - step)) {
      return from - step;
    }
    if (changes(from + step)) {
      return from + step;
    }
  }
  return null;
}

/** A box's colour is the mean of its pixels, which reads better than its median. */
function average(box: Box): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const offset of box.pixels) {
    r += box.data[offset];
    g += box.data[offset + 1];
    b += box.data[offset + 2];
  }
  const n = box.pixels.length;
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n), a: 1 };
}

/**
 * Up to `count` colours, biggest share first.
 *
 * Fewer come back when the image does not hold that many: a two-colour logo
 * gives two swatches, not twelve, because a box of identical pixels cannot be
 * divided. Padding the list out with repeats of the same colour would be a
 * palette that lies about the picture.
 */
export function extractPalette(data: Uint8ClampedArray, count: number): PaletteColor[] {
  const pixels: number[] = [];
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] >= MIN_ALPHA) {
      pixels.push(offset);
    }
  }
  if (pixels.length === 0 || count < 1) {
    return [];
  }

  let boxes: Box[] = [{ pixels, data }];
  while (boxes.length < count) {
    // Always divide the box spanning the widest range: it is the one whose
    // single average colour is currently telling the biggest lie.
    const candidates = boxes
      .map((box, index) => ({ index, range: widest(box).range }))
      .filter((entry) => entry.range > 0)
      .sort((a, b) => b.range - a.range);
    if (candidates.length === 0) {
      break;
    }

    const halves = split(boxes[candidates[0].index]);
    if (!halves) {
      break;
    }
    boxes = boxes.flatMap((box, index) => (index === candidates[0].index ? halves : [box]));
  }

  const total = pixels.length;
  return boxes
    .map((box) => ({ rgb: average(box), share: box.pixels.length / total }))
    .sort((a, b) => b.share - a.share);
}

/**
 * Black or white, whichever is legible on this colour.
 *
 * The swatch has its hex written across it, so the label has to work on a
 * near-black and on a near-white alike. WCAG relative luminance rather than a
 * naive average of the channels, because the eye is far more sensitive to
 * green than to blue and a plain average calls a saturated blue "light".
 */
export function readableOn(rgb: Rgb): '#000000' | '#ffffff' {
  // 0.179 is where contrast against white and against black come out equal, so
  // it is the threshold that maximises the worst case. That worst case is
  // 4.58:1 — over the AA floor of 4.5, but only just, which is why nothing
  // drawn in this colour may be faded.
  return luminance(rgb) > 0.179 ? '#000000' : '#ffffff';
}
