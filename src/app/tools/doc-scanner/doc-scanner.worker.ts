/**
 * The scanner's worker: decodes each photo once, keeps it at a working size,
 * and turns a quad plus a filter into a JPEG of the straightened page.
 *
 * A 12-megapixel photo through a bilinear warp and an adaptive threshold is a
 * few hundred milliseconds of pure arithmetic — fine here, a frozen page on
 * the main thread.
 */
import { expose, transfer } from 'comlink';

import { applyFilter, outputSize, warp, type Quad, type ScanFilter } from './warp';

/** A4 at 300 dpi is ~2480 px on the long side; more only makes the PDF fatter. */
const MAX_SIDE = 2500;
/** What the corner-dragging view gets. Enough to see the page edges. */
const PREVIEW_SIDE = 1400;

const pages = new Map<string, ImageBitmap>();

/** Same approach as the image codec: native first, libheif only for HEIC. */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (error) {
    const { isHeic, heicTo } = await import('heic-to');
    if (!(await isHeic(file))) {
      throw error;
    }
    return heicTo({ blob: file, type: 'bitmap', options: { imageOrientation: 'from-image' } });
  }
}

async function shrink(bitmap: ImageBitmap, maxSide: number): Promise<ImageBitmap> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) {
    return bitmap;
  }
  return createImageBitmap(bitmap, {
    resizeWidth: Math.round(bitmap.width * scale),
    resizeHeight: Math.round(bitmap.height * scale),
    resizeQuality: 'high',
  });
}

async function toJpeg(
  draw: (ctx: OffscreenCanvasRenderingContext2D) => void,
  width: number,
  height: number,
  quality: number,
): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('no canvas');
  }
  draw(ctx);
  return (await canvas.convertToBlob({ type: 'image/jpeg', quality })).arrayBuffer();
}

const api = {
  /** Decode a photo, keep it at working size, and return a preview JPEG. */
  async open(id: string, file: File) {
    const full = await decode(file);
    const working = await shrink(full, MAX_SIDE);
    if (working !== full) {
      full.close();
    }
    pages.get(id)?.close();
    pages.set(id, working);

    const small = await shrink(working, PREVIEW_SIDE);
    const preview = await toJpeg(
      (ctx) => ctx.drawImage(small, 0, 0, small.width, small.height),
      small.width,
      small.height,
      0.85,
    );
    if (small !== working) {
      small.close();
    }
    return transfer({ width: working.width, height: working.height, preview }, [preview]);
  },

  /** Straighten the page inside `quad` and apply the look. */
  async scan(id: string, quad: Quad, filter: ScanFilter) {
    const bitmap = pages.get(id);
    if (!bitmap) {
      throw new Error('That page is no longer loaded.');
    }
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('no canvas');
    }
    ctx.drawImage(bitmap, 0, 0);
    const source = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

    const { width, height } = outputSize(quad, MAX_SIDE);
    const page = warp(source, quad, width, height);
    applyFilter(page, filter);

    const buffer = await toJpeg(
      (out) => out.putImageData(page, 0, 0),
      width,
      height,
      filter === 'bw' ? 0.8 : 0.86,
    );
    return transfer({ buffer, width, height }, [buffer]);
  },

  close(id: string): void {
    pages.get(id)?.close();
    pages.delete(id);
  },

  closeAll(): void {
    for (const bitmap of pages.values()) {
      bitmap.close();
    }
    pages.clear();
  },
};

export type DocScannerApi = typeof api;

expose(api);
