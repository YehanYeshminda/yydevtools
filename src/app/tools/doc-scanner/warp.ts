/**
 * The geometry and the pixel work behind the scanner.
 *
 * A photographed page is a quadrilateral; the scan is that quadrilateral pulled
 * straight into a rectangle. Everything here is pure and runs on `ImageData`,
 * so it is unit-testable and can live in a worker.
 */

export interface Point {
  x: number;
  y: number;
}

/** The page's corners in image pixels: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

export type ScanFilter = 'colour' | 'grey' | 'bw';

export const CORNERS = [
  { index: 0, label: 'top-left' },
  { index: 1, label: 'top-right' },
  { index: 2, label: 'bottom-right' },
  { index: 3, label: 'bottom-left' },
] as const;

/** A first guess at the page: the photo with a small border shaved off. */
export function defaultQuad(width: number, height: number): Quad {
  const dx = width * 0.04;
  const dy = height * 0.04;
  return [
    { x: dx, y: dy },
    { x: width - dx, y: dy },
    { x: width - dx, y: height - dy },
    { x: dx, y: height - dy },
  ];
}

export function clampPoint(point: Point, width: number, height: number): Point {
  return {
    x: Math.min(width, Math.max(0, point.x)),
    y: Math.min(height, Math.max(0, point.y)),
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The size of the straightened page: the longer of each pair of opposite
 * edges, so nothing is squashed, capped so a huge photo stays workable.
 */
export function outputSize(quad: Quad, maxSide: number): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  const width = Math.max(distance(tl, tr), distance(bl, br), 1);
  const height = Math.max(distance(tl, bl), distance(tr, br), 1);
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * The homography that maps a point in the output rectangle back onto the
 * source quad. Eight unknowns from four corner pairs, solved directly.
 */
export function rectToQuad(quad: Quad, width: number, height: number): number[] {
  const from: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const rows: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = quad[i];
    rows.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u]);
    rows.push([0, 0, 0, x, y, 1, -x * v, -y * v, v]);
  }
  const h = solve(rows);
  return [...h, 1];
}

/** Gaussian elimination with partial pivoting on an 8×9 augmented matrix. */
function solve(m: number[][]): number[] {
  const n = m.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) {
        pivot = row;
      }
    }
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const lead = m[col][col] || 1e-12;
    for (let row = 0; row < n; row++) {
      if (row === col) {
        continue;
      }
      const factor = m[row][col] / lead;
      for (let k = col; k <= n; k++) {
        m[row][k] -= factor * m[col][k];
      }
    }
  }
  return m.map((row, i) => row[n] / (row[i] || 1e-12));
}

/** Pull the quad straight: every output pixel samples the source bilinearly. */
export function warp(src: ImageData, quad: Quad, width: number, height: number): ImageData {
  const [a, b, c, d, e, f, g, h] = rectToQuad(quad, width, height);
  const out = new ImageData(width, height);
  const s = src.data;
  const o = out.data;
  const sw = src.width;
  const sh = src.height;
  let i = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i += 4) {
      const w = g * x + h * y + 1;
      const sx = (a * x + b * y + c) / w;
      const sy = (d * x + e * y + f) / w;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= sw - 1 || y0 >= sh - 1) {
        // Off the photo: paper white, so a corner dragged past the edge is not black.
        o[i] = o[i + 1] = o[i + 2] = 255;
        o[i + 3] = 255;
        continue;
      }
      const fx = sx - x0;
      const fy = sy - y0;
      const p = (y0 * sw + x0) * 4;
      const q = p + sw * 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = s[p + ch] * (1 - fx) + s[p + 4 + ch] * fx;
        const bottom = s[q + ch] * (1 - fx) + s[q + 4 + ch] * fx;
        o[i + ch] = top * (1 - fy) + bottom * fy;
      }
      o[i + 3] = 255;
    }
  }
  return out;
}

/** Apply the chosen look in place. */
export function applyFilter(image: ImageData, filter: ScanFilter): void {
  if (filter === 'colour') {
    return;
  }
  const { data, width, height } = image;
  const grey = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < grey.length; i++, p += 4) {
    grey[i] = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
  }
  const out = filter === 'grey' ? grey : threshold(grey, width, height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    data[p] = data[p + 1] = data[p + 2] = out[i];
  }
}

/**
 * Adaptive threshold: a pixel is ink when it is darker than the average of its
 * neighbourhood. Unlike one global cut-off, this survives the shadow a phone
 * casts over half the page. The neighbourhood mean comes from an integral
 * image, so the cost is one pass regardless of window size.
 */
function threshold(grey: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const radius = Math.max(8, Math.round(Math.min(width, height) / 40));
  const bias = 12;
  const stride = width + 1;
  const sum = new Float64Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y++) {
    let row = 0;
    for (let x = 1; x <= width; x++) {
      row += grey[(y - 1) * width + (x - 1)];
      sum[y * stride + x] = sum[(y - 1) * stride + x] + row;
    }
  }
  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const area = (x1 - x0) * (y1 - y0);
      const total =
        sum[y1 * stride + x1] -
        sum[y0 * stride + x1] -
        sum[y1 * stride + x0] +
        sum[y0 * stride + x0];
      out[y * width + x] = grey[y * width + x] < total / area - bias ? 0 : 255;
    }
  }
  return out;
}
