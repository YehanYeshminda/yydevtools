import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

/**
 * A thin lazy wrapper around ffmpeg.wasm.
 *
 * Nothing here is touched until someone actually picks a file, because the
 * core is a 30.7 MB download and every page on this site is prerendered — a
 * module that reached for it at import time would drag it into the build and
 * then into the first paint of a page nobody asked to transcode anything on.
 *
 * The library runs ffmpeg in a Worker of its own, so the heavy work is already
 * off the main thread and this class stays on it. It talks to three files:
 * the wrapper's worker and the core's loader are ordinary static assets, while
 * the core's .wasm comes from R2 through our own Worker, because it is over
 * the 25 MiB ceiling Cloudflare puts on a single static asset.
 */
const BASE = '/ffmpeg';

/** Reports the one-off download of the core, 0 to 1. */
export type LoadProgress = (fraction: number) => void;

/** Reports the progress of a single command, 0 to 1. */
export type RunProgress = (fraction: number) => void;

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export class FfmpegClient {
  private instance: FFmpeg | null = null;
  private starting: Promise<FFmpeg> | null = null;

  /** Set for the duration of one run, so progress lands on the right caller. */
  private running: RunProgress | null = null;

  /** The tail of ffmpeg's own log, kept only to explain a failure. */
  private log: string[] = [];

  /**
   * Downloads and starts the core, once.
   *
   * Concurrent callers share a single download rather than racing two 30 MB
   * fetches: the promise is cached, not the result.
   */
  load(onProgress?: LoadProgress): Promise<FFmpeg> {
    this.starting ??= this.start(onProgress).catch((cause: unknown) => {
      // Forget the failure rather than cache it: a download that died on a
      // flaky connection should be retryable by pressing the button again,
      // not something that breaks the tool for the rest of the visit.
      this.starting = null;
      throw new Error(
        'The video engine could not be loaded. Check your connection and try again.',
        { cause },
      );
    });
    return this.starting;
  }

  private async start(onProgress?: LoadProgress): Promise<FFmpeg> {
    const ffmpeg = new FFmpeg();
    ffmpeg.on('progress', ({ progress }) => this.running?.(clamp(progress)));
    ffmpeg.on('log', ({ message }) => {
      this.log.push(message);
      // Only the end is ever useful, and a long transcode logs thousands.
      if (this.log.length > 40) {
        this.log.shift();
      }
    });

    // Fetched by hand rather than left to ffmpeg.load, so the .wasm download
    // can be reported. Without it the tool looks hung for the whole minute it
    // takes on a slow connection, which is the first thing anyone would see.
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${BASE}/ffmpeg-core.js`, 'text/javascript'),
      toBlobURL(`${BASE}/ffmpeg-core.wasm`, 'application/wasm', true, ({ received, total }) =>
        onProgress?.(total > 0 ? clamp(received / total) : 0),
      ),
    ]);

    await ffmpeg.load({
      coreURL,
      wasmURL,
      // Passed explicitly because the library otherwise resolves its worker
      // with `new URL('./worker.js', import.meta.url)`, which bundlers rewrite
      // inconsistently. A root-relative path resolves against our own origin.
      classWorkerURL: `${BASE}/worker.js`,
    });

    this.instance = ffmpeg;
    return ffmpeg;
  }

  /**
   * Runs one command over one input file and returns the output.
   *
   * The virtual filesystem is emptied afterwards whatever happens: it lives in
   * wasm memory, and a 200 MB video left behind would still be there for the
   * next run.
   */
  async run(
    input: File,
    args: (inputName: string, outputName: string) => string[],
    outputName: string,
    onProgress?: RunProgress,
  ): Promise<Blob> {
    const ffmpeg = await this.load();
    // Keep the extension: ffmpeg picks its demuxer off the name.
    const inputName = `input${extensionOf(input.name)}`;

    this.running = onProgress ?? null;
    this.log = [];
    try {
      await ffmpeg.writeFile(inputName, await fetchFile(input));
      const code = await ffmpeg.exec(args(inputName, outputName));
      if (code !== 0) {
        throw new Error(this.explain());
      }
      const data = await ffmpeg.readFile(outputName);
      if (typeof data === 'string') {
        throw new Error('ffmpeg returned text where a file was expected.');
      }
      // Copy out of wasm memory before the delete below frees it.
      return new Blob([data.slice()], { type: mimeFor(outputName) });
    } finally {
      this.running = null;
      await Promise.all([
        ffmpeg.deleteFile(inputName).catch(() => undefined),
        ffmpeg.deleteFile(outputName).catch(() => undefined),
      ]);
    }
  }

  /**
   * Turns a non-zero exit into something worth reading.
   *
   * ffmpeg says why it failed in its log and then just exits 1, so the log is
   * the only place the reason exists. The last line that looks like a
   * diagnosis beats "ffmpeg exited with 1" for anyone trying to work out
   * whether the file or the tool is at fault.
   */
  private explain(): string {
    const reason = [...this.log]
      .reverse()
      .find((line) => /error|invalid|unsupported|no such|does not contain/i.test(line));
    return reason?.trim() || 'ffmpeg could not process this file.';
  }

  /** Frees the Worker and the wasm memory with it. */
  terminate(): void {
    this.instance?.terminate();
    this.instance = null;
    this.starting = null;
  }
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '.mp4';
}

function mimeFor(name: string): string {
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.m4a')) return 'audio/mp4';
  if (name.endsWith('.wav')) return 'audio/wav';
  return 'video/mp4';
}
