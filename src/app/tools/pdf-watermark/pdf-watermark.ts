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
import { PDFDocument, PDFFont, StandardFonts, degrees, rgb } from '@cantoo/pdf-lib';
import { downloadBytes } from '../../core/download';
import { describeFile, formatBytes } from '../../core/format';
import { looksLikePdf } from '../../core/pdf-probe';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { PdfPreview } from '../../shared/pdf-preview/pdf-preview';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import {
  NumberFormat,
  NumberPosition,
  centeredOrigin,
  displaySize,
  numberLabel,
  numberOrigin,
  toPageFrame,
} from './layout';

const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const NUMBER_MARGIN = 28;

const COLORS = {
  grey: rgb(0.45, 0.45, 0.45),
  red: rgb(0.8, 0.1, 0.1),
  blue: rgb(0.1, 0.3, 0.75),
} as const;
type WatermarkColor = keyof typeof COLORS;

export const NUMBER_FORMATS: { value: NumberFormat; label: string }[] = [
  { value: 'page-n-of-total', label: 'Page 1 of 9' },
  { value: 'page-n', label: 'Page 1' },
  { value: 'n', label: '1' },
  { value: 'n-of-total', label: '1 / 9' },
];

export const NUMBER_POSITIONS: { value: NumberPosition; label: string }[] = [
  { value: 'bottom-center', label: 'Bottom centre' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'top-center', label: 'Top centre' },
  { value: 'top-right', label: 'Top right' },
];

/**
 * PDF Watermark & Page Numbers: stamp text across every page and/or number
 * the pages, with a live preview in the real viewer.
 *
 * Browser-only via pdf-lib. Positions are worked out in the displayed frame
 * (see layout.ts) so rotated scans get their numbers where the reader looks.
 */
