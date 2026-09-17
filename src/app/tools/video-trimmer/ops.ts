/**
 * What the tool can produce, and the ffmpeg command behind each.
 *
 * Kept apart from the component so the argument lists can be tested without a
 * 30 MB wasm download: these strings are the whole behaviour of the tool, and
 * a typo in one is the difference between a clip and an error message.
 */

export type Operation = 'trim' | 'mute' | 'audio' | 'gif';

export interface Clip {
  /** Seconds from the start of the source. */
  start: number;
  /** Seconds from the start of the source; must be greater than `start`. */
  end: number;
  /** Frames per second for the GIF. Ignored by the other operations. */
  fps: number;
  /** Width in pixels for the GIF, height follows the aspect ratio. */
  width: number;
}

export const OPERATIONS: readonly { value: Operation; label: string; hint: string }[] = [
  { value: 'trim', label: 'Trim video', hint: 'The selected range as an MP4, sound included.' },
  { value: 'mute', label: 'Remove sound', hint: 'The selected range as an MP4, with no audio.' },
  { value: 'audio', label: 'Extract audio', hint: 'The sound of the selected range as an MP3.' },
  { value: 'gif', label: 'Make a GIF', hint: 'The selected range as an animated GIF.' },
];

export const FPS_CHOICES = [8, 10, 12, 15, 20, 24] as const;
export const GIF_WIDTHS = [240, 320, 480, 640] as const;

/** A GIF of more than this many frames is a wait and a file nobody wants. */
export const MAX_GIF_FRAMES = 600;

/** Rounds to milliseconds — ffmpeg parses plain seconds happily. */
function seconds(value: number): string {
  return (Math.round(value * 1000) / 1000).toString();
}

/**
 * Builds the command for one operation.
 *
 * Two decisions are worth knowing about.
 *
 * `-ss` goes before `-i`, so ffmpeg seeks rather than decoding and throwing
 * away everything up to the start — on a long source that is the difference
 * between a second and a minute. Duration is then given as `-t`, which is
 * relative to that seek point, rather than `-to`, whose meaning depends on
 * which side of `-i` it lands on.
 *
 * The video is re-encoded rather than copied. Copying is far quicker, but a
 * stream copy can only cut on a keyframe, so the clip would quietly start up
 * to a few seconds away from where it was asked to — which for a tool whose
 * entire job is choosing where to cut is not a trade worth making.
 */
export function argsFor(op: Operation, clip: Clip, input: string, output: string): string[] {
  const start = ['-ss', seconds(clip.start)];
  const duration = ['-t', seconds(Math.max(0, clip.end - clip.start))];

  switch (op) {
    case 'trim':
      return [
        ...start,
        '-i',
        input,
        ...duration,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        // Puts the index at the front, so the result plays while downloading.
        '-movflags',
        '+faststart',
        output,
      ];

    case 'mute':
      return [
        ...start,
        '-i',
        input,
        ...duration,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-an',
        '-movflags',
        '+faststart',
        output,
      ];

    case 'audio':
      return [...start, '-i', input, ...duration, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', output];

    case 'gif':
      return [
        ...start,
        '-i',
        input,
        ...duration,
        // One pass, two uses of the same stream: build a palette from the
        // clip, then map the clip through it. A GIF is 256 colours, and the
        // default web palette turns anything with a gradient into mud.
        '-filter_complex',
        `fps=${clip.fps},scale=${clip.width}:-1:flags=lanczos,split[a][b];` +
          `[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3`,
        '-loop',
        '0',
        output,
      ];
  }
}

/** What the produced file should be called. */
export function outputName(op: Operation, stem: string): string {
  switch (op) {
    case 'trim':
      return `${stem}-clip.mp4`;
    case 'mute':
      return `${stem}-muted.mp4`;
    case 'audio':
      return `${stem}.mp3`;
    case 'gif':
      return `${stem}.gif`;
  }
}

/** The internal name ffmpeg writes to, which only needs the right extension. */
export function outputFor(op: Operation): string {
  return outputName(op, 'output');
}

/**
 * Keeps a selection inside the video and the right way round.
 *
 * Both handles are clamped to the duration, and the range is never allowed to
 * collapse: dragging the start past the end leaves a hair of a clip rather
 * than a negative one that ffmpeg would reject.
 */
export function clampClip(
  start: number,
  end: number,
  duration: number,
): { start: number; end: number } {
  const limit = Math.max(0, duration);
  const lower = Math.min(Math.max(0, start), limit);
  const upper = Math.min(Math.max(0, end), limit);
  if (upper - lower < 0.05) {
    // Keep 50 ms of clip, taking it from whichever side has room.
    return lower + 0.05 <= limit
      ? { start: lower, end: lower + 0.05 }
      : { start: Math.max(0, limit - 0.05), end: limit };
  }
  return { start: lower, end: upper };
}

/** How many frames a GIF of this clip would have. */
export function gifFrames(clip: Clip): number {
  return Math.max(1, Math.round((clip.end - clip.start) * clip.fps));
}

/** `m:ss.s`, which is what a scrubber needs and `1:04.2` reads fine as. */
export function formatTime(value: number): string {
  const safe = Number.isFinite(value) && value > 0 ? value : 0;
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}
