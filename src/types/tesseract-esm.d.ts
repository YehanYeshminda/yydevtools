/**
 * Types for tesseract.js's prebuilt browser bundle.
 *
 * The package ships no ESM entry point and its `main` is CommonJS that pulls in
 * `node-fetch` and friends, so importing it by name drags Node plumbing into a
 * browser build. `dist/tesseract.esm.min.js` is the browser build — but being a
 * dist file it carries no types of its own, so the narrow slice this project
 * uses is declared here.
 */
declare module 'tesseract.js/dist/tesseract.esm.min.js' {
  export interface TesseractBbox {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }

  export interface TesseractWord {
    text: string;
    confidence: number;
    bbox: TesseractBbox;
  }

  export interface TesseractBlock {
    paragraphs: Array<{ lines: Array<{ words: TesseractWord[] }> }>;
  }

  export interface TesseractWorker {
    recognize(
      image: HTMLCanvasElement,
      options?: Record<string, unknown>,
      output?: Record<string, boolean>,
    ): Promise<{ data: { blocks: TesseractBlock[] | null } }>;
    terminate(): Promise<void>;
  }

  /**
   * The bundle is a CommonJS build wrapped for ESM, so everything arrives on
   * the default export rather than as named ones.
   */
  const Tesseract: {
    createWorker(
      langs: string,
      oem: number,
      options: Record<string, unknown>,
    ): Promise<TesseractWorker>;
  };

  export default Tesseract;
}
