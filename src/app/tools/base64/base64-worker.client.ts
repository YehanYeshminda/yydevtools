/**
 * Comlink proxy over `base64.worker.ts`.
 *
 * The worker is started lazily on first use — these tool pages are prerendered,
 * and the prerender has no `Worker`. Where one is genuinely missing (prerender,
 * or a browser without module workers) the same `base64Api` runs inline
 * instead, so the tool degrades in speed rather than breaking.
 */
import type { Remote } from 'comlink';
import { WorkerProxy, workersAvailable } from '../../core/worker-proxy';
import { base64Api, type Base64Api, type DecodedBytes } from './base64-codec';

export type { DecodedBytes };

/** The codec as the caller sees it, whichever thread ends up running it. */
type Codec = Remote<Base64Api> | Base64Api;

export class Base64WorkerClient {
  private readonly proxy = new WorkerProxy<Base64Api>(
    () => new Worker(new URL('./base64.worker', import.meta.url), { type: 'module' }),
    () => 'The Base64 converter stopped unexpectedly.',
  );

  encodeFile(file: File): Promise<string> {
    return this.run((api) => api.encodeFile(file));
  }

  encodeText(text: string): Promise<string> {
    return this.run((api) => api.encodeText(text));
  }

  decodeText(text: string): Promise<string> {
    return this.run((api) => api.decodeText(text));
  }

  decodeBytes(text: string): Promise<DecodedBytes> {
    return this.run((api) => api.decodeBytes(text));
  }

  terminate(): void {
    this.proxy.terminate();
  }

  /**
   * Off the main thread where that is possible, on it where it is not.
   *
   * Both branches call the same methods on the same object; the only difference
   * is which thread runs them, which is why the fallback cannot rot.
   */
  private run<R>(use: (codec: Codec) => Promise<R>): Promise<R> {
    if (!workersAvailable()) {
      return use(base64Api);
    }
    return this.proxy.call(use);
  }
}
