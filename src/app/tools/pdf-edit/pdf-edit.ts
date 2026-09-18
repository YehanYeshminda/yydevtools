import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgIcon } from '@ng-icons/core';

import { downloadBytes } from '../../core/download';
import type { HandoffFile } from '../../core/file-handoff';
import { describeFile, formatBytes } from '../../core/format';
import { EditablePdf, type Addition, type EditPlan } from '../../core/pdf-edit/document';
import type { TextRun } from '../../core/pdf-edit/text-runs';
import { looksLikePdf } from '../../core/pdf-probe';
import { PdfDocumentRenderer } from '../../core/pdf-render';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { NextStep } from '../../shared/next-step/next-step';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';

const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** How far in and out the page can be taken. */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];

/**
 * Pixels drawn per page point.
 *
 * Twice the zoom keeps small type sharp when the page is enlarged, and the
 * ceiling stops a 400% view of an A4 page from asking for a canvas no browser
 * will allocate.
 */
const renderScale = (zoom: number): number => Math.min(Math.max(zoom * 2, 1.5), 3);

/** Waiting this long before rebuilding the preview keeps typing responsive. */
const SETTLE_MS = 220;

const NEW_TEXT_SIZE = 12;
/** A placed picture starts at this share of the page width. */
const NEW_IMAGE_SHARE = 0.3;

/**
 * One run of text as it sits on the rendered page.
 *
 * Every measurement is a percentage of the page, so the sheet can be drawn at
 * any zoom and the boxes stay on the words. The font size rides along as a
 * container-query width, which is the same trick in the one place a percentage
 * cannot be used.
 */
interface RunBox {
  run: TextRun;
  key: string;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Font size as a share of the page width, for `cqw`. */
  size: number;
  color: string;
  editable: boolean;
  edited: boolean;
  removed: boolean;
}

/** An added line or picture, placed the same way. */
interface AddedBox {
  item: Addition;
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  size: number;
  /** Object URL for a picture, so it can be shown before it is in the file. */
  url: string;
}

/** Roughly where a baseline sits inside its line, as a fraction of font size. */
const ASCENT = 0.8;
const DESCENT = 0.25;

/**
 * PDF Editor: change the text that is already in a PDF, in the file itself.
 *
 * Every other PDF tool here adds a layer — a signature on top, a black box
 * over a word, a page rebuilt as a picture. This one reads the page's content
 * stream, finds the operators that drew each run of text, and rewrites those
 * bytes. What comes out is the same document with different words in it: still
 * selectable text, still the original fonts, still every graphic untouched,
 * because nothing that was not edited is rewritten at all.
 *
 * The page on screen is the edited document, not the original with markers on
 * it: every applied change rebuilds the file and draws that. It costs a save
 * and a re-parse per change, which is why it is debounced, and it is what makes
 * downloading to find out unnecessary.
 *
 * The honest limit is the fonts. A PDF usually carries only the glyphs it
 * needs, so a document that never says "x" cannot be made to say one in its own
 * typeface; the tool notices before the edit is made and re-sets that run in
 * the nearest standard face instead, saying so.
 */
