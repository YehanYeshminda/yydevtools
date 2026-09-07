import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgIcon } from '@ng-icons/core';
import { registerLicense } from '@syncfusion/ej2-base';
import {
  DocumentEditorContainerComponent,
  DocumentEditorContainerModule,
} from '@syncfusion/ej2-angular-documenteditor';

import { ClipboardService } from '../../core/clipboard.service';
import { downloadText } from '../../core/download';
import { formatBytes } from '../../core/format';
import { OfficeServicesClient } from '../../core/office-services.client';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { DocumentEditorTheme } from '../../shared/syncfusion/document-editor-theme';
import { SYNCFUSION_LICENSE_KEY } from '../../core/syncfusion-license.generated';

/** The conversion service caps at the same figure; fail before the upload. */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

/** Counts taken from the opened document, for the summary line. */
interface DocStats {
  words: number;
  characters: number;
  paragraphs: number;
  pages: number;
}

let licenseRegistered = false;

@Component({
  selector: 'app-word-viewer',
  imports: [
    ToolPage,
    ToolContent,
    Dropzone,
    Spinner,
    MatButtonModule,
    NgIcon,
    DocumentEditorContainerModule,
    DocumentEditorTheme,
  ],
  templateUrl: './word-viewer.html',
  styleUrls: ['../tool-shell.css', './word-viewer.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WordViewerTool {
  private readonly snackBar = inject(MatSnackBar);
  private readonly clipboard = inject(ClipboardService);
  private readonly wordService = inject(OfficeServicesClient);

  protected readonly formatBytes = formatBytes;

  protected readonly name = signal('');
  protected readonly size = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly stats = signal<DocStats | null>(null);

  protected readonly hasDocument = computed(() => this.name() !== '' && this.error() === null);

  private readonly editor = viewChild<DocumentEditorContainerComponent>('editor');

  /**
   * Set just before `hasDocument` flips true, so it is already there by the
   * time the `@defer`-loaded `<ejs-documenteditorcontainer>` fires `created`
   * and asks for it. The container's own inputs have no way to hand it content
   * directly — `documentEditor.open()` is the only path in.
   */
  private pendingSfdt = '';

  constructor() {
    // The Fly machine behind /api/word/import suspends when idle — see
    // hosted-pdf-tool.ts's constructor for the full reasoning, which applies
    // here unchanged. `registerLicense` is cheap (ej2-base, not the Document
    // Editor chunk) and idempotent-guarded, so it runs alongside the wake
    // rather than waiting for a file to be dropped.
    afterNextRender(() => {
      if (!licenseRegistered) {
        licenseRegistered = true;
        if (SYNCFUSION_LICENSE_KEY) {
          registerLicense(SYNCFUSION_LICENSE_KEY);
        }
      }
      this.wordService.warm();
    });
  }

  protected async open(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) {
      return;
    }

    if (/\.doc$/i.test(file.name)) {
      this.fail(
        'That is a .doc file — the older binary Word format, which browsers cannot read. Open it in Word or LibreOffice and save it as .docx first.',
      );
      return;
    }
    if (!/\.docx$/i.test(file.name)) {
      this.fail('That does not look like a Word document. Choose a .docx file.');
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.fail(`"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`);
      return;
    }

    this.reset();
    this.loading.set(true);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await this.wordService.importDocx(bytes);

    if (!result.ok) {
      this.loading.set(false);
      this.fail(result.failure.message);
      return;
    }

    this.pendingSfdt = result.sfdt;
    this.name.set(file.name);
    this.size.set(file.size);
    this.loading.set(false);
    // `hasDocument()` is now true, which mounts the `@defer` block; the rest
    // of the load continues in onEditorCreated() once it fires `created`.

    // The container was already mounted from a previous document — its
    // `created` event will not fire again, so open this one directly.
    const existing = this.editor();
    if (existing) {
      this.loadPending(existing);
    }
  }

  protected onEditorCreated(): void {
    const container = this.editor();
    if (container) {
      this.loadPending(container);
    }
  }

  private loadPending(container: DocumentEditorContainerComponent): void {
    if (!this.pendingSfdt) {
      return;
    }
    const editor = container.documentEditor;
    editor.isReadOnly = true;
    editor.open(this.pendingSfdt);
    this.pendingSfdt = '';
  }

  protected onDocumentChange(): void {
    const container = this.editor();
    const editor = container?.documentEditor;
    if (!container || !editor) {
      return;
    }
    this.stats.set(measure(selectedText(editor), editor.pageCount));
  }

  protected reset(): void {
    this.name.set('');
    this.size.set(0);
    this.error.set(null);
    this.stats.set(null);
    this.pendingSfdt = '';
  }

  private text(): string {
    const editor = this.editor()?.documentEditor;
    if (!editor) {
      return '';
    }
    return selectedText(editor)
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  protected copyText(): void {
    const text = this.text();
    if (text) {
      void this.clipboard.copy(text, { message: 'Document text copied to clipboard' });
    }
  }

  protected downloadText(): void {
    const text = this.text();
    if (text) {
      downloadText(text, `${this.name().replace(/\.docx$/i, '')}.txt`, 'text/plain');
    }
  }

  protected print(): void {
    this.editor()?.documentEditor?.print();
  }

  protected zoomIn(): void {
    const editor = this.editor()?.documentEditor;
    if (editor) {
      editor.zoomFactor = clampZoom(editor.zoomFactor + 0.1);
    }
  }

  protected zoomOut(): void {
    const editor = this.editor()?.documentEditor;
    if (editor) {
      editor.zoomFactor = clampZoom(editor.zoomFactor - 0.1);
    }
  }

  protected fitWidth(): void {
    this.editor()?.documentEditor?.fitPage('FitPageWidth');
  }

  protected zoomPercent(): number {
    return Math.round((this.editor()?.documentEditor?.zoomFactor ?? 1) * 100);
  }

  private fail(message: string): void {
    this.error.set(message);
    this.name.set('');
    this.stats.set(null);
    this.pendingSfdt = '';
    this.snackBar.open(message, 'Dismiss', { duration: 8000 });
  }
}

/**
 * The document's full plain text, without leaving it looking selected.
 *
 * `selection.text` is the only plain-text view the client API exposes, and it
 * reads whatever is currently selected — so getting the whole document means
 * selecting the whole document first. Left at that, every word of it stays
 * visibly highlighted afterwards, which on a read-only viewer reads as a
 * rendering fault rather than a selection. Collapsing the caret back to the
 * start puts it right, and costs nothing: nobody placed that selection.
 */
function selectedText(editor: DocumentEditorContainerComponent['documentEditor']): string {
  editor.selection.selectAll();
  const text = editor.selection.text;
  editor.selection.moveToDocumentStart();
  return text;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

/**
 * Word, character, paragraph and page counts from the opened document.
 * `pageCount` comes straight from the editor; the rest are read off the full
 * selected text, which is the only plain-text view the client API exposes.
 * Word documents use `\r` between paragraphs internally, which is why it is
 * normalised to `\n` before either count is taken.
 */
function measure(rawText: string, pages: number): DocStats {
  const text = rawText.replace(/\r/g, '\n').trim();
  const words = text === '' ? 0 : text.split(/\s+/).length;
  const paragraphs =
    text === '' ? 0 : text.split(/\n+/).filter((line) => line.trim() !== '').length;
  return { words, characters: text.length, paragraphs, pages: Math.max(pages, 1) };
}
