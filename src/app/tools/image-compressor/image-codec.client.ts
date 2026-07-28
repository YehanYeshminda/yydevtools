/**
 * Comlink proxy over `image-codec.worker.ts`.
 *
 * The worker is started lazily on first use — this page is prerendered, and the
 * prerender has no `Worker`. There is no fallback: without a worker there is no
 * encoder either, so the caller is told plainly instead.
 */
import { WorkerProxy, workersAvailable } from '../../core/worker-proxy';
import type { Codec, CodecFormat, ImageCodecApi, OpenedImage } from './image-codec.worker';

export type { OpenedImage };

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  /** 'canvas' when the WebAssembly encoders were unavailable. */
  codec: Codec;
}

export class ImageCodecClient {
  private readonly proxy = new WorkerProxy<ImageCodecApi>(
    () => {
      if (!workersAvailable()) {
        throw new Error('This browser cannot process images on this page.');
      }
      return new Worker(new URL('./image-codec.worker', import.meta.url), { type: 'module' });
    },
    () => 'The image encoder stopped unexpectedly.',
  );

  /** Decodes an image and keeps it in the worker for subsequent encodes. */
  open(file: File): Promise<OpenedImage> {
    return this.proxy.call((api) => api.open(file));
  }

  /** Re-encodes the open image. Quality is 1–100. */
  async encode(
    format: CodecFormat,
    quality: number,
    maxDimension: number,
  ): Promise<CompressedImage> {
    const result = await this.proxy.call((api) => api.encode(format, quality, maxDimension));
    return {
      blob: new Blob([result.buffer], { type: format }),
      width: result.width,
      height: result.height,
      codec: result.codec,
    };
  }

  /** Releases the open image without tearing down the worker. */
  async close(): Promise<void> {
    if (this.proxy.started) {
      await this.proxy.call((api) => api.close());
    }
  }

  terminate(): void {
    this.proxy.terminate();
  }
}
