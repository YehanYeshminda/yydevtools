import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgIcon } from '@ng-icons/core';
import { PDFDocument } from '@cantoo/pdf-lib';

import { downloadBytes, fileStem } from '../../core/download';
import type { HandoffFile } from '../../core/file-handoff';
import { formatBytes } from '../../core/format';
import { WorkerProxy, workersAvailable } from '../../core/worker-proxy';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { NextStep } from '../../shared/next-step/next-step';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { placeImage, type PagePreset } from '../image-pdf/layout';
import type { DocScannerApi } from './doc-scanner.worker';
import { clampPoint, CORNERS, defaultQuad, type Point, type Quad, type ScanFilter } from './warp';

const MAX_INPUT_BYTES = 40 * 1024 * 1024;
const MAX_PAGES = 50;

interface Scan {
  url: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

interface Page {
  id: string;
  name: string;
  /** Working-size dimensions in the worker; the quad is in these pixels. */
  width: number;
  height: number;
  previewUrl: string;
  quad: Quad;
  result: Scan | null;
  /** Bumped on every change that invalidates the result, so a slow scan cannot overwrite a newer one. */
  version: number;
  busy: boolean;
}

/**
 * Document Scanner: photos of pages in, a straight, clean PDF out.
 *
 * Each photo is one page. The person drags four corners onto the page edges;
 * the worker pulls that quad straight and applies the chosen look. Pages go
 * into the PDF in the order they were added.
 */
@Component({
  selector: 'app-doc-scanner',
  imports: [ToolPage, ToolContent, Dropzone, NextStep, Spinner, MatButtonModule, NgIcon],
  templateUrl: './doc-scanner.html',
  styleUrls: ['../tool-shell.css', './doc-scanner.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocScannerTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly worker = new WorkerProxy<DocScannerApi>(
    () => {
      if (!workersAvailable()) {
        throw new Error('This browser cannot scan on this page.');
      }
      return new Worker(new URL('./doc-scanner.worker', import.meta.url), { type: 'module' });
    },
    () => 'The scanner stopped unexpectedly.',
  );
  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');

  protected readonly corners = CORNERS;
  protected readonly filters: { value: ScanFilter; label: string }[] = [
    { value: 'bw', label: 'Black & white' },
    { value: 'grey', label: 'Greyscale' },
    { value: 'colour', label: 'Colour' },
  ];
  protected readonly formatBytes = formatBytes;

  protected readonly pages = signal<Page[]>([]);
  protected readonly selectedId = signal('');
  protected readonly current = computed(
    () => this.pages().find((page) => page.id === this.selectedId()) ?? null,
  );
  protected readonly filter = signal<ScanFilter>('bw');
  protected readonly pagePreset = signal<PagePreset>('a4');
  protected readonly opening = signal(false);
  protected readonly building = signal(false);
  protected readonly result = signal<HandoffFile | null>(null);
  protected readonly scannedCount = computed(
    () => this.pages().filter((page) => page.result && !page.busy).length,
  );
  protected readonly canDownload = computed(
    () =>
      this.pages().length > 0 && this.scannedCount() === this.pages().length && !this.building(),
  );

  private nextId = 0;
  private drag: { pointerId: number; pageId: string; corner: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    for (const page of this.pages()) {
      this.release(page);
    }
    this.worker.terminate();
  }

  // --- Pages ----------------------------------------------------------------
  protected acceptFiles(files: File[]): void {
    void this.addAll(files);
  }

  private async addAll(files: File[]): Promise<void> {
    const room = MAX_PAGES - this.pages().length;
    if (files.length > room) {
      this.showError(`Up to ${MAX_PAGES} pages at a time; the extra photos were not added.`);
    }
    this.opening.set(true);
    try {
      for (const file of files.slice(0, Math.max(0, room))) {
        await this.add(file);
      }
    } finally {
      this.opening.set(false);
    }
  }

  private async add(file: File): Promise<void> {
    if (
      !file.type.startsWith('image/') &&
      !/\.(hei[cf]|jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name)
    ) {
      this.showError(`"${file.name}" is not an image.`);
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
      return;
    }
    const id = `page-${++this.nextId}`;
    try {
      const opened = await this.worker.call((api) => api.open(id, file));
      const page: Page = {
        id,
        name: file.name,
        width: opened.width,
        height: opened.height,
        previewUrl: URL.createObjectURL(new Blob([opened.preview], { type: 'image/jpeg' })),
        quad: defaultQuad(opened.width, opened.height),
        result: null,
        version: 0,
        busy: false,
      };
      this.pages.update((pages) => [...pages, page]);
      if (!this.selectedId()) {
        this.selectedId.set(id);
      }
      this.result.set(null);
      void this.scan(id);
    } catch {
      this.showError(`"${file.name}" could not be read. It may be corrupt or unsupported.`);
    }
  }

  protected select(id: string): void {
    this.selectedId.set(id);
  }

  protected removePage(id: string): void {
    const page = this.pages().find((entry) => entry.id === id);
    if (!page) {
      return;
    }
    this.release(page);
    void this.worker.call((api) => api.close(id));
    this.pages.update((pages) => pages.filter((entry) => entry.id !== id));
    if (this.selectedId() === id) {
      this.selectedId.set(this.pages()[0]?.id ?? '');
    }
    this.result.set(null);
  }

  protected clear(): void {
    for (const page of this.pages()) {
      this.release(page);
    }
    this.pages.set([]);
    this.selectedId.set('');
    this.result.set(null);
    void this.worker.call((api) => api.closeAll());
  }

  private release(page: Page): void {
    URL.revokeObjectURL(page.previewUrl);
    if (page.result) {
      URL.revokeObjectURL(page.result.url);
    }
  }

  private patch(id: string, change: (page: Page) => Partial<Page>): void {
    this.pages.update((pages) =>
      pages.map((page) => (page.id === id ? { ...page, ...change(page) } : page)),
    );
  }

  // --- Look and page size ---------------------------------------------------
  protected setFilter(filter: ScanFilter): void {
    if (filter === this.filter()) {
      return;
    }
    this.filter.set(filter);
    for (const page of this.pages()) {
      this.invalidate(page.id);
    }
    this.schedule();
  }

  protected setPagePreset(preset: PagePreset): void {
    this.pagePreset.set(preset);
    this.result.set(null);
  }

  // --- Corners --------------------------------------------------------------
  protected pointsOf(quad: Quad): string {
    return quad.map((point) => `${point.x},${point.y}`).join(' ');
  }

  protected resetCorners(): void {
    const page = this.current();
    if (page) {
      this.setQuad(page.id, defaultQuad(page.width, page.height));
      this.schedule();
    }
  }

  protected handleDown(event: PointerEvent, corner: number): void {
    const page = this.current();
    if (!page) {
      return;
    }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.drag = { pointerId: event.pointerId, pageId: page.id, corner };
    event.preventDefault();
  }

  protected pointerMove(event: PointerEvent): void {
    const drag = this.drag;
    const page = this.current();
    const point = this.imagePoint(event);
    if (!drag || drag.pointerId !== event.pointerId || !page || page.id !== drag.pageId || !point) {
      return;
    }
    this.moveCorner(page, drag.corner, point);
  }

  protected pointerUp(event: PointerEvent): void {
    if (this.drag?.pointerId === event.pointerId) {
      this.drag = null;
      this.schedule();
    }
  }

  /** Arrow keys nudge a corner by 1% of the page, 5% with Shift. */
  protected handleKey(event: KeyboardEvent, corner: number): void {
    const page = this.current();
    const step = event.shiftKey ? 0.05 : 0.01;
    const delta: Record<string, Point> = {
      ArrowLeft: { x: -step * page!.width, y: 0 },
      ArrowRight: { x: step * page!.width, y: 0 },
      ArrowUp: { x: 0, y: -step * page!.height },
      ArrowDown: { x: 0, y: step * page!.height },
    };
    const move = page && delta[event.key];
    if (!move) {
      return;
    }
    event.preventDefault();
    const from = page.quad[corner];
    this.moveCorner(page, corner, { x: from.x + move.x, y: from.y + move.y });
    this.schedule();
  }

  private moveCorner(page: Page, corner: number, point: Point): void {
    const quad = [...page.quad] as Quad;
    quad[corner] = clampPoint(point, page.width, page.height);
    this.setQuad(page.id, quad);
  }

  private setQuad(id: string, quad: Quad): void {
    this.patch(id, () => ({ quad }));
    this.invalidate(id);
  }

  private imagePoint(event: PointerEvent): Point | null {
    const image = this.frame()?.nativeElement.querySelector('img');
    const page = this.current();
    if (!image || !page) {
      return null;
    }
    const rect = image.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * page.width,
      y: ((event.clientY - rect.top) / rect.height) * page.height,
    };
  }

  // --- Scanning -------------------------------------------------------------
  private invalidate(id: string): void {
    this.patch(id, (page) => ({ version: page.version + 1, busy: true }));
    this.result.set(null);
  }

  /** Re-scan every page whose result is stale, after a short pause. */
  private schedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      for (const page of this.pages()) {
        if (page.busy) {
          void this.scan(page.id);
        }
      }
    }, 200);
  }

  private async scan(id: string): Promise<void> {
    const page = this.pages().find((entry) => entry.id === id);
    if (!page) {
      return;
    }
    const version = page.version;
    this.patch(id, () => ({ busy: true }));
    try {
      const scanned = await this.worker.call((api) => api.scan(id, page.quad, this.filter()));
      const latest = this.pages().find((entry) => entry.id === id);
      if (!latest || latest.version !== version) {
        return; // Moved on since; a newer scan is coming.
      }
      const bytes = new Uint8Array(scanned.buffer);
      if (latest.result) {
        URL.revokeObjectURL(latest.result.url);
      }
      this.patch(id, () => ({
        busy: false,
        result: {
          bytes,
          width: scanned.width,
          height: scanned.height,
          url: URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })),
        },
      }));
    } catch {
      this.patch(id, () => ({ busy: false }));
      this.showError(`"${page.name}" could not be scanned.`);
    }
  }

  // --- Output ---------------------------------------------------------------
  protected async downloadPdf(): Promise<void> {
    if (!this.canDownload()) {
      return;
    }
    this.building.set(true);
    try {
      const doc = await PDFDocument.create();
      for (const page of this.pages()) {
        const scan = page.result;
        if (!scan) {
          continue;
        }
        const image = await doc.embedJpg(scan.bytes);
        const layout = placeImage(scan, this.pagePreset(), 'auto', 0);
        const pdfPage = doc.addPage([layout.page.width, layout.page.height]);
        pdfPage.drawImage(image, layout);
      }
      const bytes = await doc.save();
      const name = `${fileStem(this.pages()[0]?.name ?? '', 'scan')}-scanned.pdf`;
      downloadBytes(bytes, name, 'application/pdf');
      this.result.set({ bytes, name });
    } catch {
      this.showError('The PDF could not be built.');
    } finally {
      this.building.set(false);
    }
  }

  protected downloadPage(): void {
    const page = this.current();
    if (page?.result && !page.busy) {
      downloadBytes(page.result.bytes, `${fileStem(page.name)}-scanned.jpg`, 'image/jpeg');
    }
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  }
}
