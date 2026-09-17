import { describe, expect, it } from 'vitest';

import {
  argsFor,
  clampClip,
  formatTime,
  gifFrames,
  outputName,
  type Clip,
  type Operation,
} from './ops';

const clip: Clip = { start: 2, end: 6.5, fps: 12, width: 480 };

/** Reads one flag's value out of a command, so tests do not count positions. */
function valueOf(args: string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

describe('argsFor', () => {
  it('seeks before the input so long sources do not decode from zero', () => {
    const args = argsFor('trim', clip, 'in.mp4', 'out.mp4');
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
  });

  it('gives the duration, not the end time, because -t is seek-relative', () => {
    const args = argsFor('trim', clip, 'in.mp4', 'out.mp4');
    expect(valueOf(args, '-ss')).toBe('2');
    expect(valueOf(args, '-t')).toBe('4.5');
    expect(args).not.toContain('-to');
  });

  it('re-encodes rather than copying, so the cut lands where it was asked to', () => {
    const args = argsFor('trim', clip, 'in.mp4', 'out.mp4');
    expect(valueOf(args, '-c:v')).toBe('libx264');
    expect(args).not.toContain('copy');
  });

  it('drops the audio track for a mute and keeps no encoder for it', () => {
    const args = argsFor('mute', clip, 'in.mp4', 'out.mp4');
    expect(args).toContain('-an');
    expect(args).not.toContain('-c:a');
  });

  it('drops the video track when extracting audio', () => {
    const args = argsFor('audio', clip, 'in.mp4', 'out.mp3');
    expect(args).toContain('-vn');
    expect(valueOf(args, '-c:a')).toBe('libmp3lame');
  });

  it('builds a palette from the clip itself for a GIF', () => {
    const filter = valueOf(argsFor('gif', clip, 'in.mp4', 'out.gif'), '-filter_complex') ?? '';
    expect(filter).toContain('fps=12');
    expect(filter).toContain('scale=480:-1');
    expect(filter).toContain('palettegen');
    expect(filter).toContain('paletteuse');
    // Split first, or the second use of the stream has nothing to read.
    expect(filter.indexOf('split')).toBeLessThan(filter.indexOf('palettegen'));
  });

  it('loops the GIF forever, which is what every GIF is expected to do', () => {
    expect(valueOf(argsFor('gif', clip, 'in.mp4', 'out.gif'), '-loop')).toBe('0');
  });

  it('puts the output last for every operation', () => {
    const ops: Operation[] = ['trim', 'mute', 'audio', 'gif'];
    for (const op of ops) {
      const args = argsFor(op, clip, 'in.mp4', 'out.x');
      expect(args[args.length - 1]).toBe('out.x');
    }
  });

  it('rounds to milliseconds instead of emitting float noise', () => {
    const awkward: Clip = { ...clip, start: 1 / 3, end: 2 / 3 };
    const args = argsFor('trim', awkward, 'in.mp4', 'out.mp4');
    expect(valueOf(args, '-ss')).toBe('0.333');
    expect(valueOf(args, '-t')).toBe('0.333');
  });
});

describe('clampClip', () => {
  it('leaves a sane range alone', () => {
    expect(clampClip(2, 6, 10)).toEqual({ start: 2, end: 6 });
  });

  it('pulls both handles inside the video', () => {
    expect(clampClip(-3, 99, 10)).toEqual({ start: 0, end: 10 });
  });

  it('never returns a backwards range', () => {
    const { start, end } = clampClip(8, 3, 10);
    expect(end).toBeGreaterThan(start);
  });

  it('keeps a sliver of clip when the handles meet at the end', () => {
    const { start, end } = clampClip(10, 10, 10);
    expect(end).toBe(10);
    expect(end - start).toBeCloseTo(0.05);
  });

  it('survives a duration of zero, which is what a broken file reports', () => {
    const { start, end } = clampClip(0, 0, 0);
    expect(start).toBe(0);
    expect(end).toBe(0);
  });
});

describe('gifFrames', () => {
  it('counts frames from the length and the rate', () => {
    expect(gifFrames({ start: 0, end: 5, fps: 12, width: 480 })).toBe(60);
  });

  it('never reports zero, so a very short clip still looks like one frame', () => {
    expect(gifFrames({ start: 0, end: 0.01, fps: 1, width: 480 })).toBe(1);
  });
});

describe('outputName', () => {
  it('names the file after the source and the operation', () => {
    expect(outputName('trim', 'holiday')).toBe('holiday-clip.mp4');
    expect(outputName('mute', 'holiday')).toBe('holiday-muted.mp4');
    expect(outputName('audio', 'holiday')).toBe('holiday.mp3');
    expect(outputName('gif', 'holiday')).toBe('holiday.gif');
  });
});

describe('formatTime', () => {
  it('reads as a scrubber position', () => {
    expect(formatTime(0)).toBe('0:00.0');
    expect(formatTime(9.5)).toBe('0:09.5');
    // 64.25s is 1:04.25, and the tenth rounds up rather than truncating.
    expect(formatTime(64.25)).toBe('1:04.3');
    expect(formatTime(600)).toBe('10:00.0');
  });

  it('treats nonsense as zero rather than printing NaN at someone', () => {
    expect(formatTime(Number.NaN)).toBe('0:00.0');
    expect(formatTime(-5)).toBe('0:00.0');
  });
});
