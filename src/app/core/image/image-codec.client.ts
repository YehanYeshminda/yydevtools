/**
 * Comlink proxy over `image-codec.worker.ts`.
 *
 * The worker is started lazily on first use — this page is prerendered, and the
 * prerender has no `Worker`. There is no fallback: without a worker there is no
 * encoder either, so the caller is told plainly instead.
 */
import { WorkerProxy, workersAvailable } from '../worker-proxy';
import type {
  Codec,
  CodecFormat,
  EncodeOptions,
  ImageCodecApi,
  OpenedImage,
} from './image-codec.worker';

export type { CodecFormat, EncodeOptions, OpenedImage };

export interface CompressedImage {
  blob: Blob;
  bytes: Uint8Array;
  width: number;
  height: number;
  /** 'canvas' when the WebAssembly encoders were unavailable. */
  codec: Codec;
  /** The quality actually used — differs from the request in target-size mode. */
  quality: number;
  targetMissed: boolean;
  keptMetadata: boolean;
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

  /** Decodes an image to read its dimensions, keeping it warm for the encode. */
  open(id: string, file: File): Promise<OpenedImage> {
    return this.proxy.call((api) => api.open(id, file));
  }

  /** A JPEG copy of the source that an `<img>` can render. Used for HEIC. */
  async preview(id: string, file: File): Promise<Blob> {
    const buffer = await this.proxy.call((api) => api.preview(id, file));
    return new Blob([buffer], { type: 'image/jpeg' });
  }

  async encode(id: string, file: File, options: EncodeOptions): Promise<CompressedImage> {
    const result = await this.proxy.call((api) => api.encode(id, file, options));
    const bytes = new Uint8Array(result.buffer);
    return {
      blob: new Blob([bytes], { type: options.format }),
      bytes,
      width: result.width,
      height: result.height,
      codec: result.codec,
      quality: result.quality,
      targetMissed: result.targetMissed,
      keptMetadata: result.keptMetadata,
    };
  }

  /** Whether this browser can encode `format` at all — only AVIF is in doubt. */
  supports(format: CodecFormat): Promise<boolean> {
    return this.proxy.call((api) => api.supports(format));
  }

  /** Releases the cached image without tearing down the worker. */
  async close(): Promise<void> {
    if (this.proxy.started) {
      await this.proxy.call((api) => api.close());
    }
  }

  terminate(): void {
    this.proxy.terminate();
  }
}
