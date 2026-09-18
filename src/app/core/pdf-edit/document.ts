/**
 * A PDF opened for editing rather than for adding to.
 *
 * This is the piece that joins the two halves: pdf-lib holds the object graph
 * and writes the file back out, and the walker beside it says where every run
 * of text sits and which bytes drew it. An edit is recorded against those
 * bytes, and `save` splices them.
 *
 * Nothing is rewritten that was not edited. The content stream a page ends up
 * with is the one it arrived with, minus the ranges that were replaced — which
 * is why a page full of shadings, patterns and inline images survives having
 * one word changed.
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFName,
  PDFNumber,
  PDFPage,
  PDFRawStream,
  PDFRef,
  PDFStream,
  StandardFonts,
  decodePDFRawStream,
} from '@cantoo/pdf-lib';
// `/FlateDecode` means a zlib stream, header and all — not a raw deflate one.
import { zlibSync } from 'fflate';

import { spliceStream, toHexString } from './content-stream';
import {
  readPageFonts,
  notInStandardFonts,
  standardFaceFor,
  type EditableFont,
} from './font-metrics';
import {
  findTextRuns,
  type FormXObject,
  type Matrix,
  type Resolve,
  type TextRun,
} from './text-runs';

/** Something put on a page rather than changed on it. */
interface Placed {
  /** Stable across reorders and deletions, unlike an index. */
  id: string;
  page: number;
  /** Where it starts, in page points with the origin bottom-left. */
  x: number;
  y: number;
}

/** A line of text, in one of the fonts every reader already has. */
export interface AddedText extends Placed {
  kind: 'text';
  text: string;
  size: number;
  color: string;
  bold: boolean;
}

/**
 * A picture, in the two formats a PDF can carry directly.
 *
 * Anything else the browser can decode is turned into a PNG before it gets
 * here, which is the caller's job: this only writes what the format allows.
 */
export interface AddedImage extends Placed {
  kind: 'image';
  bytes: Uint8Array;
  format: 'png' | 'jpeg';
  /** Drawn size in page points. */
  width: number;
  height: number;
}

export type Addition = AddedText | AddedImage;

/** How an edit would have to be written, worked out before it is made. */
export type EditPlan =
  /** The run's own font can say it, so only the string changes. */
  | { kind: 'same-font'; overrun: number }
  /** Its font has no glyph for some of it; the run gets re-set in `face`. */
  | { kind: 'substitute'; overrun: number; missing: string[]; face: string }
  /** Nothing available here can write these characters. */
  | { kind: 'refused'; missing: string[] };

interface PageStreams {
  /** The page's own content, already concatenated. */
  bytes: Uint8Array;
  fonts: Map<string, EditableFont>;
  resolve: Resolve;
}

interface EditableStream {
  bytes: Uint8Array;
  /** Where a font added for this stream has to be declared. */
  resources: () => PDFDict;
  /** Puts the rewritten bytes back where they came from. */
  write(bytes: Uint8Array): void;
}

/** How many changes can be taken back. Deep enough for a session's work. */
const MAX_HISTORY = 100;

/** A run is identified by the stream it lives in and where it starts in it. */
function editKey(streamId: string, start: number): string {
  return `${streamId}@${start}`;
}

interface PendingEdit {
  page: number;
  run: TextRun;
  text: string;
  /** How far the run has been dragged, in page points. */
  dx: number;
  dy: number;
}

/** The six numbers of a matrix, as a content stream writes them. */
function matrixText(m: Matrix): string {
  return m.map(round).join(' ');
}

/**
 * The text matrix that draws a run `dx, dy` page points from where it was.
 *
 * The offset arrives in page space but `Tm` is read in text space, so it has to
 * come back through the CTM. Only the CTM's linear part matters — a
 * translation of the output is a translation of the input mapped by the
 * inverse, and the CTM's own translation cancels.
 */
function shiftedTm(run: TextRun, dx: number, dy: number): Matrix {
  const [a, b, c, d] = run.ctm;
  const det = a * d - b * c;
  // A degenerate CTM draws nothing; leaving the run where it is beats dividing
  // by zero and writing NaN into the page.
  if (!det) return run.tm;
  const tx = (dx * d - dy * c) / det;
  const ty = (dy * a - dx * b) / det;
  return [run.tm[0], run.tm[1], run.tm[2], run.tm[3], run.tm[4] + tx, run.tm[5] + ty];
}

