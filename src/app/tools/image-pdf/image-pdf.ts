import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
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
import { RouterLink } from '@angular/router';
import { PDFDocument, type PDFImage } from '@cantoo/pdf-lib';

import { downloadBlob, downloadBytes, fileStem } from '../../core/download';
import { formatBytes } from '../../core/format';
import { looksLikePdf } from '../../core/pdf-probe';
import { PdfDocumentRenderer } from '../../core/pdf-render';
import { downloadZip, type ZipEntry } from '../../core/zip';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import {
  dpiScale,
  MARGINS,
  placeImage,
  type MarginPreset,
  type Orientation,
  type PagePreset,
} from './layout';

type Mode = 'to-pdf' | 'to-images';

/** One image queued for the Images-to-PDF direction. */
interface ImageItem {
  id: string;
  file: File;
  name: string;
  size: number;
  width: number;
  height: number;
  /** Object URL for the preview thumbnail; revoked on removal. */
  url: string;
}

/** One page rendered out of a PDF, in the PDF-to-images direction. */
interface RenderedImage {
  index: number;
  bytes: Uint8Array;
  url: string;
  size: number;
  width: number;
  height: number;
}

interface LoadedPdf {
  name: string;
  renderer: PdfDocumentRenderer;
  pageCount: number;
}

/** Everything is held in memory, so reject anything unreasonable up front. */
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_IMAGES = 50;
const MAX_PDF_BYTES = 100 * 1024 * 1024;

/** Above this, rasterising every page at high DPI risks exhausting memory. */
const MAX_RENDER_PAGES = 200;

/** Longest edge of the small preview thumbnails, in CSS pixels. */
const THUMB_EDGE = 200;

/** The image formats the browser can decode for embedding into a PDF. */
const IMAGE_PATTERN = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;

const DPI_OPTIONS = [
  { value: 96, label: '96 DPI · screen' },
  { value: 150, label: '150 DPI · good' },
  { value: 300, label: '300 DPI · print' },
] as const;

