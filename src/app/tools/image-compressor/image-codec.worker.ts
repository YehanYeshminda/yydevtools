/**
 * Resizes and re-encodes images off the main thread.
 *
 * The encoders are mozjpeg and libwebp compiled to WebAssembly — the same ones
 * Squoosh uses — which beat the browser's own `convertToBlob` at any given
 * quality setting. That is the whole reason this tool used to upload to a
 * server; it does not need to any more.
 *
 * Decoding is cached in a single slot rather than a map. One image open in the
 * UI is the interactive case: dragging the quality slider re-encodes over and
 * over, and the slot means it decodes once. A batch walks through many files
 * instead, where holding every decoded bitmap would be the wrong trade — a
 * 20 MB JPEG is well over 100 MB of RGBA once decoded, so twenty of them would
 * exhaust memory to save a decode that costs far less than the encode does.
 *
 * If the WebAssembly cannot be loaded the canvas encoder takes over. The result
 * is a slightly larger file rather than a broken tool.
 */
import { expose, transfer } from 'comlink';
import jpegEncode, { init as initJpeg } from '@jsquash/jpeg/encode';
import webpEncode, { init as initWebp } from '@jsquash/webp/encode';
import { simd } from 'wasm-feature-detect';

import { extractExifSegment, insertExifSegment } from './exif';

/** Output types the tool offers. Both are lossy and widely supported. */
export type CodecFormat = 'image/jpeg' | 'image/webp';

/** Which encoder produced a result, so the UI can say when it fell back. */
export type Codec = 'wasm' | 'canvas';

export interface OpenedImage {
  width: number;
  height: number;
  /** True when the source needed the HEIC decoder to be read at all. */
  heic: boolean;
}

export interface EncodeOptions {
  format: CodecFormat;
  /** 1–100. Ignored when `targetBytes` is set. */
  quality: number;
  /** Longest-edge cap in pixels; 0 keeps the original dimensions. */
  maxDimension: number;
  /** When > 0, search for the best quality that fits within this many bytes. */
  targetBytes: number;
  /** Carry the source's Exif into the output. JPEG → JPEG only. */
  keepMetadata: boolean;
}

export interface EncodedImage {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  codec: Codec;
  /** The quality actually used — the point of the search in target mode. */
  quality: number;
  /** True when even the lowest quality could not reach `targetBytes`. */
  targetMissed: boolean;
  /** True when Exif was carried across. */
  keptMetadata: boolean;
}

/** Where the build drops the codec binaries (see `assets` in angular.json). */
const WASM_BASE = '/wasm/';

/** Quality floor for the target-size search — below this JPEG is unusable. */
const MIN_SEARCH_QUALITY = 15;
const MAX_SEARCH_QUALITY = 95;

/** Longest edge of a generated preview — big enough to compare, small to build. */
const PREVIEW_MAX_EDGE = 2000;

/** The single decode slot: the last image opened or encoded. */
let cached: { id: string; bitmap: ImageBitmap } | null = null;

async function bitmapFor(id: string, file: File): Promise<ImageBitmap> {
  if (cached?.id === id) {
    return cached.bitmap;
  }
  cached?.bitmap.close();
  cached = null;

  const bitmap = await decode(file);
  cached = { id, bitmap };
  return bitmap;
}

/**
 * Decodes any image the browser understands, and HEIC — which it mostly does
 * not. `createImageBitmap` is tried first because it is native and fast; the
 * libheif build is ~2 MB, so it is imported only once something actually needs
 * it.
 */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    // `from-image` honours the EXIF orientation, so a phone photo is not
    // silently rotated by the round trip through a canvas.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (error) {
    const { isHeic, heicTo } = await import('heic-to');
    if (!(await isHeic(file))) {
      throw error;
    }
    return heicTo({ blob: file, type: 'bitmap', options: { imageOrientation: 'from-image' } });
  }
}

async function isHeicFile(file: File): Promise<boolean> {
  try {
    const { isHeic } = await import('heic-to');
    return await isHeic(file);
  } catch {
    return false;
  }
}

const api = {
  /** Decode a file to learn its dimensions, keeping the bitmap for the encode. */
  async open(id: string, file: File): Promise<OpenedImage> {
    const bitmap = await bitmapFor(id, file);
    // Only ask the HEIC sniffer when the name suggests it — it reads the file
    // header, and there is no reason to do that for an obvious JPEG.
    const heic = /\.hei[cf]$/i.test(file.name) ? await isHeicFile(file) : false;
    return { width: bitmap.width, height: bitmap.height, heic };
  },

  /**
   * A browser-renderable copy of the source, for the "before" side of the
   * comparison view.
   *
   * Only HEIC needs this: every other format can be shown straight from a blob
   * URL of the original file, but no major browser will render HEIC in an
   * `<img>` — which would leave the format this tool just learned to read with
   * no preview at all. The canvas encoder is used rather than mozjpeg because
   * this is a throwaway image and there is no reason to wait for WebAssembly.
   */
  async preview(id: string, file: File): Promise<ArrayBuffer> {
    const bitmap = await bitmapFor(id, file);
    const { width, height } = fitInside(bitmap.width, bitmap.height, PREVIEW_MAX_EDGE);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('This browser could not open a drawing surface for the image.');
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    const buffer = await blob.arrayBuffer();
    return transfer(buffer, [buffer]);
  },

  async encode(id: string, file: File, options: EncodeOptions): Promise<EncodedImage> {
    const bitmap = await bitmapFor(id, file);
    const { width, height } = fitInside(bitmap.width, bitmap.height, options.maxDimension);
    const pixels = rasterise(bitmap, width, height);

    const result =
      options.targetBytes > 0
        ? await searchToTarget(pixels, options)
        : await encodeOnce(pixels, options.format, options.quality);

    let buffer = result.buffer;
    let keptMetadata = false;
    if (options.keepMetadata && options.format === 'image/jpeg') {
      const source = new Uint8Array(await file.arrayBuffer());
      const segment = extractExifSegment(source);
      if (segment) {
        const spliced = insertExifSegment(new Uint8Array(buffer), segment);
        buffer = spliced.buffer.slice(
          spliced.byteOffset,
          spliced.byteOffset + spliced.byteLength,
        ) as ArrayBuffer;
        keptMetadata = true;
      }
    }

    const encoded: EncodedImage = {
      buffer,
      width,
      height,
      codec: result.codec,
      quality: result.quality,
      targetMissed: result.targetMissed,
      keptMetadata,
    };
    // Move the pixels rather than copying them.
    return transfer(encoded, [encoded.buffer]);
  },

  async close(): Promise<void> {
    cached?.bitmap.close();
    cached = null;
  },
};

