/**
 * A Comlink proxy over a module worker that is started on first use.
 *
 * Comlink turns the object a worker exposes into a promise-returning proxy, so
 * the plumbing each tool used to carry — correlation ids, a `message` listener,
 * a map of pending promises, a discriminated response union, rethrowing the
 * error on the calling side — is gone. What is left is the part Comlink has no
 * opinion about, and that both tools need identically:
 *
 *  - **Lazy start.** Every tool page is prerendered, and the prerender has no
 *    `Worker`. Constructing one in a field initialiser would break the render
 *    rather than the tool.
 *  - **Settling in-flight calls.** Comlink's promise for a call to a worker
 *    that has been terminated, or that failed to load, never settles. Both are
 *    turned into a rejection here so a caller cannot hang on them.
 */
import * as Comlink from 'comlink';

/** True where a worker can actually be started — false during prerender. */
export function workersAvailable(): boolean {
  return typeof Worker !== 'undefined';
}

export class WorkerProxy<T extends object> {
  private worker: Worker | null = null;
  private remote: Comlink.Remote<T> | null = null;
  private aborted = abortable();

  /**
   * @param spawn Builds the worker. Called at most once per live proxy, and
   *   from the caller's module so `import.meta.url` resolves there.
   * @param onFailure Message for the case where the worker itself dies — a
   *   module that failed to load, or a crash Comlink never hears about.
   */
  constructor(
    private readonly spawn: () => Worker,
    private readonly onFailure: () => string,
  ) {}

  /** True once a worker has been started, so callers can skip pointless teardown. */
  get started(): boolean {
    return this.worker !== null;
  }

  /**
   * Run one call against the worker, and lose the race if the worker goes away.
   *
   * `async` so that a worker which cannot even be constructed surfaces as a
   * rejection like every other failure, rather than as a synchronous throw.
   */
  async call<R>(use: (api: Comlink.Remote<T>) => Promise<R>): Promise<R> {
    return Promise.race([use(this.ensure()), this.aborted.promise]);
  }

  /** Stop the worker and reject everything still in flight. */
  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.remote = null;
    this.aborted.abort(new Error('Cancelled.'));
    this.aborted = abortable();
  }

  private ensure(): Comlink.Remote<T> {
    if (this.remote) {
      return this.remote;
    }
    const worker = this.spawn();
    // A worker that cannot load its module never answers. Fail every call made
    // against it, including later ones — it will not recover.
    worker.addEventListener('error', () => this.aborted.abort(new Error(this.onFailure())));
    this.worker = worker;
    this.remote = Comlink.wrap<T>(worker);
    return this.remote;
  }
}

/** A promise that only ever rejects, pre-handled so an unused one stays quiet. */
function abortable(): { promise: Promise<never>; abort: (reason: Error) => void } {
  let abort!: (reason: Error) => void;
  const promise = new Promise<never>((_, reject) => {
    abort = reject;
  });
  // Nothing is racing this until a call is in flight, and an abort with none
  // outstanding would otherwise surface as an unhandled rejection.
  promise.catch(() => {});
  return { promise, abort };
}
