import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { downloadBlob } from '../../core/download';
import { syncToolState } from '../../core/tool-state';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import {
  FORMATS,
  fileStemFor,
  formatById,
  validate,
  withCheckDigit,
  type FormatId,
} from './formats';

/** Bar widths, in pixels per narrow bar. Below 1 a scanner starts to struggle. */
const WIDTHS = [1, 2, 3, 4];
const HEIGHTS = [40, 60, 80, 120];

@Component({
  selector: 'app-barcode-generator',
  imports: [ToolPage, ToolContent, ShareLink, MatButtonModule, NgIcon],
  templateUrl: './barcode-generator.html',
  styleUrls: ['../tool-shell.css', './barcode-generator.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarcodeGeneratorTool {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly formats = FORMATS;
  protected readonly widths = WIDTHS;
  protected readonly heights = HEIGHTS;

  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('svg');

  protected readonly formatId = signal<FormatId>('CODE128');
  protected readonly value = signal(FORMATS[0].sample);
  protected readonly showText = signal(true);
  protected readonly barWidth = signal(2);
  protected readonly height = signal(80);

  /** Set when the library refuses something the local rules let through. */
  protected readonly renderError = signal<string | null>(null);
  protected readonly drawn = signal(false);

  protected readonly shared = syncToolState({
    key: 'barcode-generator',
    snapshot: () => ({
      format: this.formatId(),
      value: this.value(),
      showText: this.showText(),
      barWidth: this.barWidth(),
      height: this.height(),
    }),
    restore: (state) => {
      if (typeof state.format === 'string' && formatById(state.format)) {
        this.formatId.set(state.format as FormatId);
      }
      if (typeof state.value === 'string') {
        this.value.set(state.value);
      }
      if (typeof state.showText === 'boolean') {
        this.showText.set(state.showText);
      }
      if (typeof state.barWidth === 'number' && WIDTHS.includes(state.barWidth)) {
        this.barWidth.set(state.barWidth);
      }
      if (typeof state.height === 'number' && HEIGHTS.includes(state.height)) {
        this.height.set(state.height);
      }
    },
  });

  protected readonly format = computed(() => formatById(this.formatId()) ?? FORMATS[0]);
  protected readonly check = computed(() => validate(this.formatId(), this.value().trim()));
  protected readonly problem = computed(() => {
    const check = this.check();
    return check.ok ? null : check.message;
  });
  /** What actually gets encoded: the value, completed if it is one short. */
  protected readonly encoded = computed(() => withCheckDigit(this.formatId(), this.value().trim()));

  /** True when the check digit was added rather than typed. */
  protected readonly completed = computed(() => this.encoded() !== this.value().trim());

  /** The bars are the whole content, so the accessible name has to carry them. */
  protected readonly label = computed(() => `${this.format().label} barcode: ${this.encoded()}`);

  constructor() {
    // The library needs a real SVG element to draw into, so this only runs in
    // the browser. Fetched on demand rather than imported at the top: it is the
    // heaviest thing on the page and no other route wants it.
    let requestId = 0;
    effect(() => {
      const value = this.encoded();
      const options = {
        format: this.format().encoder,
        displayValue: this.showText(),
        width: this.barWidth(),
        height: this.height(),
        margin: 10,
        background: '#ffffff',
        lineColor: '#000000',
        font: 'monospace',
        fontSize: 16,
      };
      const element = this.svg()?.nativeElement;
      // Bumped before the guard as well as the draw, so an import still in
      // flight for a value that has since become invalid does not land after
      // the clear below.
      const current = ++requestId;

      if (!this.isBrowser || !element) {
        this.drawn.set(false);
        return;
      }

      if (!this.check().ok) {
        // Clear it: a barcode left on screen under an error message is one
        // somebody will screenshot. Browser-only, because the server-side DOM
        // has no replaceChildren.
        element.replaceChildren();
        this.drawn.set(false);
        return;
      }

      void import('jsbarcode').then(({ default: JsBarcode }) => {
        if (current !== requestId) {
          return;
        }
        try {
          JsBarcode(element, value, options);
          this.renderError.set(null);
          this.drawn.set(true);
        } catch (error) {
          // The local rules exist to give a better message than a blank box,
          // not to be exhaustive. This is the backstop for anything they miss.
          this.renderError.set(
            error instanceof Error ? error.message : 'That value could not be encoded.',
          );
          this.drawn.set(false);
        }
      });
    });
  }

  protected setFormat(id: FormatId): void {
    const format = formatById(id);
    if (!format) {
      return;
    }
    // The old value almost never fits the new format's rules, so the sample
    // goes in rather than leaving an error on screen for a change you made.
    this.formatId.set(id);
    this.value.set(format.sample);
  }

  protected setValue(value: string): void {
    this.value.set(value);
  }

  protected setWidth(width: number): void {
    this.barWidth.set(width);
  }

  protected setHeight(height: number): void {
    this.height.set(height);
  }

  protected toggleText(): void {
    this.showText.update((on) => !on);
  }

  protected downloadSvg(): void {
    const element = this.svg()?.nativeElement;
    if (!element || !this.drawn()) {
      return;
    }
    const markup = new XMLSerializer().serializeToString(element);
    downloadBlob(
      new Blob([markup], { type: 'image/svg+xml' }),
      `${fileStemFor(this.formatId(), this.encoded())}.svg`,
    );
  }

  /**
   * PNG at three times the on-screen size.
   *
   * A barcode printed at screen resolution is on the edge of what a scanner
   * can read, and the usual next step after downloading one is to put it in a
   * document, so the extra pixels are worth more than the file size.
   */
  protected async downloadPng(): Promise<void> {
    const element = this.svg()?.nativeElement;
    if (!element || !this.drawn()) {
      return;
    }
    const scale = 3;
    const markup = new XMLSerializer().serializeToString(element);
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('The barcode could not be rasterised.'));
        image.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }
      // The SVG has its own white background, but a PNG canvas starts
      // transparent and a barcode on transparency scans as black on black
      // wherever it is pasted.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        downloadBlob(blob, `${fileStemFor(this.formatId(), this.encoded())}.png`);
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