@Component({
  selector: 'app-image-pdf',
  imports: [
    Dropzone,
    ToolContent,
    RouterLink,
    DragDropModule,
    MatButtonModule,
    NgIcon,
    Spinner,
  ],
  templateUrl: './image-pdf.html',
  styleUrls: ['../tool-shell.css', './image-pdf.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImagePdfTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);

  protected readonly maxImages = MAX_IMAGES;
  protected readonly maxRenderPages = MAX_RENDER_PAGES;
  protected readonly dpiOptions = DPI_OPTIONS;

  // --- Mode -------------------------------------------------------------
  protected readonly mode = signal<Mode>('to-pdf');

  // --- Images -> PDF ----------------------------------------------------
  protected readonly images = signal<ImageItem[]>([]);
  protected readonly pagePreset = signal<PagePreset>('fit');
  protected readonly orientation = signal<Orientation>('auto');
  protected readonly margin = signal<MarginPreset>('none');
  protected readonly buildingPdf = signal(false);

  protected readonly hasImages = computed(() => this.images().length > 0);
  protected readonly imageCount = computed(() => this.images().length);
  /** Orientation only bites when a fixed page size is chosen. */
  protected readonly showOrientation = computed(() => this.pagePreset() !== 'fit');

  // --- PDF -> Images ----------------------------------------------------
  protected readonly pdf = signal<LoadedPdf | null>(null);
  protected readonly thumbs = signal<ReadonlyMap<number, string>>(new Map());
  protected readonly pendingThumbs = signal(0);
  protected readonly imageFormat = signal<'image/png' | 'image/jpeg'>('image/png');
  protected readonly dpi = signal<number>(150);
  protected readonly rendering = signal(false);
  protected readonly renderProgress = signal(0);
  protected readonly rendered = signal<RenderedImage[]>([]);

  protected readonly hasPdf = computed(() => this.pdf() !== null);
  protected readonly pageCount = computed(() => this.pdf()?.pageCount ?? 0);
  protected readonly hasRendered = computed(() => this.rendered().length > 0);
  /** Page indices to preview, capped at the render limit for very long files. */
  protected readonly pageIndices = computed(() =>
    Array.from({ length: Math.min(this.pageCount(), MAX_RENDER_PAGES) }, (_, index) => index),
  );

  /** Guards a thumbnail run against a reset that lands while it is going. */
  private thumbToken = 0;
  private nextId = 0;

  ngOnDestroy(): void {
    this.releaseImages();
    this.releaseRendered();
    this.pdf()?.renderer.close();
  }

  // --- Mode switching ---------------------------------------------------
  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  // --- Images -> PDF: intake -------------------------------------------
  protected onImagesPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (files.length) {
      void this.addImages(files);
    }
  }

  protected async addImages(files: File[]): Promise<void> {
    const room = MAX_IMAGES - this.images().length;
    if (room <= 0) {
      this.showError(`You can add up to ${MAX_IMAGES} images at once.`);
      return;
    }
    if (files.length > room) {
      this.showError(`Only the first ${room} of those files were added (limit ${MAX_IMAGES}).`);
    }

    for (const file of files.slice(0, room)) {
      // A HEIC-style empty MIME type still resolves through the name pattern.
      if (!file.type.startsWith('image/') && !IMAGE_PATTERN.test(file.name)) {
        this.showError(`"${file.name}" is not an image and was skipped.`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_IMAGE_BYTES)}).`);
        continue;
      }

      let size: { width: number; height: number };
      try {
        size = await this.imageSize(file);
      } catch {
        this.showError(`"${file.name}" could not be read as an image and was skipped.`);
        continue;
      }

      this.images.update((current) => [
        ...current,
        {
          id: `img-${this.nextId++}`,
          file,
          name: file.name,
          size: file.size,
          width: size.width,
          height: size.height,
          url: URL.createObjectURL(file),
        },
      ]);
    }
  }

  /** Reads an image's intrinsic pixel size by decoding it once. */
  private async imageSize(file: File): Promise<{ width: number; height: number }> {
    const bitmap = await createImageBitmap(file);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }

  // --- Images -> PDF: list operations ----------------------------------
  protected dropImage(event: CdkDragDrop<unknown>): void {
    const { previousIndex, currentIndex } = event;
    if (previousIndex === currentIndex) {
      return;
    }
    this.images.update((current) => {
      const next = current.slice();
      const [moved] = next.splice(previousIndex, 1);
      next.splice(currentIndex, 0, moved);
      return next;
    });
  }

  /** Keyboard-reachable equivalent of a drag, one position at a time. */
  protected moveImage(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.images().length) {
      return;
    }
    this.images.update((current) => {
      const next = current.slice();
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  protected removeImage(id: string): void {
    const item = this.images().find((entry) => entry.id === id);
    if (item) {
      URL.revokeObjectURL(item.url);
    }
    this.images.update((current) => current.filter((entry) => entry.id !== id));
  }

  protected setPagePreset(preset: PagePreset): void {
    this.pagePreset.set(preset);
  }

  protected setOrientation(orientation: Orientation): void {
    this.orientation.set(orientation);
  }

  protected setMargin(margin: MarginPreset): void {
    this.margin.set(margin);
  }

  // --- Images -> PDF: build --------------------------------------------
  /**
   * Builds one PDF, one image per page, in the arranged order.
   *
   * JPEGs and PNGs are embedded byte-for-byte so nothing is re-encoded and no
   * quality is lost. Everything else — WebP, GIF, BMP, AVIF, or a progressive
   * JPEG pdf-lib declines — is drawn to a canvas and embedded as a lossless PNG,
   * which also preserves any transparency the source carried.
   */
  protected async buildPdf(): Promise<void> {
    if (!this.hasImages() || this.buildingPdf()) {
      return;
    }

    this.buildingPdf.set(true);
    try {
      const doc = await PDFDocument.create();
      const marginPt = MARGINS[this.margin()];

      for (const item of this.images()) {
        let embedded: PDFImage;
        try {
          embedded = await this.embed(doc, item);
        } catch {
          this.showError(`"${item.name}" could not be added and was skipped.`);
          continue;
        }

        const layout = placeImage(
          { width: item.width, height: item.height },
          this.pagePreset(),
          this.orientation(),
          marginPt,
        );
        const page = doc.addPage([layout.page.width, layout.page.height]);
        page.drawImage(embedded, {
          x: layout.x,
          y: layout.y,
          width: layout.width,
          height: layout.height,
        });
      }

      if (doc.getPageCount() === 0) {
        this.showError('None of the images could be added to a PDF.');
        return;
      }

      downloadBytes(await doc.save(), this.pdfOutputName(), 'application/pdf');
    } catch {
      this.showError('Could not build the PDF. One of the images may be unreadable.');
    } finally {
      this.buildingPdf.set(false);
    }
  }

  private async embed(doc: PDFDocument, item: ImageItem): Promise<PDFImage> {
    const bytes = new Uint8Array(await item.file.arrayBuffer());
    if (item.file.type === 'image/jpeg' || /\.jpe?g$/i.test(item.name)) {
      try {
        return await doc.embedJpg(bytes);
      } catch {
        // A progressive JPEG pdf-lib cannot parse — fall through to rasterising.
      }
    } else if (item.file.type === 'image/png' || /\.png$/i.test(item.name)) {
      return await doc.embedPng(bytes);
    }
    return doc.embedPng(await this.rasteriseToPng(item.file));
  }

  /** Decodes any browser-readable image and re-encodes it as a PNG. */
  private async rasteriseToPng(file: File): Promise<Uint8Array> {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('no 2d context');
      }
      context.drawImage(bitmap, 0, 0);
      const blob = await this.canvasBlob(canvas, 'image/png', 1);
      return new Uint8Array(await blob.arrayBuffer());
    } finally {
      bitmap.close();
    }
  }

  // --- PDF -> Images: intake -------------------------------------------
  protected async loadPdf(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) {
      return;
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      this.showError(`"${file.name}" is not a PDF.`);
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_PDF_BYTES)}).`);
      return;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!looksLikePdf(bytes)) {
      this.showError(`"${file.name}" is not a readable PDF.`);
      return;
    }

    this.resetPdf();

    let renderer: PdfDocumentRenderer;
    try {
      renderer = await PdfDocumentRenderer.open(bytes);
    } catch {
      this.showError(`"${file.name}" could not be opened. It may be corrupt or protected.`);
      return;
    }

    this.pdf.set({ name: file.name, renderer, pageCount: renderer.pageCount });
    void this.renderThumbnails(renderer);
  }

  protected onPdfPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (files.length) {
      void this.loadPdf(files);
    }
  }

  /** Draws the preview thumbnails in reading order, one at a time. */
  private async renderThumbnails(renderer: PdfDocumentRenderer): Promise<void> {
    const token = ++this.thumbToken;
    const count = Math.min(renderer.pageCount, MAX_RENDER_PAGES);
    this.pendingThumbs.set(count);

    for (let index = 0; index < count; index++) {
      if (token !== this.thumbToken) {
        return;
      }
      try {
        const dataUrl = await renderer.renderThumbnail(index, THUMB_EDGE);
        if (token !== this.thumbToken) {
          return;
        }
        this.thumbs.update((current) => new Map(current).set(index, dataUrl));
      } catch {
        // One page that will not draw should not stop the rest.
      } finally {
        this.pendingThumbs.update((value) => Math.max(0, value - 1));
      }
    }
  }

  protected thumbFor(index: number): string | null {
    return this.thumbs().get(index) ?? null;
  }

  protected setImageFormat(format: 'image/png' | 'image/jpeg'): void {
    this.imageFormat.set(format);
  }

  protected setDpi(dpi: number): void {
    this.dpi.set(dpi);
  }

  // --- PDF -> Images: render -------------------------------------------
  /**
   * Rasterises every page at the chosen resolution and format, then hands back
   * one download: a single image when the PDF has one page, a zip otherwise —
   * which sidesteps the burst-download throttle a per-page loop would trip.
   */
  protected async convertToImages(): Promise<void> {
    const loaded = this.pdf();
    if (!loaded || this.rendering()) {
      return;
    }

    this.releaseRendered();
    this.rendered.set([]);
    this.rendering.set(true);
    this.renderProgress.set(0);

    const scale = dpiScale(this.dpi());
    const format = this.imageFormat();
    const quality = format === 'image/jpeg' ? 0.9 : undefined;
    const count = Math.min(loaded.pageCount, MAX_RENDER_PAGES);
    const results: RenderedImage[] = [];

    try {
      for (let index = 0; index < count; index++) {
        const { canvas, width, height } = await loaded.renderer.renderPageCanvas(index, scale);
        const blob = await this.canvasBlob(canvas, format, quality);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        results.push({
          index,
          bytes,
          url: URL.createObjectURL(blob),
          size: blob.size,
          width,
          height,
        });
        this.renderProgress.set(index + 1);
      }

      this.rendered.set(results);

      if (results.length === 1) {
        this.downloadOne(results[0]);
      } else if (results.length > 1) {
        await this.downloadAllImages(results);
      }
    } catch {
      this.showError('Could not convert the PDF. It may be corrupt or protected.');
    } finally {
      this.rendering.set(false);
    }
  }

  protected downloadOne(image: RenderedImage): void {
    downloadBlob(
      new Blob([image.bytes.slice()], { type: this.imageFormat() }),
      this.imageName(image),
    );
  }

  protected async downloadAll(): Promise<void> {
    const results = this.rendered();
    if (results.length === 1) {
      this.downloadOne(results[0]);
    } else if (results.length > 1) {
      await this.downloadAllImages(results);
    }
  }

  private async downloadAllImages(results: readonly RenderedImage[]): Promise<void> {
    const entries: ZipEntry[] = results.map((image) => ({
      name: this.imageName(image),
      bytes: image.bytes,
    }));
    try {
      await downloadZip(entries, `${this.pdfStem()}-images.zip`);
    } catch (error) {
      this.showError(error instanceof Error ? error.message : 'Could not build the archive.');
    }
  }

  // --- Shared helpers ---------------------------------------------------
  protected formatBytes(bytes: number): string {
    return formatBytes(bytes);
  }

  private canvasBlob(
    canvas: HTMLCanvasElement,
    type: string,
    quality: number | undefined,
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded.'))),
        type,
        quality,
      );
    });
  }

  private pdfOutputName(): string {
    const first = this.images()[0];
    return first ? `${fileStem(first.name, 'images')}.pdf` : 'images.pdf';
  }

  private pdfStem(): string {
    return fileStem(this.pdf()?.name ?? 'document', 'document');
  }

  private imageName(image: RenderedImage): string {
    const ext = this.imageFormat() === 'image/jpeg' ? 'jpg' : 'png';
    const number = String(image.index + 1).padStart(3, '0');
    return `${this.pdfStem()}-page-${number}.${ext}`;
  }

  // --- Reset ------------------------------------------------------------
  protected resetImages(): void {
    this.releaseImages();
    this.images.set([]);
  }

  protected resetPdf(): void {
    this.thumbToken++;
    this.pdf()?.renderer.close();
    this.releaseRendered();
    this.pdf.set(null);
    this.thumbs.set(new Map());
    this.pendingThumbs.set(0);
    this.rendered.set([]);
    this.renderProgress.set(0);
  }

  private releaseImages(): void {
    for (const item of this.images()) {
      URL.revokeObjectURL(item.url);
    }
  }

  private releaseRendered(): void {
    for (const image of this.rendered()) {
      URL.revokeObjectURL(image.url);
    }
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  }
}
