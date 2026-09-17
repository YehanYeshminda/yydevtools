import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { formatOklch, rgbToOklch, toHex, toHsl, type Rgb } from '../color-converter/color';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { extractPalette, readableOn, type PaletteColor } from './palette';

const COUNTS = [4, 6, 8, 12];

/**
 * The image is scaled to this before its pixels are read.
 *
 * A 12-megapixel photo holds no more palette than a thumbnail of it does, and
 * median cut sorts its pixels repeatedly — so the full-size version would cost
 * seconds and several hundred megabytes to reach the same six colours.
 */
const SAMPLE_EDGE = 220;

export interface Swatch extends PaletteColor {
  hex: string;
  rgbText: string;
  hslText: string;
  oklchText: string;
  ink: string;
  percent: string;
}

@Component({
  selector: 'app-palette-extractor',
  imports: [ToolPage, ToolContent, Dropzone, Spinner, MatButtonModule, NgIcon],
  templateUrl: './palette-extractor.html',
  styleUrls: ['../tool-shell.css', './palette-extractor.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaletteExtractorTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly counts = COUNTS;

  protected readonly count = signal(6);
  protected readonly fileName = signal('');
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Raw pixels of the downscaled image, kept so the count can change cheaply. */
  private readonly sample = signal<Uint8ClampedArray | null>(null);

  protected readonly palette = computed<Swatch[]>(() => {
    const data = this.sample();
    if (!data) {
      return [];
    }
    return extractPalette(data, this.count()).map((entry) => describe(entry));
  });

  constructor() {
    // The object URL backing the preview has to be released, and the moment to
    // do it is when a different image replaces it.
    let previous: string | null = null;
    effect(() => {
      const url = this.previewUrl();
      if (previous && previous !== url) {
        URL.revokeObjectURL(previous);
      }
      previous = url;
    });
  }

  protected setCount(count: number): void {
    this.count.set(count);
  }

  protected async onFiles(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      const data = await sampleImage(file);
      this.sample.set(data);
      this.fileName.set(file.name);
      this.previewUrl.set(URL.createObjectURL(file));
    } catch {
      // Anything the browser will not decode: a PDF renamed to .png, a HEIC on
      // a browser without the codec, a file that finished uploading badly.
      this.sample.set(null);
      this.previewUrl.set(null);
      this.error.set('That file could not be read as an image.');
    } finally {
      this.busy.set(false);
    }
  }

  protected reset(): void {
    this.sample.set(null);
    this.previewUrl.set(null);
    this.fileName.set('');
    this.error.set(null);
  }

  protected copy(value: string): void {
    void this.clipboard.copy(value, { label: value });
  }

  /** The palette as CSS custom properties, which is where it usually ends up. */
  protected copyCss(): void {
    const body = this.palette()
      .map((swatch, index) => `  --color-${index + 1}: ${swatch.hex};`)
      .join('\n');
    void this.clipboard.copy(`:root {\n${body}\n}`, { label: 'CSS variables' });
  }

  protected copyJson(): void {
    void this.clipboard.copy(
      JSON.stringify(
        this.palette().map((swatch) => ({
          hex: swatch.hex,
          share: Number(swatch.share.toFixed(4)),
        })),
        null,
        2,
      ),
      { label: 'JSON' },
    );
  }
}

function describe(entry: PaletteColor): Swatch {
  const { rgb } = entry;
  const hsl = toHsl(rgb);
  return {
    ...entry,
    hex: toHex(rgb),
    rgbText: `rgb(${rgb.r} ${rgb.g} ${rgb.b})`,
    hslText: `hsl(${Math.round(hsl.h)} ${Math.round(hsl.s)}% ${Math.round(hsl.l)}%)`,
    oklchText: formatOklch(rgbToOklch(rgb), 1),
    ink: readableOn(rgb),
    percent: `${(entry.share * 100).toFixed(entry.share < 0.01 ? 1 : 0)}%`,
  };
}

/** Decode, scale to at most SAMPLE_EDGE on the long side, and read the pixels. */
async function sampleImage(file: File): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, SAMPLE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('No 2D context');
    }
    context.drawImage(bitmap, 0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
  } finally {
    bitmap.close();
  }
}
