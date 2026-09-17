/**
 * Comlink proxy over `segment.worker.ts`.
 *
 * Started lazily like every other worker here: the page is prerendered, and the
 * prerender has no `Worker`. There is no fallback — without a worker there is no
 * model either, so the caller is told plainly.
 */
import { WorkerProxy, workersAvailable } from '../../core/worker-proxy';
import type { SegmentApi } from './segment.worker';

export class SegmentClient {
  private readonly proxy = new WorkerProxy<SegmentApi>(
    () => {
      if (!workersAvailable()) {
        throw new Error('This browser cannot remove backgrounds on this page.');
      }
      return new Worker(new URL('./segment.worker', import.meta.url), { type: 'module' });
    },
    () => 'The background remover stopped unexpectedly.',
  );

  /** Downloads the runtime and the weights, so the wait can be explained. */
  load(): Promise<void> {
    return this.proxy.call((api) => api.load());
  }

  /** The 320x320 salient-object mask for one image. */
  segment(file: File | Blob): Promise<Float32Array> {
    return this.proxy.call((api) => api.segment(file));
  }

  terminate(): void {
    this.proxy.terminate();
  }
}
