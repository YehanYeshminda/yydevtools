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
import { EditablePdf, type EditPlan } from '../../core/pdf-edit/document';
import type { TextRun } from '../../core/pdf-edit/text-runs';
import { looksLikePdf } from '../../core/pdf-probe';
import { PdfDocumentRenderer } from '../../core/pdf-render';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { NextStep } from '../../shared/next-step/next-step';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';

const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const PREVIEW_SCALE = 2;
/** Default size for a line the reader adds themselves. */
const NEW_TEXT_SIZE = 12;

/**
 * One run of text as it sits on the rendered page.
 *
 * Every measurement is a percentage of the page, so the sheet can be any size
 * on screen and the boxes stay on the words. The font size rides along as a
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
  /** Font size as a fraction of the page width, for `cqw`. */
  size: number;
  color: string;
  editable: boolean;
  edited: boolean;
}

/** Characters named back to the reader: “9”, “3” and “7”. */
function list(characters: string[]): string {
  const quoted = characters.slice(0, 6).map((character) => `“${character}”`);
  if (characters.length > 6) return `${quoted.join(', ')} and more`;
  if (quoted.length <= 1) return quoted.join('');
  return `${quoted.slice(0, -1).join(', ')} or ${quoted[quoted.length - 1]}`;
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

  protected readonly fileName = signal('');
  protected readonly fileSize = signal(0);
  protected readonly pageCount = signal(0);
  protected readonly page = signal(0);
  protected readonly pageImage = signal<string | null>(null);
  protected readonly rendering = signal(false);
  protected readonly busy = signal(false);
  protected readonly placing = signal(false);
  protected readonly result = signal<HandoffFile | null>(null);

  /** Bumped whenever an edit lands, to rebuild the boxes from the document. */
  private readonly revision = signal(0);
  private readonly pageSize = signal({ width: 1, height: 1 });
  private readonly runs = signal<TextRun[]>([]);

  /** The run being edited and what has been typed into it so far. */
  protected readonly editing = signal<RunBox | null>(null);
  protected readonly draft = signal('');
  protected readonly plan = signal<EditPlan | null>(null);

  protected readonly hasFile = computed(() => this.fileName() !== '');
  protected readonly fileSummary = computed(() =>
    describeFile(this.fileName(), this.pageCount() || null, this.fileSize()),
  );

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
        // A deleted or very short run still needs something to click on.
        width: (Math.max(run.width, run.size * 0.6) / width) * 100,
        height: ((run.size * (ASCENT + DESCENT)) / height) * 100,
        size: (run.size / width) * 100,
        color: run.color,
        editable: !run.rotated,
        edited: pdf.edited(run),
      };
    });
  });

  protected readonly added = computed(() => {
    this.revision();
    const pdf = this.pdf;
    const { width, height } = this.pageSize();
    if (!pdf) return [];
    return pdf.additions
      .map((item, index) => ({ item, index }))
      .filter((entry) => entry.item.page === this.page())
      .map((entry) => ({
        index: entry.index,
        text: entry.item.text,
        left: (entry.item.x / width) * 100,
        top: ((height - entry.item.y - entry.item.size * ASCENT) / height) * 100,
        size: (entry.item.size / width) * 100,
        color: entry.item.color,
      }));
  });

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
  private renderToken = 0;

  ngOnDestroy(): void {
    this.renderer?.close();
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
      // Two readers of the same bytes: one to draw the page, one to change it.
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
    await this.showPage(0);
  }

  protected async showPage(index: number): Promise<void> {
    const renderer = this.renderer;
    const pdf = this.pdf;
    if (!renderer || !pdf || index < 0 || index >= pdf.pageCount) return;

    this.stopEditing();
    const token = ++this.renderToken;
    this.rendering.set(true);
    try {
      const { canvas } = await renderer.renderPageCanvas(index, PREVIEW_SCALE);
      if (token !== this.renderToken) return;
      this.page.set(index);
      this.pageSize.set(pdf.pageSize(index));
      this.runs.set(pdf.runs(index));
      this.pageImage.set(canvas.toDataURL('image/jpeg', 0.9));
    } catch {
      this.showError('That page could not be drawn.');
    } finally {
      if (token === this.renderToken) this.rendering.set(false);
    }
  }

  protected previousPage(): void {
    void this.showPage(this.page() - 1);
  }

  protected nextPage(): void {
    void this.showPage(this.page() + 1);
  }

  // --- Editing a run ------------------------------------------------------

  protected startEditing(box: RunBox): void {
    if (!box.editable) {
      this.snackBar.open('Sideways and rotated text can be read here but not changed.', 'Dismiss', {
        duration: 5000,
      });
      return;
    }
    this.placing.set(false);
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
    this.revision.update((n) => n + 1);
  }

  protected removeRun(): void {
    const box = this.editing();
    if (!box) return;
    this.draft.set('');
    this.plan.set(null);
    this.commit();
  }

  protected stopEditing(): void {
    this.editing.set(null);
    this.draft.set('');
    this.plan.set(null);
  }

  // --- Adding a line ------------------------------------------------------

  protected togglePlacing(): void {
    this.stopEditing();
    this.placing.update((on) => !on);
  }

  /**
   * Puts a new line where the page was clicked, or — when nothing is being
   * placed — closes the open editor, which is what clicking off it should do.
   */
  protected placeText(event: PointerEvent): void {
    if (!this.placing()) {
      this.stopEditing();
      return;
    }
    if (!this.pdf) return;
    const host = this.overlay()?.nativeElement;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const { width, height } = this.pageSize();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const y = height - ((event.clientY - rect.top) / rect.height) * height;

    this.pdf.addText({
      page: this.page(),
      text: 'New text',
      x,
      y,
      size: NEW_TEXT_SIZE,
      color: '#000000',
      bold: false,
    });
    this.placing.set(false);
    this.revision.update((n) => n + 1);
  }

  protected editAdded(index: number, event: Event): void {
    const pdf = this.pdf;
    if (!pdf) return;
    pdf.setAdded(index, (event.target as HTMLInputElement).value);
    this.revision.update((n) => n + 1);
  }

  protected removeAdded(index: number): void {
    this.pdf?.removeAdded(index);
    this.revision.update((n) => n + 1);
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
    this.revision.update((n) => n + 1);
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
    this.renderer?.close();
    this.renderer = null;
    this.pdf = null;
    this.stopEditing();
    this.placing.set(false);
    this.revision.update((n) => n + 1);
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 6000 });
  }
}