@Component({
  selector: 'app-pdf-edit',
  imports: [NextStep, ToolPage, Dropzone, ToolContent, MatButtonModule, NgIcon, Spinner],
  templateUrl: './pdf-edit.html',
  styleUrls: ['../tool-shell.css', './pdf-edit.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfEditTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly overlay = viewChild<ElementRef<HTMLElement>>('overlay');
  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');

  protected readonly fileName = signal('');
  protected readonly fileSize = signal(0);
  protected readonly pageCount = signal(0);
  protected readonly page = signal(0);
  protected readonly pageImage = signal<string | null>(null);
  protected readonly rendering = signal(false);
  protected readonly busy = signal(false);
  protected readonly placing = signal(false);
  protected readonly zoom = signal(1);
  /** While on, the page shows the file as it arrived. */
  protected readonly showOriginal = signal(false);
  protected readonly result = signal<HandoffFile | null>(null);

  /** Bumped whenever a change lands, to rebuild the boxes from the document. */
  private readonly revision = signal(0);
  private readonly pageSize = signal({ width: 1, height: 1 });
  private readonly runs = signal<TextRun[]>([]);

  /** The run being edited and what has been typed into it so far. */
  protected readonly editing = signal<RunBox | null>(null);
  protected readonly draft = signal('');
  protected readonly plan = signal<EditPlan | null>(null);
  /** The added line or picture whose controls are open. */
  protected readonly selected = signal<string | null>(null);

  protected readonly hasFile = computed(() => this.fileName() !== '');
  protected readonly fileSummary = computed(() =>
    describeFile(this.fileName(), this.pageCount() || null, this.fileSize()),
  );
  protected readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);
  /** The page's drawn width in CSS pixels, which is what the zoom controls. */
  protected readonly sheetWidth = computed(() => this.pageSize().width * this.zoom());

  protected readonly boxes = computed<RunBox[]>(() => {
    this.revision();
    const pdf = this.pdf;
    const { width, height } = this.pageSize();
    if (!pdf || width <= 0 || height <= 0) return [];
    return this.runs().map((run) => {
      const text = pdf.textOf(run);
      return {
        run,
        key: `${run.streamId}@${run.start}`,
        text,
        left: (run.x / width) * 100,
        top: ((height - run.y - run.size * ASCENT) / height) * 100,
        // A removed or very short run still needs something to click on.
        width: (Math.max(run.width, run.size * 0.6) / width) * 100,
        height: ((run.size * (ASCENT + DESCENT)) / height) * 100,
        size: (run.size / width) * 100,
        color: run.color,
        editable: !run.rotated,
        edited: pdf.edited(run),
        removed: text === '',
      };
    });
  });

  protected readonly added = computed<AddedBox[]>(() => {
    this.revision();
    const pdf = this.pdf;
    const { width, height } = this.pageSize();
    if (!pdf) return [];
    return pdf.additions
      .filter((item) => item.page === this.page())
      .map((item) => {
        const tall = item.kind === 'text' ? item.size * (ASCENT + DESCENT) : item.height;
        return {
          item,
          id: item.id,
          left: (item.x / width) * 100,
          top: ((height - item.y - tall * (item.kind === 'text' ? ASCENT : 1)) / height) * 100,
          width: item.kind === 'image' ? (item.width / width) * 100 : 0,
          height: (tall / height) * 100,
          size: ((item.kind === 'text' ? item.size : 0) / width) * 100,
          url: this.imageUrls.get(item.id) ?? '',
        };
      });
  });

  /** The added item the controls belong to, if one is chosen. */
  protected readonly chosen = computed(() =>
    this.added().find((box) => box.id === this.selected()),
  );

  protected readonly changeCount = computed(() => {
    this.revision();
    return this.pdf?.changeCount ?? 0;
  });

  protected readonly canSave = computed(() => this.changeCount() > 0 && !this.busy());

  /** What the message under the editor should say, if anything. */
  protected readonly planNote = computed(() => {
    const plan = this.plan();
    if (!plan) return '';
    if (plan.kind === 'refused') {
      return `There is no way to write ${list(plan.missing)} into this document.`;
    }
    const notes: string[] = [];
    if (plan.kind === 'substitute') {
      notes.push(
        `This font has no ${list(plan.missing)}, so the line will be re-set in ${plan.face}.`,
      );
    }
    // Either direction is worth saying: nothing reflows, so a longer line runs
    // into what follows it and a shorter one leaves the gap behind.
    const room = Math.round(plan.overrun);
    if (room > 1) notes.push(`About ${room}pt longer than the space it had.`);
    else if (room < -2) notes.push(`About ${-room}pt shorter, so it will leave a gap.`);
    return notes.join(' ');
  });

  protected readonly canCommit = computed(() => this.plan()?.kind !== 'refused');

  private pdf: EditablePdf | null = null;
  private renderer: PdfDocumentRenderer | null = null;
  private original: PdfDocumentRenderer | null = null;
  private renderToken = 0;
  private settle: ReturnType<typeof setTimeout> | null = null;
  private readonly imageUrls = new Map<string, string>();
  private drag: {
    id: string;
    mode: 'move' | 'resize';
    pointerId: number;
    from: { x: number; y: number };
    start: { x: number; y: number; width: number; height: number };
  } | null = null;

  ngOnDestroy(): void {
    this.closeDocument();
  }

  // --- The document -----------------------------------------------------

  protected acceptFiles(files: File[]): void {
    const file = files[0];
    if (file) void this.load(file);
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

    this.closeDocument();
    try {
      // Three readers of the same bytes: one keeps the file as it arrived for
      // the comparison, one is reopened on the edited document, and one holds
      // the document being changed.
      this.original = await PdfDocumentRenderer.open(bytes);
      this.renderer = await PdfDocumentRenderer.open(bytes);
      this.pdf = await EditablePdf.open(bytes.slice());
    } catch {
      this.showError(
        `"${file.name}" could not be opened. It may be damaged or password-protected.`,
      );
      this.closeDocument();
      return;
    }
    this.fileName.set(file.name);
    this.fileSize.set(file.size);
    this.pageCount.set(this.pdf.pageCount);
    this.result.set(null);
    this.pageSize.set(this.pdf.pageSize(0));
    this.fitToWidth();
    await this.showPage(0);
  }

  protected async showPage(index: number): Promise<void> {
    const pdf = this.pdf;
    if (!pdf || index < 0 || index >= pdf.pageCount) return;
    this.stopEditing();
    this.selected.set(null);
    this.page.set(index);
    this.pageSize.set(pdf.pageSize(index));
    this.runs.set(pdf.runs(index));
    await this.draw();
  }

  protected previousPage(): void {
    void this.showPage(this.page() - 1);
  }

  protected nextPage(): void {
    void this.showPage(this.page() + 1);
  }

  /** Draws the current page from whichever document is being shown. */
  private async draw(): Promise<void> {
    const renderer = this.showOriginal() ? this.original : this.renderer;
    if (!renderer) return;
    const token = ++this.renderToken;
    this.rendering.set(true);
    try {
      const { canvas } = await renderer.renderPageCanvas(this.page(), renderScale(this.zoom()));
      if (token !== this.renderToken) return;
      this.pageImage.set(canvas.toDataURL('image/jpeg', 0.92));
    } catch {
      this.showError('That page could not be drawn.');
    } finally {
      if (token === this.renderToken) this.rendering.set(false);
    }
  }

  /**
   * Rebuilds the preview from the edited document.
   *
   * Debounced, because it saves the whole file and hands it back to pdf.js —
   * cheap on a page of text, not free on a long document, and pointless three
   * times over while somebody drags a picture across the page.
   */
  private refresh(): void {
    this.revision.update((count) => count + 1);
    if (this.settle) clearTimeout(this.settle);
    this.settle = setTimeout(() => {
      this.settle = null;
      void this.rebuild();
    }, SETTLE_MS);
  }

  private async rebuild(): Promise<void> {
    const pdf = this.pdf;
    if (!pdf || this.showOriginal()) return;
    try {
      const next = await PdfDocumentRenderer.open(await pdf.save());
      this.renderer?.close();
      this.renderer = next;
    } catch {
      this.showError('The preview could not be rebuilt, but your changes are still here.');
      return;
    }
    await this.draw();
  }

  // --- Zoom ---------------------------------------------------------------

  protected zoomIn(): void {
    this.setZoom(ZOOM_STEPS.find((step) => step > this.zoom() + 0.001) ?? MAX_ZOOM);
  }

  protected zoomOut(): void {
    const smaller = [...ZOOM_STEPS].reverse().find((step) => step < this.zoom() - 0.001);
    this.setZoom(smaller ?? MIN_ZOOM);
  }

  /** Sets the zoom so the page fills the width it has to sit in. */
  protected fitToWidth(): void {
    const frame = this.frame()?.nativeElement;
    const width = this.pageSize().width;
    if (!frame || width <= 1) return;
    // The gutter keeps the page clear of the scrollbar it may have caused.
    this.setZoom((frame.clientWidth - 28) / width);
  }

  private setZoom(value: number): void {
    const next = Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);
    if (Math.abs(next - this.zoom()) < 0.001) return;
    this.zoom.set(next);
    void this.draw();
  }

  /** Ctrl- or ⌘-scroll zooms the page, the way every other viewer does. */
  protected onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    if (event.deltaY < 0) this.zoomIn();
    else this.zoomOut();
  }

  protected toggleOriginal(): void {
    this.stopEditing();
    this.selected.set(null);
    this.showOriginal.update((on) => !on);
    if (this.showOriginal()) void this.draw();
    else void this.rebuild();
  }

  // --- Editing a run ------------------------------------------------------

  protected startEditing(box: RunBox): void {
    if (this.showOriginal()) return;
    if (!box.editable) {
      this.snackBar.open('Sideways and rotated text can be read here but not changed.', 'Dismiss', {
        duration: 5000,
      });
      return;
    }
    this.placing.set(false);
    this.selected.set(null);
    this.editing.set(box);
    this.draft.set(box.text);
    this.replan(box.text);
  }

  protected onDraft(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draft.set(value);
    this.replan(value);
  }

  private replan(text: string): void {
    const box = this.editing();
    const pdf = this.pdf;
    this.plan.set(box && pdf && text !== '' ? pdf.plan(this.page(), box.run, text) : null);
  }

  protected commit(): void {
    const box = this.editing();
    const pdf = this.pdf;
    if (!box || !pdf) return;
    try {
      pdf.setText(this.page(), box.run, this.draft());
    } catch {
      this.showError('That text cannot be written into this document.');
      return;
    }
    this.stopEditing();
    this.refresh();
  }

  protected removeRun(): void {
    if (!this.editing()) return;
    this.draft.set('');
    this.plan.set(null);
    this.commit();
  }

  protected stopEditing(): void {
    this.editing.set(null);
    this.draft.set('');
    this.plan.set(null);
  }

  // --- Adding a line or a picture -----------------------------------------

  protected togglePlacing(): void {
    this.stopEditing();
    this.selected.set(null);
    this.placing.update((on) => !on);
  }

  /**
   * Puts a new line where the page was clicked, or — when nothing is being
   * placed — closes whatever was open, which is what clicking off it means.
   */
  protected onSheetDown(event: PointerEvent): void {
    if (!this.placing()) {
      this.stopEditing();
      this.selected.set(null);
      return;
    }
    const point = this.pointOf(event);
    if (!point || !this.pdf) return;
    const id = freshId();
    this.pdf.add({
      kind: 'text',
      id,
      page: this.page(),
      text: 'New text',
      x: point.x,
      y: point.y,
      size: NEW_TEXT_SIZE,
      color: '#000000',
      bold: false,
    });
    this.placing.set(false);
    this.selected.set(id);
    this.refresh();
  }

  protected async acceptImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Clearing it means the same picture can be chosen twice in a row.
    input.value = '';
    const pdf = this.pdf;
    if (!file || !pdf) return;
    if (file.size > MAX_IMAGE_BYTES) {
      this.showError(`"${file.name}" is too large (max ${formatBytes(MAX_IMAGE_BYTES)}).`);
      return;
    }
    let picture: Picture;
    try {
      picture = await readPicture(file);
    } catch {
      this.showError(`"${file.name}" could not be read as an image.`);
      return;
    }

    const page = this.pageSize();
    const width = page.width * NEW_IMAGE_SHARE;
    const height = (width * picture.height) / picture.width;
    const id = freshId();
    this.imageUrls.set(
      id,
      URL.createObjectURL(new Blob([picture.bytes.slice()], { type: `image/${picture.format}` })),
    );
    pdf.add({
      kind: 'image',
      id,
      page: this.page(),
      bytes: picture.bytes,
      format: picture.format,
      // Dropped in the middle, where it is visible and easy to drag from.
      x: (page.width - width) / 2,
      y: (page.height - height) / 2,
      width,
      height,
    });
    this.selected.set(id);
    this.refresh();
  }

  protected choose(id: string, event: Event): void {
    event.stopPropagation();
    this.stopEditing();
    this.selected.set(id);
  }

  protected editAdded(id: string, event: Event): void {
    this.pdf?.update(id, { text: (event.target as HTMLInputElement).value });
    this.refresh();
  }

  protected setSize(id: string, event: Event): void {
    const size = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(size) && size > 0) this.pdf?.update(id, { size });
    this.refresh();
  }

  protected setColor(id: string, event: Event): void {
    this.pdf?.update(id, { color: (event.target as HTMLInputElement).value });
    this.refresh();
  }

  protected toggleBold(box: AddedBox): void {
    if (box.item.kind !== 'text') return;
    this.pdf?.update(box.id, { bold: !box.item.bold });
    this.refresh();
  }

  /** Resizes a picture by its width, keeping the shape it came in. */
  protected setWidth(box: AddedBox, event: Event): void {
    if (box.item.kind !== 'image') return;
    const width = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(width) || width <= 0) return;
    const ratio = box.item.height / box.item.width;
    this.pdf?.update(box.id, { width, height: width * ratio });
    this.refresh();
  }

  protected removeAdded(id: string): void {
    this.pdf?.remove(id);
    this.releaseUrl(id);
    if (this.selected() === id) this.selected.set(null);
    this.refresh();
  }

  // --- Dragging -----------------------------------------------------------

  protected startDrag(box: AddedBox, mode: 'move' | 'resize', event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const point = this.pointOf(event);
    if (!point) return;
    const item = box.item;
    this.selected.set(box.id);
    this.stopEditing();
    this.drag = {
      id: box.id,
      mode,
      pointerId: event.pointerId,
      from: point,
      start: {
        x: item.x,
        y: item.y,
        width: item.kind === 'image' ? item.width : 0,
        height: item.kind === 'image' ? item.height : 0,
      },
    };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  protected onDrag(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = this.pointOf(event);
    if (!point) return;
    const dx = point.x - drag.from.x;
    const dy = point.y - drag.from.y;
    if (drag.mode === 'move') {
      this.pdf?.update(drag.id, { x: drag.start.x + dx, y: drag.start.y + dy });
    } else {
      // The corner sets the width and the shape follows; the top edge is what
      // stays still, because the anchor underneath is the bottom-left corner.
      const width = Math.max(8, drag.start.width + dx);
      const height = (width * drag.start.height) / drag.start.width;
      this.pdf?.update(drag.id, {
        width,
        height,
        y: drag.start.y - (height - drag.start.height),
      });
    }
    // Only the boxes move while the pointer is down; the page catches up after.
    this.revision.update((count) => count + 1);
  }

  protected endDrag(event: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    this.drag = null;
    this.refresh();
  }

  /** Where a pointer is on the page, in page points. */
  private pointOf(event: PointerEvent): { x: number; y: number } | null {
    const host = this.overlay()?.nativeElement;
    if (!host) return null;
    const rect = host.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const { width, height } = this.pageSize();
    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: height - ((event.clientY - rect.top) / rect.height) * height,
    };
  }

  // --- Out again ----------------------------------------------------------

  protected async save(): Promise<void> {
    const pdf = this.pdf;
    if (!pdf || this.busy()) return;
    this.busy.set(true);
    try {
      const bytes = await pdf.save();
      const name = this.fileName().replace(/\.pdf$/i, '') + '-edited.pdf';
      downloadBytes(bytes, name, 'application/pdf');
      this.result.set({ bytes, name });
    } catch {
      this.showError('The edited PDF could not be written.');
    } finally {
      this.busy.set(false);
    }
  }

  protected revert(): void {
    this.pdf?.reset();
    this.stopEditing();
    this.selected.set(null);
    for (const id of [...this.imageUrls.keys()]) this.releaseUrl(id);
    this.refresh();
  }

  protected clear(): void {
    this.result.set(null);
    this.closeDocument();
    this.fileName.set('');
    this.fileSize.set(0);
    this.pageCount.set(0);
    this.pageImage.set(null);
    this.runs.set([]);
  }

  private closeDocument(): void {
    this.renderToken++;
    if (this.settle) clearTimeout(this.settle);
    this.settle = null;
    this.renderer?.close();
    this.original?.close();
    this.renderer = null;
    this.original = null;
    this.pdf = null;
    for (const id of [...this.imageUrls.keys()]) this.releaseUrl(id);
    this.stopEditing();
    this.selected.set(null);
    this.placing.set(false);
    this.showOriginal.set(false);
    this.revision.update((count) => count + 1);
  }

  private releaseUrl(id: string): void {
    const url = this.imageUrls.get(id);
    if (url) URL.revokeObjectURL(url);
    this.imageUrls.delete(id);
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 6000 });
  }
}

