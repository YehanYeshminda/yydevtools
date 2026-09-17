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
  getTextContent(): Promise<{
    items: Array<{ str?: string; transform?: number[]; width?: number; height?: number }>;
  }>;
  cleanup(): void;
}

/** A run of text on a page, in unrotated points with the origin bottom-left. */
export interface PageTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
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

/**
 * How often a hidden page is handed a frame. Roughly 60Hz, like the real thing.
 */
const HIDDEN_FRAME_MS = 16;

/**
 * Frames for a render that nobody is looking at.
 *
 * pdf.js cuts a display render into slices and schedules each one through
 * `requestAnimationFrame`, which browsers stop firing while the page is hidden.
 * The render promise then never settles — no error, no rejection, just a
 * spinner that runs until you come back, at which point it finishes instantly.
 * Harmless for a preview somebody is watching, and wrong for the jobs here that
 * are meant to be left alone: three hundred thumbnails, or OCR across a long
 * document, stops dead the moment you switch tab.
 *
 * `intent: 'print'` turns the rAF path off, and is the obvious fix until you
 * read what else it changes: it also decides which annotations and which
 * optional content get drawn. Redact and Sign use the raster as the coordinate
 * system for editing the real file, so a picture that differs from the document
 * is the one thing they cannot have.
 *
 * So the missing frames are supplied instead, and only the missing ones. While
 * a render is in flight this hands straight back to the browser's own
 * requestAnimationFrame whenever the page is visible, and answers on a timer
 * when it is not — which is the work the browser was deferring until you
 * returned, done now instead. The handles it issues are negative, and the
 * spec's are positive longs, so a cancel always routes back to whichever one
 * issued it.
 */
let rendersInFlight = 0;
let realFrames: {
  request: typeof window.requestAnimationFrame;
  cancel: typeof window.cancelAnimationFrame;
} | null = null;
const hiddenFrames = new Map<number, ReturnType<typeof setTimeout>>();
let nextHiddenHandle = -1;

function keepFramesComing(): void {
  if (rendersInFlight++ > 0 || typeof window === 'undefined' || realFrames) {
    return;
  }
  const real = {
    request: window.requestAnimationFrame,
    cancel: window.cancelAnimationFrame,
  };
  realFrames = real;

  put('requestAnimationFrame', (callback: FrameRequestCallback): number => {
    if (!document.hidden) {
      return real.request.call(window, callback);
    }
    const handle = nextHiddenHandle--;
    hiddenFrames.set(
      handle,
      setTimeout(() => {
        hiddenFrames.delete(handle);
        callback(performance.now());
      }, HIDDEN_FRAME_MS),
    );
    return handle;
  });

  put('cancelAnimationFrame', (handle: number): void => {
    const timer = hiddenFrames.get(handle);
    if (timer === undefined) {
      real.cancel.call(window, handle);
      return;
    }
    hiddenFrames.delete(handle);
    clearTimeout(timer);
  });
}

/**
 * Puts a function on `window` under a name the platform already owns.
 *
 * `defineProperty` rather than assignment, because the two frame functions are
 * not always writable — under the test runner's DOM they are not, and a plain
 * assignment there fails *silently*, leaving a shim that reports itself
 * installed and does nothing. Restoring goes through here too, so what is left
 * behind is the browser's own function under its own name.
 */
function put(name: 'requestAnimationFrame' | 'cancelAnimationFrame', value: unknown): void {
  Object.defineProperty(window, name, { value, writable: true, configurable: true });
}

function releaseFrames(): void {
  if (--rendersInFlight > 0 || !realFrames) {
    return;
  }
  put('requestAnimationFrame', realFrames.request);
  put('cancelAnimationFrame', realFrames.cancel);
  realFrames = null;
  for (const timer of hiddenFrames.values()) {
    clearTimeout(timer);
  }
  hiddenFrames.clear();
}

/**
 * Runs `work` with frames guaranteed, whether or not the page is on screen.
 *
 * Exported for the test that proves the shim hands back what it borrowed;
 * everything else in the app reaches it through the renderer below.
 */
export async function withRenderFrames<T>(work: () => Promise<T>): Promise<T> {
  keepFramesComing();
  try {
    return await work();
  } finally {
    releaseFrames();
  }
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
      await withRenderFrames(() => page.render({ canvasContext: context, viewport }).promise);
      return { canvas, width: canvas.width, height: canvas.height };
    } finally {
      page.cleanup();
    }
  }

  /**
   * The text runs on a page with where they sit, for finding things to redact.
   * Positions come straight from the content stream's text matrix, so they are
   * in the unrotated frame — the same one `renderPageCanvas` draws in.
   */
  async pageText(pageIndex: number): Promise<PageTextItem[]> {
    const page = await this.doc.getPage(pageIndex + 1);
    try {
      const { items } = await page.getTextContent();
      const runs: PageTextItem[] = [];
      for (const item of items) {
        if (!item.str || !item.transform || item.width === undefined) {
          continue;
        }
        const [a, b, , , e, f] = item.transform;
        runs.push({
          str: item.str,
          x: e,
          y: f,
          width: item.width,
          // Font size is the scale of the text matrix; the width already has it applied.
          height: item.height || Math.hypot(a, b),
        });
      }
      return runs;
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

      await withRenderFrames(() => page.render({ canvasContext: context, viewport }).promise);
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
