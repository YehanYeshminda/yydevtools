/**
 * Rasterising PDF pages with the pdf.js already vendored in `public/pdfjs`.
 *
 * That copy exists for the PDF Viewer, which embeds the full pdf.js *viewer* in
 * an iframe. This reaches for the library underneath it instead, so the tools
 * can rasterise pages themselves — and, more to the point, so no second PDF
 * engine has to be added to the bundle for a job the site can already do.
 *
 * Two callers, wanting different things from the same machinery: the Organizer
 * needs small thumbnails to arrange, and OCR needs a page at a resolution
 * Tesseract can read.
 *
 * The import specifier is built at runtime on purpose. A literal would make the
 * bundler try to resolve `/pdfjs/build/pdf.mjs` at build time, where it is not a
 * module path but a URL that only exists once the site is served; keeping it in
 * a variable leaves the import to the browser, which is the only party that can
 * resolve it.
 */

/** Where the vendored pdf.js lives once the site is served. */
const PDFJS_BASE = '/pdfjs';

/** The parts of pdf.js this file uses — far narrower than its real surface. */
interface PdfPageProxy {
  /** The page's own `/Rotate`, in degrees. */
  rotate: number;
  getViewport(options: { scale: number; rotation?: number }): {
    width: number;
    height: number;
  };
  render(options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }): { promise: Promise<void>; cancel(): void };
  cleanup(): void;
}

interface PdfDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxy>;
}

/**
 * What `getDocument` returns.
 *
 * Tearing a document down goes through here rather than through the document
 * proxy: the proxy has no `destroy` — only the loading task does, because it is
 * the thing that owns the worker.
 */
interface PdfLoadingTask {
  promise: Promise<PdfDocumentProxy>;
  destroy(): Promise<void>;
}

interface PdfJsModule {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(options: Record<string, unknown>): PdfLoadingTask;
}

let loading: Promise<PdfJsModule> | null = null;

/** Loads pdf.js once and points it at the vendored worker and font data. */
function loadPdfJs(): Promise<PdfJsModule> {
  loading ??= (async () => {
    const specifier = `${PDFJS_BASE}/build/pdf.mjs`;
    const module = (await import(/* @vite-ignore */ specifier)) as PdfJsModule;
    module.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/build/pdf.worker.mjs`;
    return module;
  })();
  return loading;
}

export interface RenderedPage {
  index: number;
  dataUrl: string;
}

/**
 * An open document, kept so every page can be rendered without re-parsing.
 *
 * Callers must `close()` it — pdf.js holds a worker and a parsed structure per
 * document, and a session that loads several files would otherwise keep them
 * all alive.
 */
export class PdfDocumentRenderer {
  private constructor(
    private readonly doc: PdfDocumentProxy,
    private readonly task: PdfLoadingTask,
  ) {}

  static async open(bytes: Uint8Array): Promise<PdfDocumentRenderer> {
    const pdfjs = await loadPdfJs();
    const task = pdfjs.getDocument({
      // pdf.js takes ownership of the buffer it is given, so hand it a copy —
      // the caller still needs its own bytes for the pdf-lib export.
      data: bytes.slice(),
      cMapUrl: `${PDFJS_BASE}/web/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_BASE}/web/standard_fonts/`,
      // Nothing here needs scripting or embedded fonts to be executed, and this
      // is somebody else's document.
      isEvalSupported: false,
    });
    return new PdfDocumentRenderer(await task.promise, task);
  }

  get pageCount(): number {
    return this.doc.numPages;
  }

  /** The unrotated size of every page, in points. */
  async pageSizes(): Promise<Array<{ width: number; height: number }>> {
    const sizes: Array<{ width: number; height: number }> = [];
    for (let number = 1; number <= this.doc.numPages; number++) {
      const page = await this.doc.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      sizes.push({ width: viewport.width, height: viewport.height });
      page.cleanup();
    }
    return sizes;
  }

  /** Each page's own `/Rotate` value, in degrees. */
  async pageRotations(): Promise<number[]> {
    const rotations: number[] = [];
    for (let number = 1; number <= this.doc.numPages; number++) {
      const page = await this.doc.getPage(number);
      rotations.push(((page.rotate % 360) + 360) % 360);
      page.cleanup();
    }
    return rotations;
  }

  /**
   * Renders a page to a canvas at `scale` times its natural size, ignoring the
   * page's own `/Rotate`.
   *
   * Ignoring the rotation is what makes the result usable as a coordinate
   * system: every pixel maps to the unrotated page by a single division, with
   * no rotation matrix to invert when placing text back onto it. Callers that
   * need the *visual* orientation want the thumbnail path instead.
   */
  async renderPageCanvas(
    pageIndex: number,
    scale: number,
  ): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
    const page = await this.doc.getPage(pageIndex + 1);
    try {
      const viewport = page.getViewport({ scale, rotation: 0 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        throw new Error('This browser could not open a drawing surface.');
      }
      // Recognition on a transparent background reads as black-on-black.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      return { canvas, width: canvas.width, height: canvas.height };
    } finally {
      page.cleanup();
    }
  }

  /**
   * Renders one page to a data URL no wider or taller than `maxEdge`.
   *
   * JPEG rather than PNG: a thumbnail of a scanned page is a photograph, and a
   * grid of three hundred lossless ones is tens of megabytes of live memory for
   * no visible gain.
   */
  async renderThumbnail(pageIndex: number, maxEdge: number): Promise<string> {
    const page = await this.doc.getPage(pageIndex + 1);
    try {
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(maxEdge / base.width, maxEdge / base.height, 2);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('This browser could not open a drawing surface.');
      }
      // Pages are transparent where nothing is drawn; without this a scan
      // renders as dark grey on the card instead of white paper.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: context, viewport }).promise;
      return canvas.toDataURL('image/jpeg', 0.72);
    } finally {
      page.cleanup();
    }
  }

  close(): void {
    void this.task.destroy().catch(() => {
      // Already torn down, or the worker went away. Nothing to recover.
    });
  }
}
