/**
 * Rasterises the YYDevTools mark into the PNG/ICO sizes browsers and app
 * launchers need. The vector masters are public/logo.svg and public/favicon.svg;
 * this keeps the bitmaps in step with them so the brand cannot drift.
 *
 * The mark is a rounded tile plus three round-capped strokes, so it can be drawn
 * from signed distance fields — no canvas or image dependency, and the distance
 * doubles as the antialiasing coverage. Run with `npm run icons` after any
 * change to the mark.
 */
import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT_DIR = 'public';

const TILE = [0xff, 0xbe, 0x3d];
const MARK = [0x26, 0x2a, 0x33];

/** Design grid the geometry below is expressed in. */
const GRID = 96;
const RADIUS = 28;

/** Endpoints of the three arms, in grid units. */
const ARMS = [
  [48, 22, 48, 74],
  [70.5, 35, 25.5, 61],
  [25.5, 35, 70.5, 61],
];

/**
 * Stroke weight for a given output size. The design bumps the arms up as the
 * mark shrinks so they do not close up into a blob in a browser tab.
 */
function strokeFor(size) {
  if (size <= 16) return 14;
  if (size <= 32) return 12;
  return 11;
}

/** Distance from p to a rounded box centred on the grid. */
function roundedBoxDistance(x, y, half, radius) {
  const qx = Math.abs(x - half) - (half - radius);
  const qy = Math.abs(y - half) - (half - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Distance from p to the segment a-b. */
function segmentDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

/** A distance in pixels becomes edge coverage: -0.5px fully in, +0.5px fully out. */
function coverage(distance) {
  return Math.min(1, Math.max(0, 0.5 - distance));
}

function blend(dst, offset, [r, g, b], alpha) {
  if (alpha <= 0) return;
  const da = dst[offset + 3] / 255;
  const out = alpha + da * (1 - alpha);
  dst[offset] = Math.round((r * alpha + dst[offset] * da * (1 - alpha)) / out);
  dst[offset + 1] = Math.round((g * alpha + dst[offset + 1] * da * (1 - alpha)) / out);
  dst[offset + 2] = Math.round((b * alpha + dst[offset + 2] * da * (1 - alpha)) / out);
  dst[offset + 3] = Math.round(out * 255);
}

/**
 * Draws the mark at `size` px.
 *
 * `bleed` fills the whole square instead of rounding the corners — iOS and
 * Android apply their own mask, and a tile rounded twice looks pinched.
 */
function renderMark(size, { bleed = false } = {}) {
  const pixels = new Uint8Array(size * size * 4);
  const scale = size / GRID;
  const half = size / 2;
  const radius = bleed ? 0 : RADIUS * scale;
  const halfStroke = (strokeFor(size) / 2) * scale;
  const arms = ARMS.map((arm) => arm.map((v) => v * scale));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const offset = (y * size + x) * 4;

      const tile = coverage(roundedBoxDistance(px, py, half, radius));
      if (tile <= 0) continue;
      blend(pixels, offset, TILE, tile);

      let mark = Infinity;
      for (const [ax, ay, bx, by] of arms) {
        mark = Math.min(mark, segmentDistance(px, py, ax, ay, bx, by) - halfStroke);
      }
      // Clipped to the tile so an arm cannot spill past a rounded corner.
      blend(pixels, offset, MARK, Math.min(coverage(mark), tile));
    }
  }

  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels, size) {
  const stride = size * 4;
  // One filter byte (0 = none) per scanline, as the PNG spec requires.
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICO with PNG-compressed entries — understood by every browser in support. */
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const directory = entries.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });

  return Buffer.concat([header, ...directory, ...entries.map((e) => e.png)]);
}

function png(size, options) {
  return encodePng(renderMark(size, options), size);
}

const files = [
  ['favicon.ico', encodeIco([16, 32, 48].map((size) => ({ size, png: png(size) })))],
  ['apple-touch-icon.png', png(180, { bleed: true })],
  ['icon-192.png', png(192)],
  ['icon-512.png', png(512)],
  ['icon-maskable-512.png', png(512, { bleed: true })],
];

for (const [name, data] of files) {
  await writeFile(join(OUT_DIR, name), data);
  console.log(`${name} — ${(data.length / 1024).toFixed(1)} kB`);
}
