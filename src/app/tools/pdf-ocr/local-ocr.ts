/**
 * OCR that never leaves the browser.
 *
 * Tesseract compiled to WebAssembly reads the page images, and the recognised
 * words are written back over the original pages as invisible text — the same
 * shape of output the hosted ocrmypdf service produces, assembled here instead.
 *
 * The point is not to replace the hosted path. Recognition is slow and the
 * engine is a several-megabyte download, so this is the better answer for a
 * short English document and the worse one for a hundred-page multilingual
 * scan. What it buys, for the documents it does suit, is that a payslip or a
 * medical letter is never uploaded at all.
 *
 * **Every asset is served from this origin.** tesseract.js defaults to fetching
 * its worker, engine and language data from a public CDN, which would quietly
 * turn a tool that promises to upload nothing into one that announces to a
 * third party that you are OCR-ing something. The paths below point at files
 * copied out of `node_modules` at build time (see `assets` in angular.json).
 */
import { PDFDocument, StandardFonts, TextRenderingMode } from '@cantoo/pdf-lib';
import {
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
} from '@cantoo/pdf-lib';

import { PdfDocumentRenderer } from '../../core/pdf-render';
import { horizontalScale, placeWords, type OcrWord } from './ocr-layer';

/** Where the build drops the tesseract worker, engine and language data. */
const TESSERACT_BASE = '/tesseract/';

/**
 * Target resolution for recognition, in DPI.
 *
 * Tesseract is trained around 300 DPI and falls off sharply below about 200.
 * PDF points are 72 to the inch, so this is the scale the page is rasterised
 * at — high enough to read small print, low enough that an A4 page stays a
 * sane amount of memory.
 */
const OCR_DPI = 220;
const PDF_DPI = 72;

/** Beyond this many pixels on the long edge, back off rather than risk the tab. */
const MAX_EDGE_PIXELS = 4000;

export type OcrStage = 'starting' | 'rendering' | 'recognising' | 'writing';

export interface LocalOcrProgress {
  stage: OcrStage;
  /** 1-based page being worked on; 0 while starting up. */
  page: number;
  pages: number;
}

export interface LocalOcrOptions {
  bytes: Uint8Array;
  onProgress?: (progress: LocalOcrProgress) => void;
  signal?: AbortSignal;
}

export interface LocalOcrResult {
  bytes: Uint8Array;
  /** How many words made it into the text layer, across the whole document. */
  words: number;
}

/**
 * Raised when this document is one the local path should not attempt.
 *
 * Distinct from a failure: the caller is expected to offer the hosted service,
 * which can do the job properly, rather than report an error.
 */
export class LocalOcrUnsupported extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalOcrUnsupported';
  }
}

/** Minimal shape of the tesseract.js module, so its types stay out of the app. */
interface TesseractWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
interface TesseractLine {
  words: TesseractWord[];
}
interface TesseractParagraph {
  lines: TesseractLine[];
}
interface TesseractBlock {
  paragraphs: TesseractParagraph[];
}
interface TesseractWorker {
  recognize(
    image: HTMLCanvasElement,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>,
  ): Promise<{ data: { blocks: TesseractBlock[] | null } }>;
  terminate(): Promise<void>;
}

/**
 * Recognises every page and returns the same document with a text layer added.
 *
 * The original pages are copied across untouched; nothing is re-rendered into
 * the output, so a vector page stays vector and a scan keeps whatever quality
 * it arrived with.
 */