export class EditablePdf {
  private readonly pageStreams = new Map<number, PageStreams>();
  private readonly runsByPage = new Map<number, TextRun[]>();
  private readonly streams = new Map<string, EditableStream>();
  private readonly formFonts = new Map<string, Map<string, EditableFont>>();
  private readonly edits = new Map<string, PendingEdit>();
  private readonly added: Addition[] = [];
  /** Standard 14 faces embedded on demand, one object each however often used. */
  private readonly embedded = new Map<string, PDFFont>();
  /** Pictures embedded on demand, one object each however often drawn. */
  private readonly images = new Map<string, PDFImage>();
  /** Names those fonts and pictures were given inside a stream's resources. */
  private readonly resourceNames = new Map<string, string>();
  /**
   * One entry per change, holding the state it replaced.
   *
   * A whole-state snapshot rather than an inverse operation per mutation:
   * nothing here is large — the edits are strings and the additions are a
   * handful of records whose image bytes are shared, not copied — and a
   * snapshot cannot disagree with the operation it is supposed to undo.
   */
  private readonly history: Array<{ edits: Map<string, PendingEdit>; added: Addition[] }> = [];
  /** Streams a save has already rewritten, so a later one can undo the writing. */
  private readonly written = new Set<string>();
  /** True while a drag is open, so the whole drag is one step in the history. */
  private gesture = false;

  private constructor(
    private readonly doc: PDFDocument,
    private readonly pages: PDFPage[],
  ) {}

