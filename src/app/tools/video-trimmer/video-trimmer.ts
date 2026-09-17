import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgIcon } from '@ng-icons/core';

import { downloadBlob, fileStem } from '../../core/download';
import { formatBytes } from '../../core/format';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { FfmpegClient } from './ffmpeg.client';
import {
  FPS_CHOICES,
  GIF_WIDTHS,
  MAX_GIF_FRAMES,
  OPERATIONS,
  argsFor,
  clampClip,
  formatTime,
  gifFrames,
  outputFor,
  outputName,
  type Clip,
  type Operation,
} from './ops';

/**
 * A ceiling on the input.
 *
 * ffmpeg.wasm holds the whole file in wasm memory, and wasm memory is capped
 * well below what a desktop has. Half a gigabyte is already optimistic on a
 * phone; past this the tab does not slow down, it dies, which is a far worse
 * experience than being told no.
 */
const MAX_INPUT_BYTES = 500 * 1024 * 1024;

type Stage = 'empty' | 'ready' | 'starting' | 'working' | 'done';

@Component({
  selector: 'app-video-trimmer',
  imports: [ToolPage, ToolContent, Dropzone, Spinner, MatButtonModule, NgIcon],
  templateUrl: './video-trimmer.html',
  styleUrls: ['../tool-shell.css', './video-trimmer.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoTrimmerTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly ffmpeg = new FfmpegClient();

  protected readonly formatBytes = formatBytes;
  protected readonly formatTime = formatTime;
  protected readonly maxBytes = MAX_INPUT_BYTES;
  protected readonly operations = OPERATIONS;
  protected readonly fpsChoices = FPS_CHOICES;
  protected readonly gifWidths = GIF_WIDTHS;

  // --- Source -----------------------------------------------------------
  private file: File | null = null;
  protected readonly name = signal('');
  protected readonly size = signal(0);
  protected readonly sourceUrl = signal('');
  protected readonly duration = signal(0);

  // --- Selection --------------------------------------------------------
  protected readonly start = signal(0);
  protected readonly end = signal(0);
  protected readonly operation = signal<Operation>('trim');
  protected readonly fps = signal(12);
  protected readonly width = signal(480);

  // --- Progress and result ---------------------------------------------
  protected readonly stage = signal<Stage>('empty');
  protected readonly downloaded = signal(0);
  protected readonly worked = signal(0);
  protected readonly resultUrl = signal('');
  protected readonly resultSize = signal(0);
  protected readonly error = signal<string | null>(null);

  protected readonly clip = computed<Clip>(() => ({
    start: this.start(),
    end: this.end(),
    fps: this.fps(),
    width: this.width(),
  }));

  protected readonly length = computed(() => Math.max(0, this.end() - this.start()));
  protected readonly busy = computed(
    () => this.stage() === 'starting' || this.stage() === 'working',
  );
  protected readonly isGif = computed(() => this.operation() === 'gif');
  protected readonly frames = computed(() => gifFrames(this.clip()));
  protected readonly tooManyFrames = computed(() => this.isGif() && this.frames() > MAX_GIF_FRAMES);
  protected readonly maxFrames = MAX_GIF_FRAMES;

  protected readonly hint = computed(
    () => OPERATIONS.find((o) => o.value === this.operation())?.hint ?? '',
  );

  protected readonly canRun = computed(
    () => this.file !== null && this.length() > 0 && !this.busy() && !this.tooManyFrames(),
  );

  /** The result is a video for two operations, audio for one, an image for one. */
  protected readonly resultKind = computed<'video' | 'audio' | 'image'>(() => {
    const op = this.operation();
    if (op === 'gif') return 'image';
    return op === 'audio' ? 'audio' : 'video';
  });

  // --- Input ------------------------------------------------------------
  protected onFiles(files: readonly File[]): void {
    const file = files[0];
    if (!file) {
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.snackBar.open(
        `That video is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_INPUT_BYTES)}.`,
        'Dismiss',
        { duration: 6000 },
      );
      return;
    }

    this.reset();
    this.file = file;
    this.name.set(file.name);
    this.size.set(file.size);
    this.sourceUrl.set(URL.createObjectURL(file));
    this.stage.set('ready');
  }

  /**
   * Picks up the duration once the browser has read the header.
   *
   * The whole range is selected to begin with: someone who wants the whole
   * video re-encoded should not have to drag anything, and someone who wants a
   * piece of it is going to move both handles regardless.
   */
  protected onMetadata(event: Event): void {
    const video = event.target as HTMLVideoElement;
    if (video.duration === Infinity) {
      // Anything MediaRecorder wrote — a screen capture, a webcam clip — is a
      // WebM with no duration in its header, because the length was not known
      // when the header went down. The browser reports Infinity until it has
      // seen the end of the file, and seeking past the end is what makes it go
      // and look. The seek back is instant; the file is already local.
      video.addEventListener(
        'timeupdate',
        () => {
          video.currentTime = 0;
          this.useDuration(video.duration);
        },
        { once: true },
      );
      video.currentTime = Number.MAX_SAFE_INTEGER;
      return;
    }
    this.useDuration(video.duration);
  }

  /** Selects the whole video, which is the only sensible starting point. */
  private useDuration(value: number): void {
    const seconds = Number.isFinite(value) && value > 0 ? value : 0;
    this.duration.set(seconds);
    this.start.set(0);
    this.end.set(seconds);
  }

  protected setStart(value: string): void {
    const { start, end } = clampClip(Number(value), this.end(), this.duration());
    this.start.set(start);
    this.end.set(end);
  }

  protected setEnd(value: string): void {
    const { start, end } = clampClip(this.start(), Number(value), this.duration());
    this.start.set(start);
    this.end.set(end);
  }

  /** Both handles can be placed from the preview, which beats dragging blind. */
  protected markStart(video: HTMLVideoElement): void {
    this.setStart(String(video.currentTime));
  }

  protected markEnd(video: HTMLVideoElement): void {
    this.setEnd(String(video.currentTime));
  }

  protected setOperation(value: Operation): void {
    this.operation.set(value);
    this.clearResult();
  }

  protected setFps(value: number): void {
    this.fps.set(value);
    this.clearResult();
  }

  protected setWidth(value: number): void {
    this.width.set(value);
    this.clearResult();
  }

  // --- Running ----------------------------------------------------------
  protected async run(): Promise<void> {
    const file = this.file;
    if (!file || !this.canRun()) {
      return;
    }
    this.clearResult();
    this.error.set(null);
    this.downloaded.set(0);
    this.worked.set(0);

    const op = this.operation();
    try {
      // First run only: the core has to come down before anything can happen.
      this.stage.set('starting');
      await this.ffmpeg.load((fraction) => this.downloaded.set(fraction));

      this.stage.set('working');
      const blob = await this.ffmpeg.run(
        file,
        (input, output) => argsFor(op, this.clip(), input, output),
        outputFor(op),
        (fraction) => this.worked.set(fraction),
      );

      this.resultUrl.set(URL.createObjectURL(blob));
      this.resultSize.set(blob.size);
      this.stage.set('done');
    } catch (error) {
      this.error.set(describeError(error));
      this.stage.set('ready');
    }
  }

  protected save(): void {
    const url = this.resultUrl();
    if (!url) {
      return;
    }
    void fetch(url)
      .then((response) => response.blob())
      .then((blob) =>
        downloadBlob(blob, outputName(this.operation(), fileStem(this.name(), 'video'))),
      );
  }

  // --- Housekeeping -----------------------------------------------------
  private clearResult(): void {
    const url = this.resultUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.resultUrl.set('');
    this.resultSize.set(0);
    if (this.stage() === 'done') {
      this.stage.set('ready');
    }
  }

  private reset(): void {
    this.clearResult();
    const source = this.sourceUrl();
    if (source) {
      URL.revokeObjectURL(source);
    }
    this.sourceUrl.set('');
    this.duration.set(0);
    this.start.set(0);
    this.end.set(0);
    this.error.set(null);
  }

  protected startAgain(): void {
    this.reset();
    this.file = null;
    this.name.set('');
    this.size.set(0);
    this.stage.set('empty');
  }

  ngOnDestroy(): void {
    this.reset();
    // Frees the Worker and, with it, however much wasm memory the last file
    // needed — which for a long video is most of what the tab is holding.
    this.ffmpeg.terminate();
  }
}

/**
 * Turns whatever was thrown into a sentence.
 *
 * ffmpeg.wasm rejects with a bare string in some paths and an Error in others,
 * so the usual `instanceof Error` check on its own would throw away the only
 * useful half of the failures and show a shrug instead.
 */
function describeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return 'That did not work. ffmpeg may not be able to read this file.';
}
