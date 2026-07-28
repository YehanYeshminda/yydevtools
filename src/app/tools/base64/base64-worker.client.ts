import {
  base64ErrorMessage,
  base64ToBytes,
  bytesToBase64,
  decodeBase64ToText,
  encodeTextToBase64,
  sniffMime,
  splitDataUri,
} from './base64-codec';
import type { WorkerRequest, WorkerResponse } from './base64.worker';

export interface DecodedBytes {
  bytes: Uint8Array<ArrayBuffer>;
  mime: string;
}

type Success = Extract<WorkerResponse, { ok: true }>;

interface Pending {
  resolve: (value: Success) => void;
  reject: (reason: Error) => void;
}

/**
 * Promise wrapper around `base64.worker.ts`.
 *
 * The worker is created lazily on first use — these tool pages are prerendered,
 * and the server has no `Worker`. Where one is genuinely missing (prerender, or
 * a browser without module workers) the same codec runs inline instead, so the
 * tool degrades in speed rather than breaking.
 */
export class Base64WorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  encodeFile(file: File): Promise<string> {
    return this.text(
      (id) => ({ id, kind: 'encode-file', file }),
      async () => bytesToBase64(new Uint8Array(await file.arrayBuffer())),
    );
  }

  encodeText(text: string): Promise<string> {
    return this.text(
      (id) => ({ id, kind: 'encode-text', text }),
      async () => encodeTextToBase64(text),
    );
  }

  decodeText(text: string): Promise<string> {
    return this.text(
      (id) => ({ id, kind: 'decode-text', text }),
      async () => decodeBase64ToText(text),
    );
  }

  async decodeBytes(text: string): Promise<DecodedBytes> {
    const worker = this.ensure();
    if (!worker) {
      const { data, mime } = splitDataUri(text);
      const bytes = base64ToBytes(data);
      return { bytes, mime: mime || sniffMime(bytes) };
    }
    const response = await this.send(worker, (id) => ({ id, kind: 'decode-bytes', text }));
    if (response.kind !== 'bytes') {
      throw new Error('Unexpected worker response.');
    }
    return { bytes: new Uint8Array(response.buffer, 0, response.byteLength), mime: response.mime };
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) {
      pending.reject(new Error('Cancelled.'));
    }
    this.pending.clear();
  }

  private async text(
    make: (id: number) => WorkerRequest,
    inline: () => Promise<string>,
  ): Promise<string> {
    const worker = this.ensure();
    if (!worker) {
      return inline();
    }
    const response = await this.send(worker, make);
    if (response.kind !== 'text') {
      throw new Error('Unexpected worker response.');
    }
    return response.value;
  }

  private send(worker: Worker, make: (id: number) => WorkerRequest): Promise<Success> {
    const id = this.nextId++;
    return new Promise<Success>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage(make(id));
    });
  }

  private ensure(): Worker | null {
    if (this.worker) {
      return this.worker;
    }
    if (typeof Worker === 'undefined') {
      return null;
    }
    const worker = new Worker(new URL('./base64.worker', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }
      this.pending.delete(response.id);
      if (response.ok) {
        pending.resolve(response);
      } else {
        pending.reject(new Error(response.error));
      }
    });
    worker.addEventListener('error', (event) => {
      const error = new Error(base64ErrorMessage(event.error ?? event.message));
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
    });
    this.worker = worker;
    return worker;
  }
}
