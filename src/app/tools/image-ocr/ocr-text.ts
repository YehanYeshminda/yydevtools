/** A language choice: Tesseract's codes, `+`-joined when a page mixes scripts. */
export interface OcrLanguage {
  code: string;
  label: string;
}

/**
 * The models the build ships (see `assets` in angular.json). Each downloads
 * only when chosen. The mixed options exist because Sinhala and Tamil text
 * routinely carries English words, and a single-script model misreads them.
 */
export const OCR_LANGUAGES: readonly OcrLanguage[] = [
  { code: 'eng', label: 'English' },
  { code: 'sin', label: 'Sinhala' },
  { code: 'tam', label: 'Tamil' },
  { code: 'sin+eng', label: 'Sinhala + English' },
  { code: 'tam+eng', label: 'Tamil + English' },
];

/** Beyond this on the long edge the image is scaled down, to spare the tab's memory. */
const MAX_EDGE = 4000;

/**
 * Below this on the long edge the image is scaled up. Tesseract is tuned for
 * text far taller than a screenshot's: measured on a 10 px screenshot, 93% of
 * characters came back right as it was and 100% enlarged (84% → 100% at 9 px).
 */
const MIN_EDGE = 1500;

/** The factor to draw an image at before recognition. */
export function ocrScale(width: number, height: number): number {
  const edge = Math.max(width, height, 1);
  if (edge > MAX_EDGE) {
    return MAX_EDGE / edge;
  }
  // ponytail: whole-image heuristic from pixel size, not measured text height.
  return edge < MIN_EDGE ? Math.min(3, MIN_EDGE / edge) : 1;
}

/** Tesseract's text, without trailing spaces on lines or runs of blank lines. */
export function tidyText(text: string): string {
  return text
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
