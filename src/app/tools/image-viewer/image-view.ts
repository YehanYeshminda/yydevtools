import { base64ToBytes, sniffMime, splitDataUri } from '../base64/base64-codec';

/** The zoom levels the − / + buttons step through, as a fraction of actual size. */
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8] as const;

export function zoomIn(current: number): number {
  return ZOOM_STEPS.find((step) => step > current) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
}

export function zoomOut(current: number): number {
  return [...ZOOM_STEPS].reverse().find((step) => step < current) ?? ZOOM_STEPS[0];
}

export interface Decoded {
  bytes: Uint8Array<ArrayBuffer>;
  mime: string;
}

/**
 * Pasted Base64 or a `data:` URI, as bytes and a type. The type is the data
 * URI's own when it has one, otherwise sniffed from the bytes. Returns null for
 * input that is not Base64 at all; whether it is an *image* is the caller's
 * question, since a PDF pasted here should be offered elsewhere, not refused.
 */
export function decodePasted(text: string): Decoded | null {
  const { mime, data } = splitDataUri(text);
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64ToBytes(data);
  } catch {
    return null;
  }
  if (bytes.length === 0) {
    return null;
  }
  return { bytes, mime: mime || sniffMime(bytes) };
}

export function isImage(mime: string, name = ''): boolean {
  return mime.startsWith('image/') || /\.(hei[cf]|avif|bmp)$/i.test(name);
}

/** HEIC is the one format a browser's <img> cannot draw on its own. */
export function isHeic(mime: string, name = ''): boolean {
  return /^image\/hei[cf]$/.test(mime) || /\.hei[cf]$/i.test(name);
}