export async function runLocalOcr(options: LocalOcrOptions): Promise<LocalOcrResult> {
  const { bytes, onProgress, signal } = options;
  const report = (stage: OcrStage, page: number, pages: number) =>
    onProgress?.({ stage, page, pages });

  report('starting', 0, 0);
  throwIfAborted(signal);

  const renderer = await PdfDocumentRenderer.open(bytes);
  let worker: TesseractWorker | null = null;

  try {
    const pageCount = renderer.pageCount;
    const sizes = await renderer.pageSizes();

    // Pages are rasterised without their `/Rotate`, which is what keeps the
    // coordinate mapping a single division rather than a matrix to invert. The
    // cost is that a rotated page reaches Tesseract sideways, where it reads
    // almost nothing — so hand those to the hosted service, which straightens
    // pages first, instead of returning a confidently empty text layer.
    const rotations = await renderer.pageRotations();
    const rotated = rotations.filter((angle) => angle !== 0).length;
    if (rotated > 0) {
      throw new LocalOcrUnsupported(
        `${rotated} ${rotated === 1 ? 'page is' : 'pages are'} rotated, which in-browser ` +
          'recognition reads poorly. The hosted service straightens pages first.',
      );
    }

    worker = await createWorker();
    throwIfAborted(signal);

    const out = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const font = await out.embedFont(StandardFonts.Helvetica);
    let total = 0;

    for (let index = 0; index < pageCount; index++) {
      throwIfAborted(signal);
      report('rendering', index + 1, pageCount);

      const size = sizes[index];
      const scale = scaleFor(size);
      const { canvas } = await renderer.renderPageCanvas(index, scale);

      throwIfAborted(signal);
      report('recognising', index + 1, pageCount);
      const { data } = await worker.recognize(canvas, undefined, { blocks: true });

      // Free the raster before the next page allocates its own.
      canvas.width = 0;
      canvas.height = 0;

      const placements = placeWords(collectWords(data.blocks), {
        scale,
        pageHeight: size.height,
      });
      total += placements.length;

      const page = out.getPage(index);
      const fontKey = page.node.newFontDictionary(font.name, font.ref);
      for (const placement of placements) {
        const natural = font.widthOfTextAtSize(placement.text, placement.size);
        page.pushOperators(
          pushGraphicsState(),
          beginText(),
          // Mode 3 draws nothing at all. Drawing white text would still cover
          // the page underneath, and drawing transparent text leaves it in the
          // rendering pipeline for no reason — invisible is its own mode
          // precisely because this is what it is for.
          setTextRenderingMode(TextRenderingMode.Invisible),
          setFontAndSize(fontKey, placement.size),
          // The matrix carries the horizontal squeeze as well as the position,
          // so the word spans exactly the box it was read from.
          setTextMatrix(
            horizontalScale(natural, placement.targetWidth),
            0,
            0,
            1,
            placement.x,
            placement.y,
          ),
          showText(font.encodeText(placement.text)),
          endText(),
          popGraphicsState(),
        );
      }
    }

    throwIfAborted(signal);
    report('writing', pageCount, pageCount);
    return { bytes: await out.save(), words: total };
  } finally {
    renderer.close();
    await worker?.terminate().catch(() => {
      // Already gone; nothing to recover.
    });
  }
}

/** Rasterisation scale for a page, in image pixels per PDF point. */
function scaleFor(size: { width: number; height: number }): number {
  const wanted = OCR_DPI / PDF_DPI;
  const longEdge = Math.max(size.width, size.height);
  return Math.min(wanted, MAX_EDGE_PIXELS / Math.max(1, longEdge));
}

/**
 * Tesseract's LSTM engine, which is the modern one and the only one the
 * vendored core is built with. `OEM.LSTM_ONLY` by value, so nothing has to be
 * imported from the package just to name it.
 */
const OEM_LSTM_ONLY = 1;

async function createWorker(): Promise<TesseractWorker> {
  // The prebuilt browser bundle, not the package entry point: tesseract.js has
  // no ESM entry, and its CommonJS `main` reaches for `node-fetch` and friends,
  // which drags Node plumbing into a browser build.
  //
  // A *literal* specifier, unlike the runtime-built one used for pdf.js. The
  // difference is what each path is: pdf.js is served from `public/` as a URL
  // the browser resolves itself, while this is a package path that only the
  // bundler can resolve — leave it in a variable and the browser is handed a
  // bare specifier it has no idea what to do with.
  // Everything hangs off the default export: the bundle is a CommonJS build
  // wrapped for ESM, so there are no named exports to destructure.
  const { default: Tesseract } = await import('tesseract.js/dist/tesseract.esm.min.js');

  return Tesseract.createWorker('eng', OEM_LSTM_ONLY, {
    workerPath: `${TESSERACT_BASE}worker.min.js`,
    corePath: TESSERACT_BASE,
    langPath: TESSERACT_BASE,
    // The vendored model is gzipped, as it ships from npm.
    gzip: true,
  });
}

/** Flattens Tesseract's block → paragraph → line → word tree. */
function collectWords(blocks: TesseractBlock[] | null): OcrWord[] {
  const words: OcrWord[] = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          words.push({ text: word.text, confidence: word.confidence, bbox: word.bbox });
        }
      }
    }
  }
  return words;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('Cancelled.', 'AbortError');
  }
}