@Component({
  selector: 'app-pdf-watermark',
  imports: [ToolPage, Dropzone, ToolContent, MatButtonModule, NgIcon, Spinner, PdfPreview],
  templateUrl: './pdf-watermark.html',
  styleUrls: ['../tool-shell.css', './pdf-watermark.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfWatermarkTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);

  protected readonly formats = NUMBER_FORMATS;
  protected readonly positions = NUMBER_POSITIONS;

  protected readonly fileName = signal('');
  protected readonly fileSize = signal(0);
  protected readonly pageCount = signal(0);
  protected readonly busy = signal(false);
  /** The stamped document, for the preview and the download. */
  protected readonly stamped = signal<Uint8Array | null>(null);

  protected readonly watermarkOn = signal(true);
  protected readonly text = signal('CONFIDENTIAL');
  protected readonly size = signal(64);
  protected readonly opacity = signal(20);
  protected readonly diagonal = signal(true);
  protected readonly color = signal<WatermarkColor>('grey');

  protected readonly numbersOn = signal(false);
  protected readonly format = signal<NumberFormat>('page-n-of-total');
  protected readonly position = signal<NumberPosition>('bottom-center');
  protected readonly start = signal(1);
  protected readonly skipFirst = signal(false);

  protected readonly hasFile = computed(() => this.fileName() !== '');
  protected readonly fileSummary = computed(() =>
    describeFile(this.fileName(), this.pageCount() || null, this.fileSize()),
  );
  protected readonly anythingToDo = computed(
    () => (this.watermarkOn() && this.text().trim() !== '') || this.numbersOn(),
  );

  private bytes: Uint8Array | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private run = 0;

  ngOnDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  protected acceptFiles(files: File[]): void {
    const file = files[0];
    if (file) {
      void this.load(file);
    }
  }

  private async load(file: File): Promise<void> {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      this.showError(`"${file.name}" is not a PDF.`);
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!looksLikePdf(bytes)) {
      this.showError(`"${file.name}" is not a readable PDF.`);
      return;
    }
    let pages: number;
    try {
      pages = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
    } catch {
      this.showError(`"${file.name}" could not be opened. It may be damaged or encrypted.`);
      return;
    }
    this.bytes = bytes;
    this.fileName.set(file.name);
    this.fileSize.set(file.size);
    this.pageCount.set(pages);
    this.stamped.set(null);
    await this.refresh();
  }

  protected clear(): void {
    this.bytes = null;
    this.run++;
    this.fileName.set('');
    this.fileSize.set(0);
    this.pageCount.set(0);
    this.stamped.set(null);
  }

  // --- Option setters: each one re-stamps after a short pause ------------
  protected set<T>(target: { set(value: T): void }, value: T): void {
    target.set(value);
    this.schedule();
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected number(event: Event, fallback: number): number {
    const n = Number((event.target as HTMLInputElement).value);
    return Number.isFinite(n) ? n : fallback;
  }

  protected setColor(event: Event): void {
    this.set(this.color, this.value(event) as WatermarkColor);
  }

  protected setFormat(event: Event): void {
    this.set(this.format, this.value(event) as NumberFormat);
  }

  protected setPosition(event: Event): void {
    this.set(this.position, this.value(event) as NumberPosition);
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  private schedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => void this.refresh(), 350);
  }

  // --- Stamping ---------------------------------------------------------
  private async refresh(): Promise<void> {
    const bytes = this.bytes;
    if (!bytes) {
      return;
    }
    const run = ++this.run;
    this.busy.set(true);
    try {
      const out = await this.stamp(bytes);
      if (run === this.run) {
        this.stamped.set(out);
      }
    } catch (error) {
      if (run === this.run) {
        this.showError(
          error instanceof Error && /encod|WinAnsi/i.test(error.message)
            ? 'The watermark text uses characters the built-in font cannot draw. Stick to Latin letters, digits and punctuation.'
            : 'This PDF could not be stamped. It may be damaged or encrypted.',
        );
      }
    } finally {
      if (run === this.run) {
        this.busy.set(false);
      }
    }
  }

  private async stamp(bytes: Uint8Array): Promise<Uint8Array> {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = doc.getPages();
    const skip = this.skipFirst() ? 1 : 0;
    const total = Math.max(0, pages.length - skip);

    const watermark = this.watermarkOn() && this.text().trim() !== '';
    const numbers = this.numbersOn();
    let bold: PDFFont | null = null;
    let regular: PDFFont | null = null;
    if (watermark) {
      bold = await doc.embedFont(StandardFonts.HelveticaBold);
    }
    if (numbers) {
      regular = await doc.embedFont(StandardFonts.Helvetica);
    }

    pages.forEach((page, index) => {
      if (index < skip) {
        return;
      }
      const { width, height } = page.getSize();
      const rotation = page.getRotation().angle;
      const shown = displaySize(rotation, width, height);

      if (bold) {
        const text = this.text().trim();
        const size = this.size();
        const angle = this.diagonal() ? (Math.atan2(shown.height, shown.width) * 180) / Math.PI : 0;
        const origin = centeredOrigin(
          { x: shown.width / 2, y: shown.height / 2 },
          bold.widthOfTextAtSize(text, size),
          // Cap height, not the full em box, so the visible letters sit centred.
          size * 0.72,
          angle,
        );
        page.drawText(text, {
          ...toPageFrame(origin, rotation, width, height),
          size,
          font: bold,
          color: COLORS[this.color()],
          opacity: this.opacity() / 100,
          rotate: degrees(angle + rotation),
        });
      }

      if (regular) {
        const label = numberLabel(this.format(), index - skip + this.start(), total);
        const size = 11;
        const origin = numberOrigin(
          this.position(),
          shown,
          regular.widthOfTextAtSize(label, size),
          size,
          NUMBER_MARGIN,
        );
        page.drawText(label, {
          ...toPageFrame(origin, rotation, width, height),
          size,
          font: regular,
          color: rgb(0.2, 0.2, 0.2),
          rotate: degrees(rotation),
        });
      }
    });

    return doc.save();
  }

  protected download(): void {
    const out = this.stamped();
    if (out) {
      downloadBytes(
        out,
        `${this.fileName().replace(/\.pdf$/i, '')}-stamped.pdf`,
        'application/pdf',
      );
    }
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  }
}