  static async open(bytes: Uint8Array): Promise<EditablePdf> {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
    return new EditablePdf(doc, doc.getPages());
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /** Unrotated size in points, matching the frame the runs are measured in. */
  pageSize(index: number): { width: number; height: number } {
    const { width, height } = this.pages[index].getSize();
    return { width, height };
  }

  /** Every editable run on a page, measured once and kept. */
  runs(index: number): TextRun[] {
    const cached = this.runsByPage.get(index);
    if (cached) return cached;
    const streams = this.openPage(index);
    const runs = findTextRuns(streams.bytes, streams.fonts, {
      resolve: streams.resolve,
      streamId: `page:${index}`,
    });
    this.runsByPage.set(index, runs);
    return runs;
  }

  /** The text a run currently says, counting an edit that is not yet saved. */
  textOf(run: TextRun): string {
    return this.edits.get(editKey(run.streamId, run.start))?.text ?? run.text;
  }

  edited(run: TextRun): boolean {
    return this.edits.has(editKey(run.streamId, run.start));
  }

  get changeCount(): number {
    return this.edits.size + this.added.length;
  }

  /**
   * How the edit would have to be written, and what it would cost.
   *
   * Asked before the edit rather than after, because the answer is something
   * the reader needs to decide about: almost every font in a real document is
   * subsetted down to the characters that document happens to use, so a
   * perfectly ordinary change from "2044" to "9137" can find that the file
   * contains no 9, no 3 and no 7. Drawing them in that font would leave gaps.
   */
  plan(pageIndex: number, run: TextRun, text: string): EditPlan {
    const font = this.fontOf(pageIndex, run);
    const missing = font ? font.missing(text) : [...new Set(text)];
    if (missing.length === 0 && font) {
      return { kind: 'same-font', overrun: this.overrunOf(run, this.advanceOf(font, run, text)) };
    }
    const unwritable = notInStandardFonts(text);
    if (unwritable.length > 0) return { kind: 'refused', missing: unwritable };
    const face = standardFaceFor(run.family || run.font);
    return {
      kind: 'substitute',
      missing,
      face,
      overrun: this.overrunOf(run, this.standardAdvanceOf(face, run, text)),
    };
  }

  /**
   * Records a run's new text. An empty string takes it off the page.
   *
   * Nothing is written here — the operator that replaces the run is built in
   * `save`, which is where a substitute font can be embedded.
   */
  setText(pageIndex: number, run: TextRun, text: string): void {
    const key = editKey(run.streamId, run.start);
    const previous = this.edits.get(key);
    const moved = previous ? previous.dx !== 0 || previous.dy !== 0 : false;
    // Putting the original words back is only a no-op if the run has not also
    // been dragged; otherwise the move is still a pending change.
    if (text === run.text && !moved) {
      if (!previous) return;
      this.remember();
      this.edits.delete(key);
      return;
    }
    if (text !== '' && this.plan(pageIndex, run, text).kind === 'refused') {
      throw new Error('That text cannot be written into this document.');
    }
    this.remember();
    this.edits.set(key, {
      page: pageIndex,
      run,
      text,
      dx: previous?.dx ?? 0,
      dy: previous?.dy ?? 0,
    });
  }

  /**
   * Moves a run to `dx, dy` page points from where the file drew it.
   *
   * The offset is absolute rather than cumulative, so a drag can call this on
   * every pointer move without the run running away.
   */
  moveText(pageIndex: number, run: TextRun, dx: number, dy: number): void {
    const key = editKey(run.streamId, run.start);
    const previous = this.edits.get(key);
    if (dx === 0 && dy === 0 && previous && previous.text === run.text) {
      this.remember();
      this.edits.delete(key);
      return;
    }
    this.remember();
    this.edits.set(key, {
      page: pageIndex,
      run,
      text: previous?.text ?? run.text,
      dx,
      dy,
    });
  }

  /** How far a run has been dragged, for the caller to draw it there. */
  offsetOf(run: TextRun): { dx: number; dy: number } {
    const edit = this.edits.get(editKey(run.streamId, run.start));
    return { dx: edit?.dx ?? 0, dy: edit?.dy ?? 0 };
  }

  /** Puts something new on a page. */
  add(item: Addition): void {
    this.remember();
    this.added.push(item);
  }

  /** Changes one of them in place — its wording, size, colour or position. */
  update(
    id: string,
    patch: Partial<Omit<AddedText, 'kind' | 'id'>> & Partial<Omit<AddedImage, 'kind' | 'id'>>,
  ): void {
    const item = this.added.find((candidate) => candidate.id === id);
    if (!item) return;
    this.remember();
    Object.assign(item, patch);
  }

  remove(id: string): void {
    const at = this.added.findIndex((candidate) => candidate.id === id);
    if (at < 0) return;
    this.remember();
    this.added.splice(at, 1);
  }

  get additions(): readonly Addition[] {
    return this.added;
  }

  // --- Taking a change back ------------------------------------------------

  /**
   * Records the state a change is about to replace.
   *
   * The additions are copied one level deep, because `update` writes through
   * the object it finds; the image bytes inside them are shared on purpose,
   * since nothing ever mutates those.
   */
  private remember(): void {
    if (this.gesture) return;
    this.history.push({
      edits: new Map(this.edits),
      added: this.added.map((item) => ({ ...item })),
    });
    if (this.history.length > MAX_HISTORY) this.history.shift();
  }

  /**
   * Groups everything until `endGesture` into one undo step.
   *
   * A drag calls a mutator on every pointer move. Without this, undoing a
   * picture dragged across the page would take it back one pixel at a time.
   */
  beginGesture(): void {
    this.remember();
    this.gesture = true;
  }

  endGesture(): void {
    this.gesture = false;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  /** Puts the document back as it was before the last change. */
  undo(): void {
    const previous = this.history.pop();
    if (!previous) return;
    this.edits.clear();
    for (const [key, edit] of previous.edits) this.edits.set(key, edit);
    this.added.length = 0;
    this.added.push(...previous.added);
  }

  /**
   * Drops every pending change, and the history with it.
   *
   * ponytail: deliberately not undoable. Making it so would mean holding on to
   * the object URLs the caller releases when it reverts; the one button that
   * says it throws everything away can be the one that means it.
   */
  reset(): void {
    this.edits.clear();
    this.added.length = 0;
    this.history.length = 0;
  }

  async save(): Promise<Uint8Array> {
    const byStream = new Map<string, Array<{ start: number; end: number; text: string }>>();
    for (const edit of this.edits.values()) {
      const operator = await this.operatorFor(edit);
      const list = byStream.get(edit.run.streamId) ?? [];
      list.push({ start: edit.run.start, end: edit.run.end, text: operator });
      byStream.set(edit.run.streamId, list);
    }
    // Added lines are content too, so they go through the same door. A page
    // that gains one still has its content rewritten from the bytes it arrived
    // with, which is what makes saving twice give the same file as saving once.
    const suffixes = new Map<string, string>();
    for (const item of this.added) {
      const streamId = `page:${item.page}`;
      if (!byStream.has(streamId)) {
        this.openPage(item.page);
        byStream.set(streamId, []);
      }
      const drawn = item.kind === 'text' ? await this.drawnText(item) : await this.drawnImage(item);
      suffixes.set(streamId, (suffixes.get(streamId) ?? '') + drawn);
    }

    // A stream an earlier save rewrote has to be rewritten again even when
    // nothing touches it now, because "nothing to write" would otherwise leave
    // the previous save's content in place — and a line taken back after the
    // preview had already saved once would survive into the download.
    for (const streamId of this.written) {
      if (!byStream.has(streamId)) byStream.set(streamId, []);
    }

    await this.dropUnusedImages();

    // Splicing comes last: every offset above was taken before anything moved.
    for (const [streamId, list] of byStream) {
      const stream = this.streams.get(streamId);
      if (!stream) continue;
      const spliced = spliceStream(stream.bytes, list);
      const suffix = suffixes.get(streamId);
      stream.write(suffix ? wrapAndAppend(spliced, suffix) : spliced);
      this.written.add(streamId);
    }

    return this.doc.save({ useObjectStreams: false });
  }

  // --- Writing a replacement ---------------------------------------------

  /**
   * The operator that replaces a run.
   *
   * Always a `TJ` array, whatever the original operator was, with a kerning
   * number after the string that puts the pen exactly where the old run left
   * it. Without that correction a replacement of a different width would drag
   * everything after it along the line — producers that lean on the pen
   * position rather than setting a fresh matrix for each word are common enough
   * that this is not a theoretical worry. Overlapping the next word is visible
   * and the reader can shorten the text; silently reflowing half a line is not.
   */
  private async operatorFor(edit: PendingEdit): Promise<string> {
    const { run } = edit;
    const lead = run.opText === "'" || run.opText === '"' ? newlinePrefix(run) : '';
    const show = await this.showFor(edit);
    if (!edit.dx && !edit.dy) return `${lead}${show}`;
    // Placed by its own matrix instead of by the pen, then the matrix the rest
    // of the text object was written against is put back — so a moved run
    // takes nothing with it, however many shows follow it on the same line.
    // The lead stays in front: `'` and `"` also move the *line* matrix, which
    // a `Tm` does not, and a later newline still has to land correctly.
    return (
      `${lead}${matrixText(shiftedTm(run, edit.dx, edit.dy))} Tm ${show} ` +
      `${matrixText(run.tmAfter)} Tm`
    );
  }

  /** The show operator itself, without anything that repositions it. */
  private async showFor(edit: PendingEdit): Promise<string> {
    const { run, text } = edit;
    if (text === '') return `[${this.kerning(run, 0)}] TJ`;

    const font = this.fontOf(edit.page, run);
    const native = font?.encode(text);
    if (font && native) {
      const body = `${toHexString(native)} ${this.kerning(run, this.advanceOf(font, run, text))}`;
      return `[${body}] TJ`;
    }

    // The run's own font cannot say it, so it is re-set in a face that can. The
    // original `Tf` goes back straight afterwards, so nothing drawn later in
    // the same text object inherits the substitute.
    const face = standardFaceFor(run.family || run.font);
    const embedded = await this.embedStandard(face);
    const name = this.nameFor(run.streamId, 'Font', face, embedded.ref);
    const hex = embedded.encodeText(text).toString();
    const kern = this.kerning(run, this.standardAdvanceOf(face, run, text));
    const size = round(run.fontSize);
    return `/${name} ${size} Tf [${hex} ${kern}] TJ /${run.font} ${size} Tf`;
  }

  /** A line the reader added, as the operators that draw it. */
  private async drawnText(item: AddedText): Promise<string> {
    const face = item.bold ? 'Helvetica-Bold' : 'Helvetica';
    const font = await this.embedStandard(face);
    const name = this.nameFor(`page:${item.page}`, 'Font', face, font.ref);
    const [r, g, b] = hexToRgb(item.color);
    const hex = font.encodeText(item.text).toString();
    return (
      `q BT /${name} ${round(item.size)} Tf ${round(r)} ${round(g)} ${round(b)} rg ` +
      `1 0 0 1 ${round(item.x)} ${round(item.y)} Tm ${hex} Tj ET Q\n`
    );
  }

  /**
   * Takes a picture nothing draws any more back out of the document.
   *
   * Removing an addition only stops it being drawn; pdf-lib writes every
   * object registered with it, so without this the bytes of a picture you
   * placed and then thought better of would still travel in the file you send.
   *
   * `embed()` before `delete` on purpose: until an image has been embedded
   * pdf-lib still holds it pending, and its own flush would put it back into
   * the context on the way out — deleting the object first achieves nothing.
   */
  private async dropUnusedImages(): Promise<void> {
    const drawn = new Set(
      this.added.filter((item) => item.kind === 'image').map((item) => item.id),
    );
    for (const [id, image] of this.images) {
      if (drawn.has(id)) continue;
      this.images.delete(id);
      await image.embed();
      this.doc.context.delete(image.ref);
      // And the name it was declared under, or the page keeps a reference to
      // an object that is no longer there.
      const suffix = `|XObject|image:${id}`;
      for (const [cacheKey, name] of this.resourceNames) {
        if (!cacheKey.endsWith(suffix)) continue;
        const streamId = cacheKey.slice(0, cacheKey.indexOf('|'));
        this.streams
          .get(streamId)
          ?.resources()
          .lookupMaybe(PDFName.of('XObject'), PDFDict)
          ?.delete(PDFName.of(name));
        this.resourceNames.delete(cacheKey);
      }
    }
  }

  /** A picture the reader added, as the operators that draw it. */
  private async drawnImage(item: AddedImage): Promise<string> {
    let embedded = this.images.get(item.id);
    if (!embedded) {
      // The bytes are handed over as a copy: pdf-lib keeps what it is given,
      // and the caller still needs its own for the preview in the page.
      embedded =
        item.format === 'png'
          ? await this.doc.embedPng(item.bytes.slice())
          : await this.doc.embedJpg(item.bytes.slice());
      this.images.set(item.id, embedded);
    }
    const name = this.nameFor(`page:${item.page}`, 'XObject', `image:${item.id}`, embedded.ref);
    // `cm` scales the unit square the image is drawn into, so the matrix is the
    // size and the position at once.
    return (
      `q ${round(item.width)} 0 0 ${round(item.height)} ` +
      `${round(item.x)} ${round(item.y)} cm /${name} Do Q\n`
    );
  }

  /**
   * The number that makes the pen land where the original run ended.
   *
   * A number inside `TJ` moves the pen by `-n/1000` of the font size, after the
   * horizontal scale — so this is that relation turned around.
   */
  private kerning(run: TextRun, newAdvance: number): string {
    const scale = Math.hypot(run.matrix[0], run.matrix[1]) || 1;
    const original = run.width / scale;
    const divisor = (run.fontSize || 1) * (run.horizontal || 1);
    return round(((newAdvance - original) * 1000) / divisor);
  }

  /** How far `text` would advance in the run's own font, in text space. */
  private advanceOf(font: EditableFont, run: TextRun, text: string): number {
    const codes = font.encode(text);
    if (!codes) return run.width / (Math.hypot(run.matrix[0], run.matrix[1]) || 1);
    let advance = 0;
    for (const code of font.decode(codes)) {
      const spacing = run.charSpacing + (font.isWordSpace(code) ? run.wordSpacing : 0);
      advance += ((font.widthOf(code) / 1000) * run.fontSize + spacing) * run.horizontal;
    }
    return advance;
  }

  /** The same, for a Standard 14 face standing in for the run's own font. */
  private standardAdvanceOf(face: string, run: TextRun, text: string): number {
    const embedded = this.embedded.get(face);
    // Nothing is embedded until a save needs it, and the only caller that gets
    // here before then is `plan`, whose overrun is an estimate either way.
    if (!embedded) return text.length * 0.5 * run.fontSize * run.horizontal;
    const glyphs = embedded.widthOfTextAtSize(text, run.fontSize);
    return (glyphs + text.length * run.charSpacing) * run.horizontal;
  }

  /** How much wider the replacement is than what it replaces, in page points. */
  private overrunOf(run: TextRun, advance: number): number {
    return advance * (Math.hypot(run.matrix[0], run.matrix[1]) || 1) - run.width;
  }

  private async embedStandard(face: string): Promise<PDFFont> {
    const existing = this.embedded.get(face);
    if (existing) return existing;
    const font = await this.doc.embedFont(face as StandardFonts);
    this.embedded.set(face, font);
    return font;
  }

  /**
   * Declares a font or an image in the resources of the stream that needs it,
   * under a name nothing else there is using.
   */
  private nameFor(
    streamId: string,
    category: 'Font' | 'XObject',
    key: string,
    ref: PDFRef,
  ): string {
    const cacheKey = `${streamId}|${category}|${key}`;
    const known = this.resourceNames.get(cacheKey);
    if (known) return known;

    const resources = this.streams.get(streamId)?.resources();
    if (!resources) throw new Error('This page has nowhere to declare a resource.');
    let holder = resources.lookupMaybe(PDFName.of(category), PDFDict);
    if (!holder) {
      holder = this.doc.context.obj({}) as PDFDict;
      resources.set(PDFName.of(category), holder);
    }
    let name = `YY${key.replace(/[^A-Za-z0-9]/g, '')}`;
    for (let suffix = 1; holder.has(PDFName.of(name)); suffix++) name = `YY${category}${suffix}`;
    holder.set(PDFName.of(name), ref);
    this.resourceNames.set(cacheKey, name);
    return name;
  }

  // --- Opening ------------------------------------------------------------

  /** The font a run was drawn in, looked up in the stream it belongs to. */
  private fontOf(pageIndex: number, run: TextRun): EditableFont | null {
    const streams = this.openPage(pageIndex);
    if (run.streamId === `page:${pageIndex}`) return streams.fonts.get(run.font) ?? null;
    return this.formFonts.get(run.streamId)?.get(run.font) ?? null;
  }

  /**
   * Opens a page's content and everything it draws, once.
   *
   * Form XObjects are copied before they are opened for editing, and this
   * page's resource entry is pointed at the copy. An XObject is shared by
   * reference — a header drawn on forty pages is one object — and editing the
   * original would change all forty. The copy costs a few kilobytes and is the
   * only way the promise "this page" can be kept.
   */
  private openPage(index: number): PageStreams {
    const cached = this.pageStreams.get(index);
    if (cached) return cached;
    const page = this.pages[index];
    const bytes = concatContents(this.doc, page);
    this.streams.set(`page:${index}`, {
      bytes,
      resources: () => this.pageResources(page),
      write: (next) => page.node.set(PDFName.of('Contents'), this.newStream(next)),
    });

    const resources = page.node.Resources();
    const streams: PageStreams = {
      bytes,
      fonts: readPageFonts(resources),
      resolve: this.resolverFor(resources, `page:${index}/`, 0),
    };
    this.pageStreams.set(index, streams);
    return streams;
  }

  /** The page's own resource dictionary, created if it inherited one instead. */
  private pageResources(page: PDFPage): PDFDict {
    const own = page.node.get(PDFName.of('Resources'));
    const resolved = own ? this.doc.context.lookupMaybe(own, PDFDict) : undefined;
    if (resolved) return resolved;
    const fresh = this.doc.context.obj({}) as PDFDict;
    page.node.set(PDFName.of('Resources'), fresh);
    return fresh;
  }

  private resolverFor(resources: PDFDict | undefined, prefix: string, depth: number): Resolve {
    return (name: string): FormXObject | null => {
      if (depth > 8) return null;
      const xobjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
      if (!xobjects) return null;
      const key = PDFName.of(name);
      const stream = xobjects.lookupMaybe(key, PDFStream);
      if (!stream) return null;
      if (stream.dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString() !== '/Form') {
        return null;
      }

      const id = `${prefix}${name}`;
      let bytes: Uint8Array;
      try {
        bytes = readStream(stream);
      } catch {
        return null;
      }

      const own = stream.dict.lookupMaybe(PDFName.of('Resources'), PDFDict) ?? resources;
      if (!this.streams.has(id)) {
        // The copy is made on the first thing that would change the original,
        // and reused by whatever comes after it.
        const copy: { dict: PDFDict | null } = { dict: null };
        const dictOf = (): PDFDict => (copy.dict ??= stream.dict.clone(this.doc.context));
        this.streams.set(id, {
          bytes,
          resources: () => {
            const dict = dictOf();
            const held = dict.lookupMaybe(PDFName.of('Resources'), PDFDict);
            if (held) return held;
            const fresh = this.doc.context.obj({}) as PDFDict;
            dict.set(PDFName.of('Resources'), fresh);
            return fresh;
          },
          write: (next) => xobjects.set(key, this.rewriteForm(dictOf(), next)),
        });
      }

      if (!this.formFonts.has(id)) this.formFonts.set(id, readPageFonts(own));

      return {
        id,
        bytes,
        fonts: this.formFonts.get(id)!,
        matrix: readMatrix(stream.dict),
        resolve: this.resolverFor(own, `${id}/`, depth + 1),
      };
    };
  }

  /** A fresh compressed stream holding `bytes`. */
  private newStream(bytes: Uint8Array): PDFRef {
    const stream = this.doc.context.stream(zlibSync(bytes), {
      Filter: PDFName.of('FlateDecode'),
    });
    return this.doc.context.register(stream);
  }

  /** The form XObject again, with new contents and everything else kept. */
  private rewriteForm(dict: PDFDict, bytes: Uint8Array): PDFRef {
    const compressed = zlibSync(bytes);
    dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
    dict.delete(PDFName.of('DecodeParms'));
    dict.set(PDFName.of('Length'), PDFNumber.of(compressed.length));
    return this.doc.context.register(PDFRawStream.of(dict, compressed));
  }
}

/**
 * The page's own content inside `q`/`Q`, with `suffix` after it.
 *
 * The wrapping is what makes the appended operators safe: a page that leaves
 * its transformation matrix somewhere else — scaled to a tenth, flipped, or
 * simply unbalanced — would otherwise draw the new line wherever that matrix
 * happened to put it, rather than where the reader clicked.
 */
function wrapAndAppend(content: Uint8Array, suffix: string): Uint8Array {
  const head = Uint8Array.from('q\n', (char) => char.charCodeAt(0));
  const tail = Uint8Array.from(`\nQ\n${suffix}`, (char) => char.charCodeAt(0));
  const out = new Uint8Array(head.length + content.length + tail.length);
  out.set(head, 0);
  out.set(content, head.length);
  out.set(tail, head.length + content.length);
  return out;
}

/** Keeps the line move that `'` and `"` do before they show anything. */
function newlinePrefix(run: TextRun): string {
  return run.opText === '"'
    ? `${round(run.wordSpacing)} Tw ${round(run.charSpacing)} Tc T* `
    : 'T* ';
}

function round(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [0, 0, 0];
  const value = Number.parseInt(match[1], 16);
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}

function readStream(stream: PDFStream): Uint8Array {
  return stream instanceof PDFRawStream
    ? decodePDFRawStream(stream).decode()
    : stream.getContents();
}

/** A form's `/Matrix`, or the identity when it has none. */
function readMatrix(dict: PDFDict): Matrix {
  const array = dict.lookupMaybe(PDFName.of('Matrix'), PDFArray);
  if (!array || array.size() !== 6) return [1, 0, 0, 1, 0, 0];
  const values: number[] = [];
  for (let at = 0; at < 6; at++) {
    const value = array.lookup(at);
    values.push(value instanceof PDFNumber ? value.asNumber() : 0);
  }
  return values as unknown as Matrix;
}

/**
 * A page's content as one buffer.
 *
 * `/Contents` may be an array, and the spec allows a token to be split across
 * the boundary between two of them, so they are joined with a newline and
 * treated as the single stream they logically are. Saving writes one stream
 * back, which is legal and simpler than keeping the original division.
 */
function concatContents(doc: PDFDocument, page: PDFPage): Uint8Array {
  const contents = page.node.Contents();
  const streams = (
    contents instanceof PDFArray
      ? contents.asArray().map((ref) => doc.context.lookup(ref))
      : [contents]
  ).filter((stream): stream is PDFStream => stream instanceof PDFStream);

  const parts: Uint8Array[] = [];
  for (const stream of streams) {
    try {
      parts.push(readStream(stream));
    } catch {
      continue;
    }
    parts.push(Uint8Array.of(0x0a));
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export type { TextRun } from './text-runs';
