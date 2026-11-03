import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { downloadBytes } from '../../core/download';
import { PdfDocumentRenderer } from '../../core/pdf-render';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import {
  ADDABLE_KINDS,
  DEFAULT_SETTINGS,
  FONT_PAIRING_IDS,
  SECTION_KINDS,
  emptyResume,
  fileStem,
  isEmptyResume,
  moveSection,
  newId,
  newSection,
  paperForLocale,
  parseResumeFile,
  printableText,
  toFile,
  type Density,
  type FontPairingId,
  type Paper,
  type Resume,
  type ResumeBasics,
  type ResumeSection,
  type ResumeSettings,
  type SectionKind,
  type TemplateId,
} from './resume';
import { FONT_PAIRINGS, TEMPLATES, missingGlyphs, sideKinds, templateInfo } from './resume-layout';
import { SectionEditor } from './section-editor';

/** Where the resume is kept between visits. */
export const STORAGE_KEY = 'yy-resume-builder:v1';

/** Wait this long after the last keystroke before redrawing the preview. */
const PREVIEW_DEBOUNCE_MS = 300;
/** Thumbnails are six documents, so they wait for a real pause in typing. */
const THUMB_DEBOUNCE_MS = 1200;
/** Pixels per point for the preview: crisp on a 2x screen at full column width. */
const PREVIEW_SCALE = 2;
const SAVE_DEBOUNCE_MS = 400;

/** The swatches offered for the accent. All pass 4.5:1 as text on white. */
export const ACCENTS = [
  { name: 'Navy', value: '#1f4e79' },
  { name: 'Teal', value: '#0f766e' },
  { name: 'Forest', value: '#2f6b3c' },
  { name: 'Plum', value: '#6b3fa0' },
  { name: 'Burgundy', value: '#9b2c3c' },
  { name: 'Rust', value: '#b4450f' },
  { name: 'Slate', value: '#334155' },
  { name: 'Black', value: '#1a1a1a' },
] as const;

interface PreviewPage {
  url: string;
  width: number;
  height: number;
}

interface Undo {
  message: string;
  resume: Resume;
  settings: ResumeSettings;
}

