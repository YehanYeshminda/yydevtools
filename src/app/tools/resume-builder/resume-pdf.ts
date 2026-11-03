/**
 * Turning a resume into PDF bytes, in the browser.
 *
 * pdfmake is about 830 kB minified, so it is imported here, on first use, and
 * this module is itself only imported once someone is on the Resume Builder.
 * The fonts are the OFL TTFs in public/fonts/resume, fetched from this origin
 * the first time a pairing is used and then kept in pdfmake's in-memory file
 * system, so a redraw does not fetch them again. pdfkit (inside pdfmake)
 * embeds only the glyphs the resume uses, with a ToUnicode map, which is what
 * makes the text in the finished file selectable, searchable and readable by
 * applicant tracking systems.
 */
import { FONT_FAMILIES, FONT_PATH, buildDocument, familiesFor, type LayoutInput } from './resume-layout';

/** The few pdfmake calls this file makes; the instance, not its typings. */
interface PdfMake {
  setFonts(fonts: Record<string, Record<string, string>>): void;
  setUrlAccessPolicy(callback: (url: string) => boolean): void;
  createPdf(definition: unknown): { getBuffer(): Promise<Uint8Array> };
}

let loading: Promise<PdfMake> | null = null;

function loadPdfMake(): Promise<PdfMake> {
  loading ??= import('pdfmake/build/pdfmake').then((module) => {
    // A UMD bundle: the instance is the default export, and its methods live
    // on its prototype, so a namespace import would see none of them.
    const pdfMake = ((module as { default?: unknown }).default ?? module) as PdfMake;
    // Fonts are the only URLs a document here ever names. Anything else (a
    // pasted link is text, never a resource) is refused rather than fetched.
    const fonts = `${location.origin}${FONT_PATH}`;
    pdfMake.setUrlAccessPolicy((url) => url.startsWith(fonts));
    return pdfMake;
  });
  return loading;
}

export async function renderResume(input: LayoutInput): Promise<Uint8Array> {
  const pdfMake = await loadPdfMake();
  const fonts: Record<string, Record<string, string>> = {};
  for (const family of familiesFor(input.settings.fonts)) {
    fonts[family] = Object.fromEntries(
      Object.entries(FONT_FAMILIES[family]).map(([slot, file]) => [
        slot,
        `${location.origin}${FONT_PATH}${file}`,
      ]),
    );
  }
  // Only this pairing's families: pdfmake fetches every file it is given.
  pdfMake.setFonts(fonts);
  const bytes = await pdfMake.createPdf(buildDocument(input)).getBuffer();
  // Always a copy into a plain Uint8Array. pdfmake hands back its Buffer
  // polyfill, whose slice() is a view rather than a copy; pdf.js transfers the
  // buffer behind whatever it is given to its worker, so a view would leave the
  // bytes kept for Download detached the moment the preview was drawn.
  return new Uint8Array(bytes);
}

/**
 * Cuts a photo to a circle, as a PNG with transparent corners.
 *
 * pdfmake cannot clip an image, so the round photo is made here instead, once
 * per photo, and every design that wants a circle uses it.
 */
export async function roundPhoto(dataUrl: string, size = 480): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    return '';
  }
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  context.clip();
  context.drawImage(image, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}

/**
 * Reads a picked image into the square JPEG the resume stores.
 *
 * Centre-cropped to a square and scaled to 600px: big enough for a 2-inch
 * print at 300 dpi, small enough (about 60 kB) to live in localStorage and in
 * the exported JSON.
 */
export async function squarePhoto(file: Blob, size = 600): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
      return '';
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    return canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    bitmap.close();
  }
}
