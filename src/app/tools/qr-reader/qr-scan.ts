import type { ReadResult, ReaderOptions } from 'zxing-wasm/reader';

import { describeContent, type QrContent } from './qr-content';

export interface ScannedCode {
  /** "QR Code", "EAN-13", "Data Matrix"… */
  format: string;
  text: string;
  content: QrContent;
}

let reader: Promise<typeof import('zxing-wasm/reader')> | null = null;

/**
 * ZXing, loaded on first use. Its WebAssembly (about 1 MB) is served from this
 * site — the library's default fetches it from jsDelivr, which would tell a
 * third party each time someone here scanned something.
 */
function loadReader(): Promise<typeof import('zxing-wasm/reader')> {
  reader ??= import('zxing-wasm/reader').then((zxing) => {
    zxing.prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith('.wasm') ? `/zxing/${path}` : prefix + path,
      },
    });
    return zxing;
  });
  return reader;
}

/** Every code in the frame, QR and barcodes alike. */
export async function scan(image: ImageData, options: ReaderOptions): Promise<ScannedCode[]> {
  const zxing = await loadReader();
  const results: ReadResult[] = await zxing.readBarcodes(image, options);
  return results
    .filter((result) => result.isValid)
    .map((result) => ({
      format: zxing.formatToLabel(result.format) ?? result.format,
      text: result.text,
      content: describeContent(result.text),
    }));
}
