import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';

import { downloadBlob } from '../../core/download';
import { PdfDocumentRenderer } from '../../core/pdf-render';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { diffFrames, formatRatio, planPages, statusFor, summarise, type PageStatus } from './diff';

/**
 * Scale for the comparison pass and for the page on screen.
 *
 * The comparison runs over every page of both files, so it is done at natural
 * size: half a million pixels a page is enough to catch a moved comma and
 * small enough that a hundred-page document does not exhaust the tab. The page
 * you are actually looking at is redrawn larger.
 */
const COMPARE_SCALE = 1;
const VIEW_SCALE = 1.6;

/**
 * Where a comparison stops.
 *
 * Two renders per page, and a long document would otherwise hold the tab for
 * minutes with no way to tell whether it had hung. The limit is said out loud
 * rather than applied quietly.
 */
const MAX_PAGES = 200;

interface PageResult {
  index: number;
  status: PageStatus;
  ratio: number;
  ratioText: string;
}

type View = 'diff' | 'a' | 'b';

interface Side {
  name: string;
  bytes: Uint8Array;
}

@Component({
  selector: 'app-pdf-diff',
  imports: [ToolPage, ToolContent, Dropzone, Spinner, MatButtonModule, NgIcon, RouterLink],
  templateUrl: './pdf-diff.html',
  styleUrls: ['../tool-shell.css', './pdf-diff.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfDiffTool {
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly left = signal<Side | null>(null);
  protected readonly right = signal<Side | null>(null);

  protected readonly pages = signal<PageResult[]>([]);
  protected readonly selected = signal(0);
  protected readonly view = signal<View>('diff');

  protected readonly busy = signal(false);
  protected readonly progress = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly truncated = signal(false);

  protected readonly ready = computed(() => this.pages().length > 0);
  protected readonly summary = computed(() => summarise(this.pages().map((page) => page.status)));
  protected readonly current = computed(
    () => this.pages().find((page) => page.index === this.selected()) ?? null,
  );

  constructor() {
    // Redraw whenever the page or the view changes. Re-rendering rather than
    // caching every page's pixels: two documents' worth of full-size canvases
    // is tens of megabytes, and nobody looks at them all.
    let token = 0;
    effect(() => {
      const page = this.selected();
      const view = this.view();
      const left = this.left();
      const right = this.right();
      const canvas = this.canvasRef()?.nativeElement;
      if (!canvas || !left || !right || !this.ready()) {
        return;
      }
      const current = ++token;
      void this.draw(canvas, left, right, page, view, () => current === token);
    });
  }

  protected onLeft(files: File[]): void {
    void this.accept(files[0], 'left');
  }

  protected onRight(files: File[]): void {
    void this.accept(files[0], 'right');
  }

  private async accept(file: File | undefined, side: 'left' | 'right'): Promise<void> {
    if (!file) {
      return;
    }
    const entry = { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
    (side === 'left' ? this.left : this.right).set(entry);
    await this.compare();
  }

  protected reset(): void {
    this.left.set(null);
    this.right.set(null);
    this.pages.set([]);
    this.selected.set(0);
    this.error.set(null);
    this.truncated.set(false);
  }

  protected select(index: number): void {
    this.selected.set(index);
  }

  protected setView(view: View): void {
    this.view.set(view);
  }

  /** Renders every page of both files once, and records how they differ. */
  private async compare(): Promise<void> {
    const left = this.left();
    const right = this.right();
    if (!left || !right) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.pages.set([]);
    this.truncated.set(false);

    let a: PdfDocumentRenderer | null = null;
    let b: PdfDocumentRenderer | null = null;
    try {
      a = await PdfDocumentRenderer.open(left.bytes);
      b = await PdfDocumentRenderer.open(right.bytes);

      const plans = planPages(a.pageCount, b.pageCount);
      const limit = Math.min(plans.length, MAX_PAGES);
      this.truncated.set(plans.length > limit);

      const results: PageResult[] = [];
      for (const plan of plans.slice(0, limit)) {
        this.progress.set(`Page ${plan.index + 1} of ${limit}`);
        const ratio = plan.inA && plan.inB ? await this.ratioFor(a, b, plan.index) : 1;
        const status = statusFor(plan, ratio);
        results.push({ index: plan.index, status, ratio, ratioText: formatRatio(ratio) });
      }

      this.pages.set(results);
      // Open on the first page that actually differs: on a long document the
      // interesting page is rarely the first one.
      this.selected.set(results.find((page) => page.status !== 'same')?.index ?? 0);
    } catch {
      this.error.set('One of those could not be read as a PDF. An encrypted file will not open.');
      this.pages.set([]);
    } finally {
      a?.close();
      b?.close();
      this.progress.set('');
      this.busy.set(false);
    }
  }

  private async ratioFor(
    a: PdfDocumentRenderer,
    b: PdfDocumentRenderer,
    index: number,
  ): Promise<number> {
    const [pageA, pageB] = await Promise.all([
      a.renderPageCanvas(index, COMPARE_SCALE),
      b.renderPageCanvas(index, COMPARE_SCALE),
    ]);
    const result = diffFrames(frameOf(pageA.canvas), frameOf(pageB.canvas));
    release(pageA.canvas);
    release(pageB.canvas);
    return result.ratio;
  }

  private async draw(
    canvas: HTMLCanvasElement,
    left: Side,
    right: Side,
    index: number,
    view: View,
    stillWanted: () => boolean,
  ): Promise<void> {
    let a: PdfDocumentRenderer | null = null;
    let b: PdfDocumentRenderer | null = null;
    try {
      const page = this.pages().find((entry) => entry.index === index);
      if (!page) {
        return;
      }

      const needsA = view !== 'b' && page.status !== 'only-b';
      const needsB = view !== 'a' && page.status !== 'only-a';
      a = needsA ? await PdfDocumentRenderer.open(left.bytes) : null;
      b = needsB ? await PdfDocumentRenderer.open(right.bytes) : null;
      if (!stillWanted()) {
        return;
      }

      const rendered = await Promise.all([
        a ? a.renderPageCanvas(index, VIEW_SCALE) : null,
        b ? b.renderPageCanvas(index, VIEW_SCALE) : null,
      ]);
      if (!stillWanted()) {
        return;
      }

      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      // A page present in only one file has nothing to diff against, so the
      // Difference view falls back to showing whichever side has it.
      const [renderedA, renderedB] = rendered;
      if (view === 'diff' && renderedA && renderedB) {
        const result = diffFrames(frameOf(renderedA.canvas), frameOf(renderedB.canvas));
        canvas.width = result.width;
        canvas.height = result.height;
        context.putImageData(new ImageData(result.overlay, result.width, result.height), 0, 0);
      } else {
        blit(canvas, context, (view === 'b' ? renderedB : (renderedA ?? renderedB))?.canvas);
      }

      for (const entry of rendered) {
        if (entry) {
          release(entry.canvas);
        }
      }
    } catch {
      this.error.set('That page could not be drawn.');
    } finally {
      a?.close();
      b?.close();
    }
  }

  protected downloadPng(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.ready()) {
      return;
    }
    canvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, `pdf-diff-page-${this.selected() + 1}.png`);
      }
    }, 'image/png');
  }
}

function frameOf(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return { width: 0, height: 0, data: new Uint8ClampedArray(0) };
  }
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: image.width, height: image.height, data: image.data };
}

function blit(
  target: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement | undefined,
): void {
  if (!source) {
    return;
  }
  target.width = source.width;
  target.height = source.height;
  context.drawImage(source, 0, 0);
}

/**
 * Lets go of a canvas's backing store.
 *
 * Setting the size to zero is the only way to make a browser release it
 * promptly; dropping the reference leaves tens of megabytes sitting there
 * until the collector decides otherwise, and comparing two long documents
 * makes hundreds of these.
 */
function release(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}