/** Characters named back to the reader: “9”, “3” and “7”. */
function list(characters: string[]): string {
  const quoted = characters.slice(0, 6).map((character) => `“${character}”`);
  if (characters.length > 6) return `${quoted.join(', ')} and more`;
  if (quoted.length <= 1) return quoted.join('');
  return `${quoted.slice(0, -1).join(', ')} or ${quoted[quoted.length - 1]}`;
}

let counter = 0;
function freshId(): string {
  return `a${++counter}`;
}

interface Picture {
  bytes: Uint8Array;
  format: 'png' | 'jpeg';
  width: number;
  height: number;
}

/**
 * A chosen file as bytes a PDF can carry.
 *
 * PNG and JPEG go in untouched, because re-encoding them could only lose
 * something. Everything else the browser can decode — WebP, AVIF, GIF, a BMP —
 * is drawn once and taken back out as a PNG, which is the shortest path from
 * "the browser can show it" to "a PDF can hold it".
 */
async function readPicture(file: File): Promise<Picture> {
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  try {
    if (file.type === 'image/png' || file.type === 'image/jpeg') {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return { bytes, format: file.type === 'image/png' ? 'png' : 'jpeg', width, height };
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not open a drawing surface.');
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('That image could not be converted.');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), format: 'png', width, height };
  } finally {
    bitmap.close();
  }
}
