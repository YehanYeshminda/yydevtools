import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  OnDestroy,
  Signal,
  signal,
  viewChild,
  inject,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { NgIcon } from '@ng-icons/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';

import { ClipboardService } from '../../core/clipboard.service';
import { downloadBlob } from '../../core/download';
import { syncToolState } from '../../core/tool-state';
import { OpenIn } from '../../shared/open-in/open-in';
import { SendTo } from '../../shared/send-to/send-to';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { PdfPreview } from '../../shared/pdf-preview/pdf-preview';
import { Spinner } from '../../shared/spinner/spinner';
import {
  base64ErrorMessage,
  decodedByteLength,
  extForMime,
  formatBytes,
  labelForMime,
  previewKind,
  sniffBase64Mime,
  splitDataUri,
  STANDARD_ENCODING,
} from './base64-codec';
import type { EncodeOptions, PreviewKind } from './base64-codec';
import { binaryDump, DUMP_LIMIT, hexDump, type ByteView } from './byte-view';
import { Base64WorkerClient } from './base64-worker.client';
import { Detection, Issue, detect, firstInvalid, stripInvalid } from './base64-detect';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { TryExample } from '../../shared/try-example/try-example';

type TextMode = 'encode' | 'decode';
/** What the person picked; 'auto' lets the input decide. */
type TextChoice = 'auto' | TextMode;

const NO_DETECTION: Detection = { direction: 'encode', reason: '', mime: '' };

/**
 * "Try an example" input for the Text tab. Deliberately not ASCII-only — the
 * accents, dash and emoji are exactly what trips up naive btoa() calls, so the
 * sample also demonstrates that this tool handles UTF-8 properly.
 */
const SAMPLE_TEXT = 'Café menu — señor, 100% naïve pricing 🚀 (works with UTF-8!)';

/** Largest file we will encode in the browser. Everything is processed on-device. */
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Above this many characters a value stops being rendered in full. A textarea
 * holding millions of characters is what makes this page crawl — layout, undo
 * history and selection all become O(n) on every keystroke.
 */
const INLINE_LIMIT = 20_000;

/** How much of an oversized value the textarea shows instead. */
const PREVIEW_CHARS = 2_000;

/**
 * How much decoded text the preview pane shows. Larger than {@link PREVIEW_CHARS}
 * because this is the whole point of the pane, but still bounded — 20k characters
 * render in a few milliseconds, where a megabyte would not.
 */
const TEXT_PREVIEW_CHARS = 20_000;

/**
 * Below this size a decoded JSON payload is re-indented for the preview. Parsing
 * is O(n) and allocates, so it is not worth doing on a huge document.
 */
const JSON_PRETTY_LIMIT = 512 * 1024;

/**
 * A string that may be far too large to put in the DOM.
 *
 * The full value lives here, in a plain field — deliberately *not* a signal, so
 * nothing can accidentally bind it into a template. Templates only ever see the
 * length, the locked flag, and the short head.
 */
class BulkText {
  private full = '';

  readonly length = signal(0);
  /** True once the value is too large to render, so only {@link head} is shown. */
  readonly locked = signal(false);

  get value(): string {
    return this.full;
  }

  get head(): string {
    return this.full.slice(0, PREVIEW_CHARS);
  }

  /** What the textarea should display for the current value. */
  get display(): string {
    return this.locked() ? this.head : this.full;
  }

  set(text: string): void {
    this.full = text;
    this.length.set(text.length);
    this.locked.set(text.length > INLINE_LIMIT);
  }
}

interface RenderedPreview {
  kind: PreviewKind;
  mime: string;
  bytes: Uint8Array<ArrayBuffer>;
  /** Object URL for the image preview; PDFs are handed to pdf.js as bytes. */
  url: string | null;
  /** Decoded text for the text preview, already truncated for display. */
  text: string | null;
  /** Total characters the decoded text has, before truncation. */
  textLength: number;
  /** True when the text shown was re-indented from JSON. */
  prettyPrinted: boolean;
}