export type ImageCodecApi = typeof api;

expose(api);

// --- Encoding -----------------------------------------------------------

interface Attempt {
  buffer: ArrayBuffer;
  codec: Codec;
  quality: number;
  targetMissed: boolean;
}

function rasterise(bitmap: ImageBitmap, width: number, height: number): ImageData {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('This browser could not open a drawing surface for the image.');
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

async function encodeOnce(
  pixels: ImageData,
  format: CodecFormat,
  quality: number,
): Promise<Attempt> {
  try {
    const buffer =
      format === 'image/jpeg'
        ? await encodeJpeg(pixels, quality)
        : await encodeWebp(pixels, quality);
    return { buffer, codec: 'wasm', quality, targetMissed: false };
  } catch {
    // The codec could not be loaded or ran out of memory. The browser's own
    // encoder is always there.
    const canvas = new OffscreenCanvas(pixels.width, pixels.height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('This browser could not open a drawing surface for the image.');
    }
    context.putImageData(pixels, 0, 0);
    const blob = await canvas.convertToBlob({ type: format, quality: quality / 100 });
    return { buffer: await blob.arrayBuffer(), codec: 'canvas', quality, targetMissed: false };
  }
}

/**
 * Finds the highest quality whose output fits inside `targetBytes`.
 *
 * File size rises with quality, so this is a binary search — about seven
 * encodes instead of the hundred a linear walk would need. The pixels are
 * rasterised once by the caller and reused, so each step is only the encoder.
 *
 * The best fit found so far is kept rather than recomputed at the end, which
 * matters because size is not perfectly monotonic: two adjacent quality steps
 * occasionally invert, and re-encoding at `lo` could land just over the target.
 */
async function searchToTarget(pixels: ImageData, options: EncodeOptions): Promise<Attempt> {
  let lo = MIN_SEARCH_QUALITY;
  let hi = MAX_SEARCH_QUALITY;
  let best: Attempt | null = null;
  let smallest: Attempt | null = null;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const attempt = await encodeOnce(pixels, options.format, mid);

    if (!smallest || attempt.buffer.byteLength < smallest.buffer.byteLength) {
      smallest = attempt;
    }
    if (attempt.buffer.byteLength <= options.targetBytes) {
      best = attempt;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // Nothing fit. Hand back the smallest we saw and say so, rather than
  // pretending a 4 MB result met a 500 kB target.
  if (!best) {
    return { ...(smallest as Attempt), targetMissed: true };
  }
  return best;
}

async function encodeJpeg(pixels: ImageData, quality: number): Promise<ArrayBuffer> {
  await ready('jpeg');
  return jpegEncode(pixels, { quality });
}

async function encodeWebp(pixels: ImageData, quality: number): Promise<ArrayBuffer> {
  await ready('webp');
  return webpEncode(pixels, { quality });
}

/**
 * Loads a codec once, on first use.
 *
 * A failure is remembered rather than retried: if the binary is missing it will
 * still be missing on the next keystroke, and the caller has a working fallback.
 */
const loading = new Map<'jpeg' | 'webp', Promise<void>>();

function ready(codec: 'jpeg' | 'webp'): Promise<void> {
  let pending = loading.get(codec);
  if (!pending) {
    pending = codec === 'jpeg' ? loadJpeg() : loadWebp();
    loading.set(codec, pending);
  }
  return pending;
}

async function loadJpeg(): Promise<void> {
  await initJpeg(await compile(`${WASM_BASE}mozjpeg_enc.wasm`));
}

async function loadWebp(): Promise<void> {
  // The SIMD build is much faster but needs matching binary and glue, so the
  // same check has to choose both.
  const useSimd = await simd();
  await initWebp(await compile(`${WASM_BASE}${useSimd ? 'webp_enc_simd' : 'webp_enc'}.wasm`));
}

/**
 * Fetches and compiles a codec binary.
 *
 * Compiling from an ArrayBuffer rather than streaming keeps this working
 * wherever the binaries are served without an `application/wasm` content type,
 * which `compileStreaming` refuses outright.
 */
async function compile(url: string): Promise<WebAssembly.Module> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load the codec at ${url}.`);
  }
  return WebAssembly.compile(await response.arrayBuffer());
}

/** Dimensions after fitting inside a `max × max` box, never enlarging. */
function fitInside(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  if (maxDimension > 0 && (width > maxDimension || height > maxDimension)) {
    const scale = Math.min(maxDimension / width, maxDimension / height);
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }
  return { width, height };
}