@Component({
  selector: 'app-resume-builder',
  imports: [ToolPage, ToolContent, Spinner, MatButtonModule, NgIcon, SectionEditor],
  templateUrl: './resume-builder.html',
  styleUrls: ['../tool-shell.css', './resume-builder.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResumeBuilderTool {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly injector = inject(Injector);

  protected readonly templates = TEMPLATES;
  protected readonly accents = ACCENTS;
  protected readonly pairings = FONT_PAIRING_IDS.map((id) => FONT_PAIRINGS[id]);
  protected readonly densities: readonly { id: Density; label: string }[] = [
    { id: 'compact', label: 'Compact' },
    { id: 'normal', label: 'Normal' },
    { id: 'relaxed', label: 'Relaxed' },
  ];
  protected readonly papers: readonly { id: Paper; label: string }[] = [
    { id: 'a4', label: 'A4' },
    { id: 'letter', label: 'US Letter' },
  ];
  protected readonly addable = ADDABLE_KINDS.map((kind) => ({
    kind,
    label: kind === 'custom' ? 'Custom section' : SECTION_KINDS[kind].title,
  }));

  protected readonly resume = signal<Resume>(emptyResume());
  protected readonly settings = signal<ResumeSettings>(DEFAULT_SETTINGS);

  /** False until the saved resume has been read, so nothing overwrites it first. */
  private readonly restored = signal(false);
  protected readonly saveState = signal<'idle' | 'saved' | 'failed'>('idle');

  protected readonly mode = signal<'edit' | 'preview'>('edit');
  protected readonly addKind = signal<SectionKind>('projects');

  protected readonly pages = signal<PreviewPage[]>([]);
  protected readonly previewBusy = signal(false);
  protected readonly lastPageFill = signal(1);
  protected readonly thumbs = signal<Partial<Record<TemplateId, string>>>({});

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly undo = signal<Undo | null>(null);
  protected readonly announcement = signal('');

  protected readonly basics = computed(() => this.resume().basics);
  protected readonly sections = computed(() => this.resume().sections);
  protected readonly empty = computed(() => isEmptyResume(this.resume()));
  protected readonly template = computed(() => templateInfo(this.settings().template));
  protected readonly photo = computed(() => this.resume().basics.photo);
  private readonly roundPhoto = signal('');

  protected readonly pairingLabel = computed(() => FONT_PAIRINGS[this.settings().fonts].label);

  /** Characters the chosen fonts cannot draw, which would vanish from the PDF. */
  protected readonly missing = computed(() =>
    missingGlyphs(printableText(this.resume()), this.settings().fonts).join(' '),
  );

  protected readonly customAccent = computed(
    () => !ACCENTS.some((accent) => accent.value === this.settings().accent),
  );

  protected readonly photoNote = computed(() => {
    if (!this.photo()) {
      return '';
    }
    if (!this.template().photo) {
      return `${this.template().name} has no place for a photo, so it is left off. Sidebar, Split, Compact and Spotlight show one.`;
    }
    return this.settings().showPhoto ? '' : 'The photo is saved but turned off.';
  });

  /** Everything the PDF depends on, in one value, so a change is one signal. */
  private readonly input = computed(() => ({
    resume: this.resume(),
    settings: this.settings(),
    roundPhoto: this.roundPhoto(),
  }));

  private previewToken = 0;
  private thumbToken = 0;
  /** The bytes behind the current preview, reused by Download when nothing changed. */
  private lastPdf: { input: unknown; bytes: Uint8Array } | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.releasePages(this.pages()));

    // Read the saved resume once the page is live. Never in the constructor:
    // this page is prerendered, and anything read here would be baked into
    // the static HTML that every visitor is sent.
    afterNextRender(() => {
      this.restore();
      // The save below waits for a pause in typing; closing the tab inside
      // that pause would lose the last change, so leaving saves at once.
      const flush = () => this.save(toFile(this.resume(), this.settings()));
      window.addEventListener('pagehide', flush);
      destroyRef.onDestroy(() => window.removeEventListener('pagehide', flush));
    });

    // Save, a beat after the last change.
    effect((onCleanup) => {
      const file = toFile(this.resume(), this.settings());
      if (!this.isBrowser || !untracked(this.restored)) {
        return;
      }
      const timer = setTimeout(() => this.save(file), SAVE_DEBOUNCE_MS);
      onCleanup(() => clearTimeout(timer));
    });

    // The round photo is cut once per photo, not once per keystroke.
    effect(() => {
      const photo = this.photo();
      if (!this.isBrowser) {
        return;
      }
      if (!photo) {
        this.roundPhoto.set('');
        return;
      }
      void import('./resume-pdf')
        .then(({ roundPhoto }) => roundPhoto(photo))
        .then((round) => {
          if (this.photo() === photo) {
            this.roundPhoto.set(round);
          }
        })
        .catch(() => this.error.set('That photo could not be read. Try a JPEG or PNG.'));
    });

    effect((onCleanup) => {
      const input = this.input();
      if (!this.isBrowser || !this.restored()) {
        return;
      }
      const timer = setTimeout(() => void this.renderPreview(input), PREVIEW_DEBOUNCE_MS);
      onCleanup(() => clearTimeout(timer));
    });

    // Thumbnails show every design with this content, so they follow the
    // content, the accent and the photo, but not the chosen template or font.
    const thumbInput = computed(
      () => {
        const { resume, settings, roundPhoto } = this.input();
        return { resume, accent: settings.accent, density: settings.density, paper: settings.paper, showPhoto: settings.showPhoto, roundPhoto };
      },
      { equal: (a, b) => a.resume === b.resume && a.accent === b.accent && a.density === b.density && a.paper === b.paper && a.showPhoto === b.showPhoto && a.roundPhoto === b.roundPhoto },
    );
    effect((onCleanup) => {
      const input = thumbInput();
      if (!this.isBrowser || !this.restored()) {
        return;
      }
      const timer = setTimeout(() => void this.renderThumbs(input), THUMB_DEBOUNCE_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  // --- Saving ---------------------------------------------------------------------

  private restore(): void {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage blocked (a private window in some browsers): start empty.
    }
    const parsed = saved ? parseResumeFile(saved) : null;
    if (parsed?.ok) {
      this.resume.set(parsed.resume);
      this.settings.set(parsed.settings);
    } else {
      this.settings.update((settings) => ({ ...settings, paper: paperForLocale(navigator.language) }));
    }
    this.restored.set(true);
  }

  private save(file: ReturnType<typeof toFile>): void {
    try {
      if (isEmptyResume(file.resume)) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
      }
      this.saveState.set('saved');
    } catch {
      this.saveState.set('failed');
    }
  }

  // --- Undo and the live region ------------------------------------------------------

  private remember(message: string): void {
    this.undo.set({ message, resume: this.resume(), settings: this.settings() });
  }

  protected undoLast(): void {
    const last = this.undo();
    if (!last) {
      return;
    }
    this.resume.set(last.resume);
    this.settings.set(last.settings);
    this.undo.set(null);
    this.say('Undone.');
  }

  protected say(message: string): void {
    // Cleared first, so saying the same thing twice is still read out.
    this.announcement.set('');
    setTimeout(() => this.announcement.set(message), 50);
  }

  // --- Starting points ---------------------------------------------------------------

  protected async loadExample(): Promise<void> {
    const { exampleResume } = await import('./resume-example');
    if (!this.empty()) {
      this.remember('The example replaced your resume.');
    }
    this.resume.set(exampleResume());
    this.say('Example resume loaded.');
  }

  protected startOver(): void {
    this.remember('Started over with an empty resume.');
    this.resume.set(emptyResume());
    this.settings.update((settings) => ({ ...DEFAULT_SETTINGS, paper: settings.paper }));
    this.say('Started over. Everything was cleared.');
  }

  // --- Design ------------------------------------------------------------------------

  protected chooseTemplate(id: TemplateId): void {
    // Each design was drawn with a pairing; picking it brings that along.
    this.settings.update((settings) => ({ ...settings, template: id, fonts: templateInfo(id).fonts }));
  }

  protected setAccent(value: string): void {
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      this.settings.update((settings) => ({ ...settings, accent: value.toLowerCase() }));
    }
  }

  protected setFonts(value: string): void {
    if ((FONT_PAIRING_IDS as readonly string[]).includes(value)) {
      this.settings.update((settings) => ({ ...settings, fonts: value as FontPairingId }));
    }
  }

  protected setDensity(density: Density): void {
    this.settings.update((settings) => ({ ...settings, density }));
  }

  protected setPaper(paper: Paper): void {
    this.settings.update((settings) => ({ ...settings, paper }));
  }

  protected setShowPhoto(showPhoto: boolean): void {
    this.settings.update((settings) => ({ ...settings, showPhoto }));
  }

  // --- Personal details ------------------------------------------------------------------

  protected setBasic(field: Exclude<keyof ResumeBasics, 'links' | 'photo'>, value: string): void {
    this.resume.update((resume) => ({ ...resume, basics: { ...resume.basics, [field]: value } }));
  }

  protected addLink(): void {
    const id = newId();
    this.resume.update((resume) => ({
      ...resume,
      basics: { ...resume.basics, links: [...resume.basics.links, { id, label: '', url: '' }] },
    }));
    this.focusLater(`${id}-label`);
  }

  protected setLink(id: string, field: 'label' | 'url', value: string): void {
    this.resume.update((resume) => ({
      ...resume,
      basics: {
        ...resume.basics,
        links: resume.basics.links.map((link) => (link.id === id ? { ...link, [field]: value } : link)),
      },
    }));
  }

  protected removeLink(id: string): void {
    this.resume.update((resume) => ({
      ...resume,
      basics: { ...resume.basics, links: resume.basics.links.filter((link) => link.id !== id) },
    }));
    this.focusLater('add-link');
    this.say('Link removed.');
  }

  protected async onPhotoPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 15 * 1024 * 1024) {
      this.error.set('A photo has to be a JPEG, PNG or WebP image under 15 MB.');
      return;
    }
    try {
      const { squarePhoto } = await import('./resume-pdf');
      const photo = await squarePhoto(file);
      this.resume.update((resume) => ({ ...resume, basics: { ...resume.basics, photo } }));
      this.settings.update((settings) => ({ ...settings, showPhoto: true }));
      this.error.set(null);
      this.say('Photo added.');
    } catch {
      this.error.set('That image could not be read. Try saving it again as a JPEG.');
    }
  }

  protected removePhoto(): void {
    this.resume.update((resume) => ({ ...resume, basics: { ...resume.basics, photo: '' } }));
    this.settings.update((settings) => ({ ...settings, showPhoto: false }));
    this.say('Photo removed.');
  }

  // --- Sections ----------------------------------------------------------------------------

  protected sideNote(section: ResumeSection): string {
    return sideKinds(this.settings().template).has(section.kind)
      ? `${this.template().name} puts this section in its narrow column.`
      : '';
  }

  protected replaceSection(section: ResumeSection): void {
    this.resume.update((resume) => ({
      ...resume,
      sections: resume.sections.map((item) => (item.id === section.id ? section : item)),
    }));
  }

  protected moveSection(section: ResumeSection, by: number): void {
    const before = this.resume();
    const after = moveSection(before, section.id, by);
    if (after === before) {
      return;
    }
    this.resume.set(after);
    const to = after.sections.findIndex((item) => item.id === section.id);
    const count = after.sections.length;
    this.say(`${section.title} moved to position ${to + 1} of ${count}.`);
    const direction = by < 0 ? (to === 0 ? 'down' : 'up') : to === count - 1 ? 'up' : 'down';
    this.focusLater(`${section.id}-${direction}`);
  }

  protected removeSection(section: ResumeSection): void {
    this.remember(`Removed the ${section.title} section.`);
    const index = this.sections().findIndex((item) => item.id === section.id);
    this.resume.update((resume) => ({
      ...resume,
      sections: resume.sections.filter((item) => item.id !== section.id),
    }));
    const next = this.sections()[Math.min(index, this.sections().length - 1)];
    this.focusLater(next ? `${next.id}-toggle` : 'add-section');
    this.say(`Removed the ${section.title} section. Undo is at the top of the page.`);
  }

  protected setAddKind(kind: string): void {
    if (kind in SECTION_KINDS) {
      this.addKind.set(kind as SectionKind);
    }
  }

  protected addSection(): void {
    const kind = this.addKind();
    const section = newSection(kind);
    if (kind === 'custom') {
      section.title = 'Custom section';
    }
    this.resume.update((resume) => ({ ...resume, sections: [...resume.sections, section] }));
    this.focusLater(`${section.id}-title`);
    this.say(`Added a ${section.title} section at the end.`);
  }

  // --- Files ----------------------------------------------------------------------------------

  protected exportJson(): void {
    const json = JSON.stringify(toFile(this.resume(), this.settings()), null, 2);
    downloadBytes(new TextEncoder().encode(json), `${fileStem(this.resume())}.json`, 'application/json');
  }

  protected async onImportPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.error.set('That file is over 5 MB, far bigger than any saved resume.');
      return;
    }
    const result = parseResumeFile(await file.text());
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    if (!this.empty()) {
      this.remember('The imported file replaced your resume.');
    }
    this.resume.set(result.resume);
    this.settings.set(result.settings);
    this.error.set(null);
    this.say(`Imported ${file.name}.`);
  }

  protected async downloadPdf(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const input = this.input();
      let bytes = this.lastPdf?.input === input ? this.lastPdf.bytes : null;
      if (!bytes) {
        const { renderResume } = await import('./resume-pdf');
        bytes = await renderResume(input);
      }
      downloadBytes(bytes, `${fileStem(this.resume())}.pdf`, 'application/pdf');
    } catch {
      this.error.set('The PDF could not be made. Reload the page and try again; your resume is saved.');
    } finally {
      this.busy.set(false);
    }
  }

  // --- Preview -------------------------------------------------------------------------------

  private async renderPreview(input: ReturnType<typeof this.input>): Promise<void> {
    const token = ++this.previewToken;
    if (isEmptyResume(input.resume)) {
      this.releasePages(this.pages());
      this.pages.set([]);
      return;
    }
    this.previewBusy.set(true);
    let renderer: PdfDocumentRenderer | null = null;
    const made: PreviewPage[] = [];
    try {
      const { renderResume } = await import('./resume-pdf');
      const bytes = await renderResume(input);
      if (token !== this.previewToken) {
        return;
      }
      this.lastPdf = { input, bytes };
      renderer = await PdfDocumentRenderer.open(bytes);
      for (let index = 0; index < renderer.pageCount; index++) {
        const page = await renderer.renderPageCanvas(index, PREVIEW_SCALE);
        const blob = await new Promise<Blob | null>((resolve) => page.canvas.toBlob(resolve, 'image/png'));
        page.canvas.width = 0;
        page.canvas.height = 0;
        if (!blob) {
          throw new Error('The preview could not be drawn.');
        }
        made.push({ url: URL.createObjectURL(blob), width: page.width, height: page.height });
        if (token !== this.previewToken) {
          return;
        }
      }
      // How far down the last page the text reaches, to say when it is nearly empty.
      const last = renderer.pageCount - 1;
      const sizes = await renderer.pageSizes();
      const text = await renderer.pageText(last);
      const lowest = Math.min(...text.map((item) => item.y));
      this.lastPageFill.set(text.length ? (sizes[last].height - lowest) / sizes[last].height : 0);

      const old = this.pages();
      this.pages.set(made.splice(0));
      this.releasePages(old);
      this.error.set(null);
    } catch {
      if (token === this.previewToken) {
        this.error.set('The preview could not be drawn. Your resume is still saved.');
      }
    } finally {
      this.releasePages(made);
      renderer?.close();
      if (token === this.previewToken) {
        this.previewBusy.set(false);
      }
    }
  }

  private releasePages(pages: readonly PreviewPage[]): void {
    for (const page of pages) {
      URL.revokeObjectURL(page.url);
    }
  }

  private async renderThumbs(input: {
    resume: Resume;
    accent: string;
    density: Density;
    paper: Paper;
    showPhoto: boolean;
    roundPhoto: string;
  }): Promise<void> {
    const token = ++this.thumbToken;
    const { renderResume } = await import('./resume-pdf');
    // An empty resume makes six identical blank pages; show the example instead.
    const resume = isEmptyResume(input.resume) ? (await import('./resume-example')).exampleResume() : input.resume;
    for (const template of TEMPLATES) {
      if (token !== this.thumbToken) {
        return;
      }
      let renderer: PdfDocumentRenderer | null = null;
      try {
        const bytes = await renderResume({
          resume,
          settings: {
            template: template.id,
            fonts: template.fonts,
            accent: input.accent,
            density: input.density,
            paper: input.paper,
            showPhoto: input.showPhoto,
          },
          roundPhoto: input.roundPhoto,
        });
        renderer = await PdfDocumentRenderer.open(bytes);
        const url = await renderer.renderThumbnail(0, 320);
        if (token === this.thumbToken) {
          this.thumbs.update((thumbs) => ({ ...thumbs, [template.id]: url }));
        }
      } catch {
        // A missing thumbnail leaves the name and description; not worth an error.
      } finally {
        renderer?.close();
      }
    }
  }

  private focusLater(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }
}