@Component({
  selector: 'app-base64',
  imports: [
    ToolPage,
    Dropzone,
    ToolContent,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    NgIcon,
    MatTabsModule,
    Spinner,
    PdfPreview,
    TryExample,
    ShareLink,
    SendTo,
    OpenIn,
  ],
  templateUrl: './base64.html',
  styleUrls: ['../tool-shell.css', './base64.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Base64Tool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly clipboard = inject(ClipboardService);
  /** All encoding and decoding happens off the main thread. */
  private readonly codec = new Base64WorkerClient();

  protected readonly previewChars = PREVIEW_CHARS;
  protected readonly textPreviewChars = TEXT_PREVIEW_CHARS;
  protected readonly maxFileLabel = formatBytes(MAX_FILE_BYTES);

  // --- Encoding dialect ---------------------------------------------------
  protected readonly urlSafe = signal(false);
  protected readonly noPadding = signal(false);
  protected readonly mime = signal(false);
  protected readonly encodeOptions = computed<EncodeOptions>(() => ({
    urlSafe: this.urlSafe(),
    noPadding: this.noPadding(),
    mime: this.mime(),
  }));
  /** What the result box is called once the dialect is not the plain one. */
  protected readonly encodedLabel = computed(() => {
    const parts = [
      this.urlSafe() ? 'URL-safe' : '',
      this.noPadding() ? 'no padding' : '',
      this.mime() ? '76-column' : '',
    ].filter(Boolean);
    return parts.length ? `Base64 (${parts.join(', ')})` : 'Base64';
  });

  /** Flip one dialect option; both encoders redo their work with it. */
  protected setOption(option: 'urlSafe' | 'noPadding' | 'mime', on: boolean): void {
    this[option].set(on);
    this.scheduleTextConvert();
    const file = this.lastFile;
    if (file) {
      void this.acceptFile(file);
    }
  }

  ngOnDestroy(): void {
    if (this.textTimer !== null) {
      clearTimeout(this.textTimer);
    }
    this.releasePreview();
    this.codec.terminate();
  }

  // --- Encode a file ----------------------------------------------------
  protected readonly fileName = signal('');
  protected readonly fileSize = signal(0);
  protected readonly fileMime = signal('');
  protected readonly encoding = signal(false);
  protected readonly withDataUri = signal(false);

  /** Kept so a change of dialect can encode it again. */
  private lastFile: File | null = null;
  /** The full Base64 payload, held out of the DOM. */
  private encoded = '';
  private encodedCache: { withPrefix: boolean; value: string } | null = null;

  protected readonly encodedLength = signal(0);
  protected readonly encodedHead = signal('');

  protected readonly dataUriPrefix = computed(
    () => `data:${this.fileMime() || 'application/octet-stream'};base64,`,
  );

  /** Only ever a couple of thousand characters — safe to bind. */
  protected readonly encodedDisplay = computed(
    () => (this.withDataUri() ? this.dataUriPrefix() : '') + this.encodedHead(),
  );

  protected readonly encodedTotal = computed(
    () => this.encodedLength() + (this.withDataUri() ? this.dataUriPrefix().length : 0),
  );

  protected readonly encodedTruncated = computed(() => this.encodedLength() > PREVIEW_CHARS);

  /** Single-file tool, so anything past the first dropped file is ignored. */
  protected acceptFiles(files: File[]): void {
    const file = files[0];
    if (file) {
      void this.acceptFile(file);
    }
  }

  private async acceptFile(file: File): Promise<void> {
    if (file.size > MAX_FILE_BYTES) {
      this.showError(`That file is too large. The maximum size is ${this.maxFileLabel}.`);
      return;
    }

    this.lastFile = file;
    this.fileName.set(file.name);
    this.fileSize.set(file.size);
    this.fileMime.set(file.type);
    this.setEncoded('');
    this.encoding.set(true);
    try {
      // The File is handed to the worker as-is, so its bytes never reach the
      // main thread — only the finished string comes back.
      const value = await this.codec.encodeFile(file, this.encodeOptions());
      if (this.lastFile === file) {
        this.setEncoded(value);
      }
    } catch (error) {
      this.showError(base64ErrorMessage(error));
    } finally {
      this.encoding.set(false);
    }
  }

  private setEncoded(value: string): void {
    this.encoded = value;
    this.encodedCache = null;
    this.encodedLength.set(value.length);
    this.encodedHead.set(value.slice(0, PREVIEW_CHARS));
  }

  protected toggleDataUri(checked: boolean): void {
    this.withDataUri.set(checked);
  }

  protected clearEncoded(): void {
    this.lastFile = null;
    this.fileName.set('');
    this.fileSize.set(0);
    this.fileMime.set('');
    this.setEncoded('');
  }

  protected copyEncoded(): void {
    this.copy(this.fullEncoded());
  }

  protected downloadEncoded(): void {
    const value = this.fullEncoded();
    if (value === '') {
      return;
    }
    const name = this.fileName() || 'encoded';
    downloadBlob(new Blob([value], { type: 'text/plain' }), `${name}.base64.txt`);
  }

  /**
   * Build the complete output on demand. Concatenating the data-URI prefix onto
   * a multi-megabyte string is not free, so the result is cached until either
   * the file or the toggle changes.
   */
  private fullEncoded(): string {
    if (this.encoded === '') {
      return '';
    }
    const withPrefix = this.withDataUri();
    if (this.encodedCache?.withPrefix === withPrefix) {
      return this.encodedCache.value;
    }
    const value = withPrefix ? this.dataUriPrefix() + this.encoded : this.encoded;
    this.encodedCache = { withPrefix, value };
    return value;
  }

  // --- Tabs -------------------------------------------------------------
  /** Text first: it is the common case. 1 encodes a file, 2 decodes to one. */
  protected readonly tab = signal(0);

  // --- Decode a file ----------------------------------------------------
  private readonly decodeArea = viewChild<ElementRef<HTMLTextAreaElement>>('decodeArea');

  protected readonly decodeSource = new BulkText();
  protected readonly decodeMime = signal('');
  protected readonly decodeValid = signal(true);
  protected readonly decodeBytes = signal(0);
  protected readonly decodeFileName = signal('decoded.bin');
  protected readonly rendering = signal(false);
  protected readonly preview = signal<RenderedPreview | null>(null);
  /** The input changed after a render, so what's on screen is out of date. */
  protected readonly previewStale = signal(false);

  protected readonly decodeLabel = computed(() => labelForMime(this.decodeMime()));
  protected readonly canRender = computed(
    () => this.decodeSource.length() > 0 && this.decodeValid() && !this.rendering(),
  );

  protected onDecodeInput(event: Event): void {
    this.setDecodeSource((event.target as HTMLTextAreaElement).value);
  }

  /**
   * Intercept large pastes before the browser puts them in the DOM.
   *
   * This is the difference between an instant paste and a multi-second freeze:
   * the string is kept in memory and the textarea only ever shows its head.
   */
  protected onDecodePaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    if (text.length <= INLINE_LIMIT) {
      return; // Small enough — let the browser paste it normally.
    }
    event.preventDefault();
    this.setDecodeSource(text);
    this.write(this.decodeArea, this.decodeSource.display);
  }

  protected onDecodeFileName(event: Event): void {
    this.decodeFileName.set((event.target as HTMLInputElement).value);
  }

  protected clearDecode(): void {
    this.setDecodeSource('');
    this.write(this.decodeArea, '');
    this.releasePreview();
    this.preview.set(null);
    this.previewStale.set(false);
    this.decodeFileName.set('decoded.bin');
  }

  private setDecodeSource(text: string): void {
    this.decodeSource.set(text);

    // Everything below reads at most a few hundred characters, so this stays
    // cheap even when the payload is tens of megabytes.
    const { data, mime } = splitDataUri(text);
    const sniffed = mime || sniffBase64Mime(data);
    this.decodeMime.set(sniffed);
    this.decodeValid.set(data.length === 0 || sniffed !== '');
    this.decodeBytes.set(decodedByteLength(data));
    this.suggestDecodeFileName(sniffed);
    this.previewStale.set(this.preview() !== null);
  }

  /** Decode and show the payload. Never runs on its own — the user asks for it. */
  protected async render(): Promise<void> {
    if (!this.canRender()) {
      return;
    }
    this.rendering.set(true);
    try {
      const { bytes, mime } = await this.codec.decodeBytes(this.decodeSource.value);
      const kind = previewKind(mime);
      this.releasePreview();
      this.preview.set({
        kind,
        mime,
        bytes,
        url: kind === 'image' ? URL.createObjectURL(new Blob([bytes], { type: mime })) : null,
        ...(kind === 'text'
          ? readText(bytes, mime)
          : { text: null, textLength: 0, prettyPrinted: false }),
      });
      this.previewStale.set(false);
      this.suggestDecodeFileName(mime);
    } catch (error) {
      this.showError(base64ErrorMessage(error));
    } finally {
      this.rendering.set(false);
    }
  }

  protected async downloadDecoded(): Promise<void> {
    if (this.decodeSource.length() === 0) {
      return;
    }
    const name = this.decodeFileName().trim() || 'decoded.bin';
    // Reuse what is already on screen when it still matches the input.
    const rendered = this.preview();
    if (rendered && !this.previewStale()) {
      downloadBlob(new Blob([rendered.bytes], { type: rendered.mime }), name);
      return;
    }
    this.rendering.set(true);
    try {
      const { bytes, mime } = await this.codec.decodeBytes(this.decodeSource.value);
      downloadBlob(new Blob([bytes], { type: mime }), name);
    } catch (error) {
      this.showError(base64ErrorMessage(error));
    } finally {
      this.rendering.set(false);
    }
  }

  /** Suggest an extension for the detected type, but never clobber a custom name. */
  private suggestDecodeFileName(mime: string): void {
    const current = this.decodeFileName().trim();
    if (current === '' || /^decoded\.[a-z0-9]+$/i.test(current)) {
      this.decodeFileName.set(`decoded.${extForMime(mime)}`);
    }
  }

  private releasePreview(): void {
    const current = this.preview();
    if (current?.url) {
      URL.revokeObjectURL(current.url);
    }
  }

  // --- Text -------------------------------------------------------------
  private readonly textArea = viewChild<ElementRef<HTMLTextAreaElement>>('textArea');

  // Declared first: the shared-state snapshot below reads it while the class is built.
  protected readonly textSource = new BulkText();
  protected readonly choice = signal<TextChoice>('auto');
  protected readonly detected = signal<Detection>(NO_DETECTION);
  /** How a decoded payload is shown: as text, or as the bytes themselves. */
  protected readonly view = signal<ByteView>('text');
  /** How many bytes the input decoded to when a dump is showing. */
  protected readonly dumpTotal = signal(0);
  protected readonly dumpLimit = DUMP_LIMIT;
  /** The result, when it is small enough to hand to another tool. */
  protected readonly sendable = signal('');
  /** Whatever a "Send to" should carry: the result, or failing that the input. */
  protected readonly sendText = computed(() => {
    const result = this.sendable();
    if (result) {
      return result;
    }
    return this.textSource.locked() || this.textSource.length() === 0 ? '' : this.textSource.value;
  });

  /**
   * The text and the switches travel in the link; a huge paste does not, and
   * the result never does — the recipient's browser recomputes it.
   */
  protected readonly shared = syncToolState({
    key: 'base64-converter',
    snapshot: () => ({
      text: this.textSource.length() > INLINE_LIMIT ? '' : this.textSource.value,
      choice: this.choice(),
      view: this.view(),
      urlSafe: this.urlSafe(),
      noPadding: this.noPadding(),
      mime: this.mime(),
    }),
    restore: (state) => {
      if (state.choice === 'auto' || state.choice === 'encode' || state.choice === 'decode') {
        this.choice.set(state.choice);
      }
      if (state.view === 'text' || state.view === 'hex' || state.view === 'binary') {
        this.view.set(state.view);
      }
      for (const option of ['urlSafe', 'noPadding', 'mime'] as const) {
        if (typeof state[option] === 'boolean') {
          this[option].set(state[option]);
        }
      }
      if (typeof state.text === 'string' && state.text !== '') {
        this.setTextSource(state.text);
        this.write(this.textArea, this.textSource.display);
      }
    },
  });
  /** The direction actually used: the person's pick, or what the input looks like. */
  protected readonly mode = computed<TextMode>(() => {
    const choice = this.choice();
    return choice === 'auto' ? this.detected().direction : choice;
  });
  /** Why auto chose what it chose, for the label beside the switch. */
  protected readonly detectedReason = computed(() =>
    this.choice() === 'auto' && this.textSource.length() > 0 ? this.detected().reason : '',
  );
  /** The first character that stops the input decoding, when decoding. */
  protected readonly issue = signal<Issue | null>(null);
  /** Set when the input decodes to a file rather than text — the result pane says so. */
  protected readonly binaryMime = computed(() =>
    this.mode() === 'decode' && this.detected().mime && previewKind(this.detected().mime) !== 'text'
      ? this.detected().mime
      : '',
  );
  protected readonly binaryLabel = computed(() => labelForMime(this.binaryMime()));
  /** The result pane's label follows the direction and, when decoding, the view. */
  protected readonly resultLabel = computed(() => {
    if (this.mode() === 'encode') {
      return this.encodedLabel();
    }
    const view = this.view();
    return view === 'hex' ? 'Hex dump' : view === 'binary' ? 'Binary' : 'Decoded text';
  });
  protected readonly binaryBytes = computed(() =>
    decodedByteLength(splitDataUri(this.textSource.value).data),
  );
  /** UTF-8 size of the input; only measured while it is small enough to matter. */
  protected readonly inputBytes = signal<number | null>(0);
  protected readonly textBusy = signal(false);
  protected readonly textError = signal('');
  protected readonly textResultLength = signal(0);
  protected readonly textResultHead = signal('');
  protected readonly textResultTruncated = computed(() => this.textResultLength() > PREVIEW_CHARS);

  private textResult = '';
  private textTimer: ReturnType<typeof setTimeout> | null = null;
  private textRun = 0;

  protected onTextInput(event: Event): void {
    this.setTextSource((event.target as HTMLTextAreaElement).value);
  }

  /** Every way the input changes goes through here, so detection never goes stale. */
  private setTextSource(text: string): void {
    this.textSource.set(text);
    this.detected.set(text === '' ? NO_DETECTION : detect(text));
    this.inputBytes.set(this.textSource.locked() ? null : new TextEncoder().encode(text).length);
    this.scheduleTextConvert();
  }

  protected onTextPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    if (text.length <= INLINE_LIMIT) {
      return;
    }
    event.preventDefault();
    this.setTextSource(text);
    this.write(this.textArea, this.textSource.display);
  }

  protected setChoice(choice: TextChoice): void {
    this.choice.set(choice);
    this.scheduleTextConvert();
  }

  protected setView(view: ByteView): void {
    this.view.set(view);
    this.scheduleTextConvert();
  }

  protected clearText(): void {
    this.setTextSource('');
    this.write(this.textArea, '');
  }

  /** Drop the sample sentence into the box — auto mode sees text and encodes it. */
  protected loadExample(): void {
    this.choice.set('auto');
    this.setTextSource(SAMPLE_TEXT);
    this.write(this.textArea, this.textSource.display);
  }

  /** Move the result back into the input and flip the direction — handy for round-tripping. */
  protected swapText(): void {
    if (this.textResult === '') {
      return;
    }
    const next: TextMode = this.mode() === 'encode' ? 'decode' : 'encode';
    this.choice.set(next);
    this.setTextSource(this.textResult);
    this.write(this.textArea, this.textSource.display);
  }

  /** Remove the characters that stop the input decoding, then decode it. */
  protected fixInput(): void {
    this.setTextSource(stripInvalid(this.textSource.value));
    this.write(this.textArea, this.textSource.display);
  }

  /** Hand a payload that decodes to a file over to the tab that can show and save it. */
  protected openInDecodeTab(): void {
    this.setDecodeSource(this.textSource.value);
    this.write(this.decodeArea, this.decodeSource.display);
    this.tab.set(2);
  }

  protected copyTextResult(): void {
    this.copy(this.textResult);
  }

  protected downloadTextResult(): void {
    if (this.textResult === '') {
      return;
    }
    const view = this.view();
    const name =
      this.mode() === 'encode'
        ? 'encoded.base64.txt'
        : view === 'text'
          ? 'decoded.txt'
          : `decoded.${view}.txt`;
    downloadBlob(new Blob([this.textResult], { type: 'text/plain' }), name);
  }

  private scheduleTextConvert(): void {
    if (this.textTimer !== null) {
      clearTimeout(this.textTimer);
    }
    // A short debounce keeps typing smooth; the conversion itself runs in the worker.
    this.textTimer = setTimeout(() => void this.convertText(), 150);
  }

  private async convertText(): Promise<void> {
    const run = ++this.textRun;
    const source = this.textSource.value;
    const decoding = this.mode() === 'decode';
    const view = decoding ? this.view() : 'text';
    this.issue.set(decoding ? firstInvalid(source) : null);
    if (source === '' || this.issue() || (this.binaryMime() && view === 'text')) {
      this.applyTextResult(run, '', '');
      return;
    }
    this.textBusy.set(true);
    try {
      let value: string;
      if (!decoding) {
        value = await this.codec.encodeText(source, this.encodeOptions());
      } else if (view === 'text') {
        value = await this.codec.decodeText(source);
      } else {
        // A dump is a view of the bytes, so it is the bytes that are asked for.
        const { bytes } = await this.codec.decodeBytes(source);
        if (run !== this.textRun) {
          return;
        }
        this.dumpTotal.set(bytes.length);
        value = view === 'hex' ? hexDump(bytes) : binaryDump(bytes);
      }
      this.applyTextResult(run, value, '');
    } catch (error) {
      this.applyTextResult(run, '', base64ErrorMessage(error));
    }
  }

  private applyTextResult(run: number, value: string, error: string): void {
    if (run !== this.textRun) {
      return; // A newer conversion has already started.
    }
    this.textResult = value;
    this.textResultLength.set(value.length);
    this.textResultHead.set(value.slice(0, PREVIEW_CHARS));
    this.sendable.set(value.length <= INLINE_LIMIT ? value : '');
    this.textError.set(error);
    this.textBusy.set(false);
  }

  // --- Shared -----------------------------------------------------------
  protected formatBytes = formatBytes;

  /** Thousands separators for the character counts. */
  protected count(value: number): string {
    return value.toLocaleString('en-US');
  }

  private write(ref: Signal<ElementRef<HTMLTextAreaElement> | undefined>, text: string): void {
    const element = ref()?.nativeElement;
    if (element) {
      element.value = text;
    }
  }

  private copy(text: string): void {
    void this.clipboard.copy(text, {
      errorMessage: 'That value is too large for the clipboard — download it instead.',
    });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, panelClass: 'snack-error' });
  }
}

/**
 * Turn decoded bytes into something the text pane can show: the full text is
 * measured, JSON is re-indented when it is small enough to be worth it, and only
 * the leading {@link TEXT_PREVIEW_CHARS} are handed to the DOM.
 */
function readText(
  bytes: Uint8Array,
  mime: string,
): { text: string; textLength: number; prettyPrinted: boolean } {
  const raw = new TextDecoder().decode(bytes);
  let text = raw;
  let prettyPrinted = false;
  if (mime === 'application/json' && raw.length <= JSON_PRETTY_LIMIT) {
    try {
      text = JSON.stringify(JSON.parse(raw), null, 2);
      prettyPrinted = true;
    } catch {
      // Not actually parseable — show it exactly as it decoded.
    }
  }
  return {
    text: text.slice(0, TEXT_PREVIEW_CHARS),
    textLength: text.length,
    prettyPrinted,
  };
}
