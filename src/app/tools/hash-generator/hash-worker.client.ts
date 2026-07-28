/**
 * Comlink proxy over `hash.worker.ts`.
 *
 * The worker is started lazily on first use — these tool pages are prerendered,
 * and the prerender has no `Worker`. Where one is genuinely missing (prerender,
 * or a browser without module workers) the same `hashApi` runs inline instead,
 * so the tool degrades in speed rather than breaking.
 */
import type { Remote } from 'comlink';
import { WorkerProxy, workersAvailable } from '../../core/worker-proxy';
import { hashApi, type Digest, type HashApi } from './hash-codec';

export type { Digest };

/** The hasher as the caller sees it, whichever thread ends up running it. */
type Hasher = Remote<HashApi> | HashApi;

export class HashWorkerClient {
  private readonly proxy = new WorkerProxy<HashApi>(
    () => new Worker(new URL('./hash.worker', import.meta.url), { type: 'module' }),
    () => 'The hash generator stopped unexpectedly.',
  );

  digest(data: Uint8Array, key: string): Promise<Digest[]> {
    return this.run((api) => api.digest(data, key));
  }

  terminate(): void {
    this.proxy.terminate();
  }

  /**
   * Off the main thread where that is possible, on it where it is not.
   *
   * Both branches call the same method on the same object; the only difference
   * is which thread runs it, which is why the fallback cannot rot.
   */
  private run<R>(use: (hasher: Hasher) => Promise<R>): Promise<R> {
    if (!workersAvailable()) {
      return use(hashApi);
    }
    return this.proxy.call(use);
  }
}
