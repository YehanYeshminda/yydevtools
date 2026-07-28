/**
 * Resizes and re-encodes images off the main thread.
 *
 * The encoders are mozjpeg and libwebp compiled to WebAssembly — the same ones
 * Squoosh uses — which beat the browser's own `convertToBlob` at any given
 * quality setting. That is the whole reason this tool used to upload to a
 * server; it does not need to any more.
 *
 * The source is decoded once, on `open`, and the bitmap is kept here. Every
 * subsequent `encode` re-uses it, so dragging the quality slider re-encodes
 * without re-decoding and without touching the network.
 *
 * If the WebAssembly cannot be loaded the canvas encoder takes over. The result
 * is a slightly larger file rather than a broken tool.
 */
import { expose, transfer } from 'comlink';
import jpegEncode, { init as initJpeg } from '@jsquash/jpeg/encode';
import webpEncode, { init as initWebp } from '@jsquash/webp/encode';
import { simd } from 'wasm-feature-detect';

/** Output types the tool offers. Both are lossy and widely supported. */
export type CodecFormat = 'image/jpeg' | 'image/webp';

/** Which encoder produced a result, so the UI can say when it fell back. */
export type Codec = 'wasm' | 'canvas';

export interface OpenedImage {
  width: number;
  height: number;
}

export interface EncodedImage {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  codec: Codec;
}

/** Where the build drops the codec binaries (see `assets` in angular.json). */
const WASM_BASE = '/wasm/';

/** The decoded source image, held between encodes. */
let source: ImageBitmap | null = null;

/**
 * What this worker exposes over Comlink.
 *
 * The state is the point: `source` lives here for the life of the worker, so
 * `open` is the only decode of the session however many times `encode` runs.
 */
const api = {
  async open(file: File): Promise<OpenedImage> {
    source?.close();
    // `from-image` honours the EXIF orientation, so a phone photo is not
    // silently rotated by the round trip through a canvas.
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { width: source.width, height: source.height };
  },

  async encode(
    format: CodecFormat,
    quality: number,
    maxDimension: number,
  ): Promise<EncodedImage> {
    if (!source) {
      throw new Error('No image is open.');
    }
    const result = await encode(source, format, quality, maxDimension);
    // Move the pixels rather than copying them.
    return transfer(result, [result.buffer]);
  },

  async close(): Promise<void> {
    source?.close();
    source = null;
  },
};

export type ImageCodecApi = typeof api;

expose(api);

async function encode(
  bitmap: ImageBitmap,
  format: CodecFormat,
  quality: number,
  maxDimension: number,
): Promise<EncodedImage> {
  const { width, height } = fitInside(bitmap.width, bitmap.height, maxDimension);

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('This browser could not open a drawing surface for the image.');
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);

  try {
    const pixels = context.getImageData(0, 0, width, height);
    const buffer =
      format === 'image/jpeg'
        ? await encodeJpeg(pixels, quality)
        : await encodeWebp(pixels, quality);
    return { buffer, width, height, codec: 'wasm' };
  } catch {
    // The codec could not be loaded or ran out of memory. The browser's own
    // encoder is always there.
    const blob = await canvas.convertToBlob({ type: format, quality: quality / 100 });
    return { buffer: await blob.arrayBuffer(), width, height, codec: 'canvas' };
  }
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
