/**
 * Runs every Base64 conversion off the main thread.
 *
 * Files are handed over as `File` objects, so their bytes are read here and
 * never materialise on the main thread; decoded bytes come back as a
 * transferred `ArrayBuffer`, so the result is moved rather than copied.
 */
import {
  base64ErrorMessage,
  base64ToBytes,
  bytesToBase64,
  decodeBase64ToText,
  encodeTextToBase64,
  sniffMime,
  splitDataUri,
} from './base64-codec';

export type WorkerRequest =
  | { id: number; kind: 'encode-file'; file: File }
  | { id: number; kind: 'encode-text'; text: string }
  | { id: number; kind: 'decode-text'; text: string }
  | { id: number; kind: 'decode-bytes'; text: string };

export type WorkerResponse =
  | { id: number; ok: true; kind: 'text'; value: string }
  | { id: number; ok: true; kind: 'bytes'; buffer: ArrayBuffer; byteLength: number; mime: string }
  | { id: number; ok: false; error: string };

/**
 * The DOM lib types `self` as a Window, whose `postMessage` has a different
 * signature. Narrow it to just the bits a dedicated worker actually uses.
 */
interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}

const ctx = self as unknown as WorkerScope;

ctx.addEventListener('message', (event) => {
  void handle(event.data as WorkerRequest);
});

async function handle(request: WorkerRequest): Promise<void> {
  try {
    switch (request.kind) {
      case 'encode-file': {
        const bytes = new Uint8Array(await request.file.arrayBuffer());
        ctx.postMessage({ id: request.id, ok: true, kind: 'text', value: bytesToBase64(bytes) });
        return;
      }
      case 'encode-text': {
        ctx.postMessage({
          id: request.id,
          ok: true,
          kind: 'text',
          value: encodeTextToBase64(request.text),
        });
        return;
      }
      case 'decode-text': {
        ctx.postMessage({
          id: request.id,
          ok: true,
          kind: 'text',
          value: decodeBase64ToText(request.text),
        });
        return;
      }
      case 'decode-bytes': {
        const { data, mime } = splitDataUri(request.text);
        const bytes = base64ToBytes(data);
        const buffer = bytes.buffer as ArrayBuffer;
        ctx.postMessage(
          {
            id: request.id,
            ok: true,
            kind: 'bytes',
            buffer,
            byteLength: bytes.byteLength,
            mime: mime || sniffMime(bytes),
          },
          [buffer],
        );
        return;
      }
    }
  } catch (error) {
    ctx.postMessage({ id: request.id, ok: false, error: base64ErrorMessage(error) });
  }
}
