import type { Codec, CodecFormat, WorkerRequest, WorkerResponse } from './image-codec.worker';

export interface OpenedImage {
  width: number;
  height: number;
}

export interface EncodedImage {
  blob: Blob;
  width: number;
  height: number;
  /** 'canvas' when the WebAssembly encoders were unavailable. */
  codec: Codec;
}

type Success = Extract<WorkerResponse, { ok: true }>;

interface Pending {
  resolve: (value: Success) => void;
  reject: (reason: Error) => void;
}

/**
 * Promise wrapper around `image-codec.worker.ts`.
 *
 * The worker is created lazily on first use — this page is prerendered, and the
 * server has no `Worker`. There is no inline fallback: without a worker there is
 * no encoder either, so the caller is told plainly instead.
 */
export class ImageCodecClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  /** Decodes an image and keeps it in the worker for subsequent encodes. */
  async open(file: File): Promise<OpenedImage> {
    const response = await this.send((id) => ({ id, kind: 'open', file }));
    if (response.kind !== 'opened') {
      throw new Error('Unexpected worker response.');
    }
    return { width: response.width, height: response.height };
  }

  /** Re-encodes the open image. Quality is 1–100. */
  async encode(format: CodecFormat, quality: number, maxDimension: number): Promise<EncodedImage> {
    const response = await this.send((id) => ({
      id,
      kind: 'encode',
      format,
      quality,
      maxDimension,
    }));
    if (response.kind !== 'encoded') {
      throw new Error('Unexpected worker response.');
    }
    return {
      blob: new Blob([response.buffer], { type: format }),
      width: response.width,
      height: response.height,
      codec: response.codec,
    };
  }

  /** Releases the open image without tearing down the worker. */
  async close(): Promise<void> {
    if (this.worker) {
      await this.send((id) => ({ id, kind: 'close' }));
    }
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) {
      pending.reject(new Error('Cancelled.'));
    }
    this.pending.clear();
  }

  private send(make: (id: number) => WorkerRequest): Promise<Success> {
    const worker = this.ensure();
    const id = this.nextId++;
    return new Promise<Success>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage(make(id));
    });
  }

  private ensure(): Worker {
    if (this.worker) {
      return this.worker;
    }
    if (typeof Worker === 'undefined') {
      throw new Error('This browser cannot process images on this page.');
    }
    const worker = new Worker(new URL('./image-codec.worker', import.meta.url), { type: 'module' });
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
    worker.addEventListener('error', () => {
      const error = new Error('The image encoder stopped unexpectedly.');
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
    });
    this.worker = worker;
    return worker;
  }
}
