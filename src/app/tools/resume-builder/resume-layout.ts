/**
 * The six resume designs, as pdfmake document definitions.
 *
 * Pure: a resume and its settings go in, a plain object comes out, and
 * nothing here loads pdfmake, fetches a font or touches the DOM. That keeps
 * the designs testable in a unit test and lets one function feed both the
 * preview and the download, which is what makes them the same document.
 *
 * Units are PDF points (1/72 in). A4 is 595 x 842, US Letter 612 x 792.
 */
import {
  SECTION_KINDS,
  bulletLines,
  dateRange,
  displayUrl,
  linkTarget,
  listItems,
  visibleSections,
  type Density,
  type FontPairingId,
  type Paper,
  type Resume,
  type ResumeBasics,
  type ResumeEntry,
  type ResumeSection,
  type ResumeSettings,
  type SectionKind,
  type TemplateId,
} from './resume';
import { GLYPH_RANGES } from './resume-glyphs';

/** A pdfmake content node. Loosely typed on purpose: pdfmake's own is huge. */
export type Node = { [key: string]: unknown };
export type Content = Node | string | Content[];

// --- Fonts ---------------------------------------------------------------------

/** Where the TTFs are served from (public/fonts/resume). */
export const FONT_PATH = '/fonts/resume/';

/**
 * pdfmake families, each mapping its four slots to files. Faces with only
 * display weights (Playfair, Manrope) map every slot to them, because
 * pdfmake asks for a file per slot whether or not the slot is used.
 */
export const FONT_FAMILIES: Record<string, Record<'normal' | 'bold' | 'italics' | 'bolditalics', string>> = {
  Inter: { normal: 'Inter-Regular.ttf', bold: 'Inter-Bold.ttf', italics: 'Inter-Italic.ttf', bolditalics: 'Inter-Bold.ttf' },
  InterSemi: { normal: 'Inter-SemiBold.ttf', bold: 'Inter-Bold.ttf', italics: 'Inter-Italic.ttf', bolditalics: 'Inter-Bold.ttf' },
  Serif: { normal: 'SourceSerif4-Regular.ttf', bold: 'SourceSerif4-Bold.ttf', italics: 'SourceSerif4-Italic.ttf', bolditalics: 'SourceSerif4-Bold.ttf' },
  SerifSemi: { normal: 'SourceSerif4-SemiBold.ttf', bold: 'SourceSerif4-Bold.ttf', italics: 'SourceSerif4-Italic.ttf', bolditalics: 'SourceSerif4-Bold.ttf' },
  Sans: { normal: 'SourceSans3-Regular.ttf', bold: 'SourceSans3-Bold.ttf', italics: 'SourceSans3-Italic.ttf', bolditalics: 'SourceSans3-Bold.ttf' },
  SansSemi: { normal: 'SourceSans3-SemiBold.ttf', bold: 'SourceSans3-Bold.ttf', italics: 'SourceSans3-Italic.ttf', bolditalics: 'SourceSans3-Bold.ttf' },
  Playfair: { normal: 'PlayfairDisplay-SemiBold.ttf', bold: 'PlayfairDisplay-Bold.ttf', italics: 'PlayfairDisplay-SemiBold.ttf', bolditalics: 'PlayfairDisplay-Bold.ttf' },
  Manrope: { normal: 'Manrope-Bold.ttf', bold: 'Manrope-ExtraBold.ttf', italics: 'Manrope-Bold.ttf', bolditalics: 'Manrope-ExtraBold.ttf' },
};

/** Which entry of GLYPH_RANGES describes each family's files. */
const COVERAGE: Record<string, string> = {
  Inter: 'Inter',
  InterSemi: 'Inter',
  Serif: 'Serif',
  SerifSemi: 'Serif',
  Sans: 'Sans',
  SansSemi: 'Sans',
  Playfair: 'Playfair',
  Manrope: 'Manrope',
};

function covers(ranges: readonly number[], codePoint: number): boolean {
  for (let index = 0; index < ranges.length; index += 2) {
    if (codePoint >= ranges[index] && codePoint <= ranges[index + 1]) {
      return true;
    }
  }
  return false;
}

/**
 * Characters in `text` that some font of the pairing cannot draw, at most
 * `limit` of them. A font with no glyph prints nothing, so without this a
 * name in Sinhala or a city in Greek would quietly vanish from the PDF.
 */
export function missingGlyphs(text: string, pairing: FontPairingId, limit = 12): string[] {
  const ranges = familiesFor(pairing).map((family) => GLYPH_RANGES[COVERAGE[family]] ?? []);
  const missing = new Set<string>();
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint < 0x20 || /\s/.test(char) || missing.has(char)) {
      continue;
    }
    if (ranges.some((range) => !covers(range, codePoint))) {
      missing.add(char);
      if (missing.size >= limit) {
        break;
      }
    }
  }
  return [...missing];
}

interface Face {
  font: string;
  bold?: boolean;
}

export interface FontPairing {
  id: FontPairingId;
  label: string;
  /** Names and headings. */
  heading: Face;
  /** Running text. Must have a real italic. */
  body: string;
  /** Job titles and other emphasis inside the body. */
  strong: Face;
  /** Body size at normal density; faces differ in how big a point looks. */
  size: number;
}

export const FONT_PAIRINGS: Record<FontPairingId, FontPairing> = {
  inter: {
    id: 'inter',
    label: 'Inter',
    heading: { font: 'Inter', bold: true },
    body: 'Inter',
    strong: { font: 'InterSemi' },
    size: 9.4,
  },
  serif: {
    id: 'serif',
    label: 'Source Serif',
    heading: { font: 'SerifSemi' },
    body: 'Serif',
    strong: { font: 'SerifSemi' },
    size: 10.4,
  },
  elegant: {
    id: 'elegant',
    label: 'Playfair + Source Sans',
    heading: { font: 'Playfair', bold: true },
    body: 'Sans',
    strong: { font: 'SansSemi' },
    size: 10.2,
  },
  geometric: {
    id: 'geometric',
    label: 'Manrope + Inter',
    heading: { font: 'Manrope' },
    body: 'Inter',
    strong: { font: 'InterSemi' },
    size: 9.4,
  },
  editorial: {
    id: 'editorial',
    label: 'Source Serif + Inter',
    heading: { font: 'SerifSemi' },
    body: 'Inter',
    strong: { font: 'InterSemi' },
    size: 9.4,
  },
};

/** The families a pairing actually uses, so only their files are fetched. */
export function familiesFor(pairing: FontPairingId): string[] {
  const { heading, body, strong } = FONT_PAIRINGS[pairing];
  return [...new Set([heading.font, body, strong.font])];
}

// --- Templates -----------------------------------------------------------------

export interface TemplateInfo {
  id: TemplateId;
  name: string;
  /** One line for the picker. */
  blurb: string;
  /** Whether the design has a place for a photo. */
  photo: boolean;
  /** The pairing it was drawn with; picking the template suggests it. */
  fonts: FontPairingId;
}

export const TEMPLATES: readonly TemplateInfo[] = [
  { id: 'clarity', name: 'Clarity', blurb: 'One column, plain headings. The safest choice for applicant tracking systems.', photo: false, fonts: 'inter' },
  { id: 'heritage', name: 'Heritage', blurb: 'A classic serif layout with a centred heading, for law, finance and academia.', photo: false, fonts: 'serif' },
  { id: 'sidebar', name: 'Sidebar', blurb: 'A coloured sidebar for contact details and skills, with room for a photo.', photo: true, fonts: 'geometric' },
  { id: 'split', name: 'Split', blurb: 'Two columns on white: experience on the left, skills and languages on the right.', photo: true, fonts: 'inter' },
  { id: 'compact', name: 'Compact', blurb: 'Headings in the margin and tight spacing, to fit a full career on one page.', photo: true, fonts: 'inter' },
  { id: 'spotlight', name: 'Spotlight', blurb: 'A bold colour band across the top and dates on a timeline.', photo: true, fonts: 'elegant' },
];

export function templateInfo(id: TemplateId): TemplateInfo {
  return TEMPLATES.find((template) => template.id === id) ?? TEMPLATES[0];
}

// --- Colour --------------------------------------------------------------------

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;
}

/** `a` moved `amount` (0 to 1) of the way towards `b`. */
export function mix(a: string, b: string, amount: number): string {
  const from = channels(a);
  const to = channels(b);
  return toHex([0, 1, 2].map((i) => from[i] + (to[i] - from[i]) * amount) as [number, number, number]);
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The accent, darkened until it reads as text on `background` at 4.5:1.
 *
 * A visitor can pick a pale accent that looks lovely as a sidebar and is
 * unreadable as a heading on white; this keeps their hue and fixes the
 * lightness, so the heading still matches the sidebar.
 */
export function readableOn(color: string, background = '#ffffff', ratio = 4.5): string {
  let result = color;
  for (let step = 1; contrast(result, background) < ratio && step <= 20; step++) {
    result = mix(color, '#000000', step * 0.05);
  }
  return result;
}

/** White or near-black, whichever reads better on `background`. */
export function textOn(background: string): string {
  return contrast('#ffffff', background) >= contrast(INK, background) ? '#ffffff' : INK;
}

const INK = '#1b2230';
const MUTED = '#5a6372';
const RULE = '#d5d9e0';

// --- Shared building blocks ---------------------------------------------------------

interface Theme {
  pairing: FontPairing;
  size: number;
  /** Multiplies every gap. */
  space: number;
  accent: string;
  /** The accent, made readable on white. */
  accentText: string;
  ink: string;
  muted: string;
  rule: string;
}

const DENSITY: Record<Density, { size: number; space: number }> = {
  compact: { size: -0.5, space: 0.72 },
  normal: { size: 0, space: 1 },
  relaxed: { size: 0.4, space: 1.25 },
};

function themeFor(settings: ResumeSettings): Theme {
  const pairing = FONT_PAIRINGS[settings.fonts];
  const density = DENSITY[settings.density];
  return {
    pairing,
    size: pairing.size + density.size,
    space: density.space,
    accent: settings.accent,
    accentText: readableOn(settings.accent),
    ink: INK,
    muted: MUTED,
    rule: RULE,
  };
}

const PAGE: Record<Paper, { width: number; height: number; name: string }> = {
  a4: { width: 595.28, height: 841.89, name: 'A4' },
  letter: { width: 612, height: 792, name: 'LETTER' },
};

/**
 * Marks a block that must not be split across pages.
 *
 * pdfmake's own `unbreakable` silently drops whatever does not fit when a
 * block is taller than a page, which for a job with twenty bullets would lose
 * text. So blocks are tagged instead, and `breakBefore` below moves a tagged
 * block to the next page only when it would otherwise straddle two and it is
 * not already at the top of one. A block too tall for any page is then split
 * once, at the page end, rather than truncated.
 */
let keepCounter = 0;
function keep(stack: Content[], extra: Node = {}): Node {
  return { id: `keep-${keepCounter++}`, stack, ...extra };
}

export interface BreakNodeInfo {
  id?: unknown;
  pageNumbers: number[];
  startPosition: { verticalRatio: number };
}

/** pdfmake's pageBreakBefore hook. Exported for its test. */
export function breakBefore(node: BreakNodeInfo): boolean {
  return (
    typeof node.id === 'string' &&
    node.id.startsWith('keep-') &&
    node.pageNumbers.length > 1 &&
    node.startPosition.verticalRatio > 0.02
  );
}

interface ContactItem {
  text: string;
  link: string;
  label: string;
}

function contactItems(basics: ResumeBasics): ContactItem[] {
  const items: ContactItem[] = [];
  const add = (label: string, text: string, link: string) => {
    if (text.trim()) {
      items.push({ label, text: text.trim(), link });
    }
  };
  add('Email', basics.email, basics.email.includes('@') ? `mailto:${basics.email.trim()}` : '');
  add('Phone', basics.phone, basics.phone.replace(/[^\d+]/g, '').length >= 5 ? `tel:${basics.phone.replace(/[^\d+]/g, '')}` : '');
  add('Location', basics.location, '');
  add('Website', displayUrl(basics.website), linkTarget(basics.website));
  for (const link of basics.links) {
    if (link.url.trim()) {
      add(link.label.trim() || 'Link', displayUrl(link.url), linkTarget(link.url));
    }
  }
  return items;
}

/**
 * Contact items shorter than this are kept on one line: "linkedin.com/in/" at
 * the end of one line and the handle on the next reads as two things. Longer
 * ones may wrap, because an unbreakable run wider than the column would be
 * drawn off the page.
 */
const MAX_UNBROKEN = 48;

/** A no-break space, spelled by code point so it is visible in the source. */
const NBSP = String.fromCharCode(0xa0);

function linked(text: string, link: string, style: Node = {}): Node {
  return link ? { text, link, ...style } : { text, ...style };
}

/**
 * A separator that sticks to the item before it: the spaces in front become
 * no-break spaces, so a wrapped line never starts with a stray "·".
 */
export function glue(separator: string): string {
  return separator.replace(/^ +/, (spaces) => NBSP.repeat(spaces.length));
}

/** Contact details on one line, joined by `separator`. */
function contactLine(items: ContactItem[], separator: string, style: Node): Node {
  const parts: Content[] = [];
  items.forEach((item, index) => {
    if (index > 0) {
      parts.push({ text: glue(separator), color: style['separatorColor'] ?? style['color'] });
    }
    parts.push(linked(item.text, item.link, item.text.length <= MAX_UNBROKEN ? { noWrap: true } : {}));
  });
  const { separatorColor: _, ...rest } = style;
  return { text: parts, ...rest };
}

function photoNode(photo: string, size: number, extra: Node = {}): Node {
  return { image: photo, width: size, height: size, ...extra };
}

/** Title and date on one line, the date pushed right. */
function lineWithDate(left: Content, right: string, rightStyle: Node): Node {
  if (!right) {
    return { text: left } as Node;
  }
  return {
    columns: [
      { width: '*', text: left },
      { width: 'auto', text: right, alignment: 'right', ...rightStyle },
    ],
    columnGap: 10,
  };
}

function bulletList(entry: ResumeEntry, theme: Theme, options: { marker?: string; markerColor?: string } = {}): Node[] {
  const lines = bulletLines(entry.bullets);
  if (!lines.length) {
    return [];
  }
  return [
    {
      ul: lines.map((line) => ({ text: line, margin: [0, 0, 0, 1.6 * theme.space] })),
      type: options.marker ?? 'disc',
      markerColor: options.markerColor ?? theme.muted,
      margin: [0, 2.5 * theme.space, 0, 0],
    },
  ];
}

function paragraph(text: string, theme: Theme, extra: Node = {}): Node[] {
  return text.trim()
    ? [{ text: text.trim(), margin: [0, 2 * theme.space, 0, 0], ...extra }]
    : [];
}

/** "Company · Location", either half optional. */
function joinParts(parts: string[], separator = '  ·  '): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(separator);
}

function urlLine(entry: ResumeEntry, theme: Theme): Node[] {
  const url = entry.url.trim();
  return url
    ? [linked(displayUrl(url), linkTarget(url), { color: theme.accentText, fontSize: theme.size - 0.6, margin: [0, 1, 0, 0] })]
    : [];
}

/**
 * The body of a dated entry in the common shape: title and date, then
 * company and location, then link, paragraph and bullets.
 */
function standardEntry(entry: ResumeEntry, theme: Theme, options: { subtitleColor?: string; dates?: boolean } = {}): Content[] {
  const dates = options.dates === false ? '' : dateRange(entry);
  const head: Content[] = [];
  if (entry.title.trim() || dates) {
    head.push(
      lineWithDate(
        { text: entry.title.trim(), font: theme.pairing.strong.font, bold: theme.pairing.strong.bold, fontSize: theme.size + 0.8 },
        dates,
        { color: theme.muted, fontSize: theme.size - 0.4 },
      ),
    );
  }
  const sub = joinParts([entry.subtitle, entry.location]);
  if (sub) {
    head.push({ text: sub, color: options.subtitleColor ?? theme.accentText, margin: [0, 0.5, 0, 0] });
  }
  return [...head, ...urlLine(entry, theme), ...paragraph(entry.text, theme), ...bulletList(entry, theme)];
}

/** Skills as "Group: a, b, c" lines. */
function skillLines(section: ResumeSection, theme: Theme): Content[] {
  return section.entries.map((entry) => {
    const items = listItems(entry.text).join(', ');
    const group = entry.title.trim();
    return {
      text: group
        ? [{ text: `${group}: `, font: theme.pairing.strong.font, bold: theme.pairing.strong.bold }, items]
        : items,
      margin: [0, 0, 0, 2 * theme.space],
    };
  });
}

function certificationLines(section: ResumeSection, theme: Theme, color = theme.muted): Content[] {
  return section.entries.map((entry) => ({
    stack: [
      ...(entry.title.trim()
        ? [linked(entry.title.trim(), linkTarget(entry.url), { font: theme.pairing.strong.font, bold: theme.pairing.strong.bold })]
        : []),
      ...(joinParts([entry.subtitle, dateRange(entry)])
        ? [{ text: joinParts([entry.subtitle, dateRange(entry)]), color, fontSize: theme.size - 0.5 }]
        : []),
    ],
    margin: [0, 0, 0, 3.5 * theme.space],
  }));
}

function languageText(entry: ResumeEntry): string {
  return entry.subtitle.trim() ? `${entry.title.trim()} (${entry.subtitle.trim()})` : entry.title.trim();
}

/**
 * Lays out the entries of one section with `renderEntry`, and keeps the
 * heading on the same page as the first entry: a heading alone at the foot
 * of a page is the classic broken-resume look.
 */
function sectionBlock(
  heading: Content,
  section: ResumeSection,
  theme: Theme,
  renderEntry: (entry: ResumeEntry, index: number) => Content,
  gap: number,
): Content[] {
  const blocks = section.entries.map((entry, index) => ({
    stack: [renderEntry(entry, index)],
    margin: [0, index === 0 ? 0 : gap * theme.space, 0, 0],
  }));
  const [first, ...rest] = blocks;
  return [keep([heading, first]), ...rest.map((block) => keep([block]))];
}

/** Paragraph-like sections (summary, skills, languages) as one block each. */
function simpleSection(section: ResumeSection, theme: Theme, kinds: Partial<Record<SectionKind, (section: ResumeSection) => Content[]>>): Content[] | null {
  const render = kinds[section.kind];
  return render ? render(section) : null;
}

function summaryText(section: ResumeSection, theme: Theme, extra: Node = {}): Content[] {
  const entry = section.entries[0];
  return entry?.text.trim() ? [{ text: entry.text.trim(), ...extra }] : [];
}

// --- The document ------------------------------------------------------------------

export interface LayoutInput {
  resume: Resume;
  settings: ResumeSettings;
  /** The photo cut to a circle, as a PNG data URL, or "" for none. */
  roundPhoto: string;
}

export interface DocDefinition extends Node {
  pageSize: string;
  content: Content[];
}

export function buildDocument(input: LayoutInput): DocDefinition {
  keepCounter = 0;
  const { settings } = input;
  const theme = themeFor(settings);
  const template = templateInfo(settings.template);
  const page = PAGE[settings.paper];
  const showPhoto = template.photo && settings.showPhoto && !!input.roundPhoto;
  const ctx: TemplateContext = {
    resume: input.resume,
    sections: visibleSections(input.resume),
    theme,
    page,
    photo: showPhoto ? input.roundPhoto : '',
    contacts: contactItems(input.resume.basics),
  };
  const design = DESIGNS[template.id](ctx);
  const name = input.resume.basics.name.trim();
  return {
    pageSize: page.name,
    pageMargins: design.margins,
    background: design.background,
    content: design.content,
    pageBreakBefore: breakBefore,
    defaultStyle: {
      font: theme.pairing.body,
      fontSize: theme.size,
      lineHeight: 1.28,
      color: theme.ink,
    },
    info: {
      title: name ? `${name} – Resume` : 'Resume',
      author: name || undefined,
      subject: 'Resume',
      creator: 'YYDevTools Resume Builder',
      producer: 'YYDevTools Resume Builder (pdfmake)',
    },
  };
}

interface TemplateContext {
  resume: Resume;
  sections: ResumeSection[];
  theme: Theme;
  page: { width: number; height: number };
  photo: string;
  contacts: ContactItem[];
}

interface Design {
  margins: [number, number, number, number];
  background?: (currentPage: number, pageSize: { width: number; height: number }) => Content | null;
  content: Content[];
}

/** Kinds that two-column designs put in the narrow column. */
const SIDE_KINDS: ReadonlySet<SectionKind> = new Set(['skills', 'languages', 'certifications']);

// --- 1. Clarity: the ATS-safe one --------------------------------------------------------

function clarity(ctx: TemplateContext): Design {
  const { theme, resume } = ctx;
  const margin = 50;
  const width = ctx.page.width - margin * 2;
  const { basics } = resume;

  const heading = (title: string): Node => ({
    stack: [
      { text: title.toUpperCase(), font: theme.pairing.heading.font, bold: theme.pairing.heading.bold, fontSize: theme.size + 1.2, characterSpacing: 1, color: theme.accentText },
      { canvas: [{ type: 'line', x1: 0, y1: 2, x2: width, y2: 2, lineWidth: 0.7, lineColor: theme.rule }] },
    ],
    margin: [0, 14 * theme.space, 0, 6 * theme.space],
  });

  const content: Content[] = [];
  if (basics.name.trim()) {
    content.push({ text: basics.name.trim(), font: theme.pairing.heading.font, bold: theme.pairing.heading.bold, fontSize: 24, lineHeight: 1.1, color: theme.ink });
  }
  if (basics.headline.trim()) {
    content.push({ text: basics.headline.trim(), fontSize: theme.size + 2.6, color: theme.accentText, margin: [0, 3, 0, 0] });
  }
  if (ctx.contacts.length) {
    content.push(contactLine(ctx.contacts, '  |  ', { color: theme.muted, separatorColor: theme.rule, fontSize: theme.size - 0.3, margin: [0, 6, 0, 0] }));
  }

  for (const section of ctx.sections) {
    const simple = simpleSection(section, theme, {
      summary: (s) => summaryText(s, theme),
      skills: (s) => skillLines(s, theme),
      languages: (s) => [{ text: s.entries.map(languageText).join(', ') }],
      certifications: (s) => certificationLines(s, theme),
    });
    if (simple) {
      content.push(keep([heading(section.title), ...simple]));
    } else {
      content.push(...sectionBlock(heading(section.title), section, theme, (entry) => standardEntry(entry, theme, { subtitleColor: theme.ink }), 9));
    }
  }
  return { margins: [margin, 46, margin, 46], content };
}

// --- 2. Heritage: classic serif ------------------------------------------------------------

function heritage(ctx: TemplateContext): Design {
  const { theme, resume } = ctx;
  const margin = 56;
  const width = ctx.page.width - margin * 2;
  const { basics } = resume;
  const strong = { font: theme.pairing.strong.font, bold: theme.pairing.strong.bold };

  const heading = (title: string): Node => ({
    stack: [
      { text: title.toUpperCase(), alignment: 'center', font: theme.pairing.heading.font, bold: theme.pairing.heading.bold, fontSize: theme.size + 0.6, characterSpacing: 2.2, color: theme.accentText },
      {
        columns: [
          { width: '*', text: '' },
          { width: 26, canvas: [{ type: 'line', x1: 0, y1: 3, x2: 26, y2: 3, lineWidth: 1, lineColor: theme.accentText }] },
          { width: '*', text: '' },
        ],
      },
    ],
    margin: [0, 15 * theme.space, 0, 8 * theme.space],
  });

  // Organisation first, role second: the Harvard order. A project has no
  // organisation, so its name leads and the stack follows.
  const entryBlock = (entry: ResumeEntry, orgFirst: boolean): Content[] => {
    const dates = dateRange(entry);
    const rows: Content[] = [];
    const org = (orgFirst ? entry.subtitle : entry.title).trim();
    const title = (orgFirst ? entry.title : entry.subtitle).trim();
    if (org || entry.location.trim()) {
      rows.push(lineWithDate({ text: org || title, ...strong, fontSize: theme.size + 0.6 }, entry.location.trim(), { color: theme.muted }));
    }
    const second = org ? title : '';
    if (second || dates) {
      rows.push(lineWithDate({ text: second, italics: true }, dates, { italics: true, color: theme.muted }));
    } else if (!org && !entry.location.trim() && title) {
      rows.push({ text: title, ...strong });
    }
    return [...rows, ...urlLine(entry, theme), ...paragraph(entry.text, theme), ...bulletList(entry, theme, { markerColor: theme.ink })];
  };

  const content: Content[] = [];
  if (basics.name.trim()) {
    content.push({ text: basics.name.trim(), alignment: 'center', font: theme.pairing.heading.font, bold: theme.pairing.heading.bold, fontSize: 25, characterSpacing: 0.6, lineHeight: 1.1 });
  }
  if (basics.headline.trim()) {
    content.push({ text: basics.headline.trim(), alignment: 'center', italics: true, color: theme.muted, fontSize: theme.size + 1.6, margin: [0, 3, 0, 0] });
  }
  if (ctx.contacts.length) {
    content.push(contactLine(ctx.contacts, '   ·   ', { alignment: 'center', color: theme.ink, separatorColor: theme.accentText, fontSize: theme.size - 0.4, margin: [0, 7, 0, 0] }));
  }
  content.push({
    canvas: [
      { type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.8, lineColor: theme.ink },
      { type: 'line', x1: 0, y1: 2.6, x2: width, y2: 2.6, lineWidth: 0.4, lineColor: theme.ink },
    ],
    margin: [0, 10, 0, 0],
  });

  for (const section of ctx.sections) {
    const simple = simpleSection(section, theme, {
      summary: (s) => summaryText(s, theme, { alignment: 'justify' }),
      skills: (s) => skillLines(s, theme),
      languages: (s) => [{ text: s.entries.map(languageText).join('   ·   '), alignment: 'center' }],
      certifications: (s) => certificationLines(s, theme),
    });
    if (simple) {
      content.push(keep([heading(section.title), ...simple]));
    } else {
      content.push(...sectionBlock(heading(section.title), section, theme, (entry) => entryBlock(entry, section.kind !== 'projects'), 10));
    }
  }
  return { margins: [margin, 48, margin, 48], content };
}

// --- 3. Sidebar: coloured column ---------------------------------------------------------

function sidebar(ctx: TemplateContext): Design {
  const { theme, resume } = ctx;
  const { basics } = resume;
  const sideWidth = Math.round(ctx.page.width * 0.32);
  const sidePad = 22;
  const sideInner = sideWidth - sidePad * 2;
  const mainLeft = sideWidth + 26;
  const mainRight = 36;
  const mainWidth = ctx.page.width - mainLeft - mainRight;
  const on = textOn(theme.accent);
  const onSoft = mix(on, theme.accent, 0.25);
  const onRule = mix(on, theme.accent, 0.62);

  const sideHeading = (title: string): Node => ({
    stack: [
      { text: title.toUpperCase(), font: theme.pairing.heading.font, bold: theme.pairing.heading.bold, fontSize: theme.size - 0.2, characterSpacing: 1.4, color: on },
      { canvas: [{ type: 'line', x1: 0, y1: 3, x2: sideInner, y2: 3, lineWidth: 0.6, lineColor: onRule }] },
    ],
    margin: [0, 16 * theme.space, 0, 7 * theme.space],
  });
  const mainHeading = (title: string): Node => ({
    stack: [
      { text: title, font: theme.pairing.heading.font, bold: theme.pairing.heading.bold, fontSize: theme.size + 3.6, color: theme.accentText },
      { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 24, y2: 2, lineWidth: 2.2, lineColor: theme.accent }] },
    ],
    margin: [0, 15 * theme.space, 0, 8 * theme.space],
  });

  const side: Content[] = [];
  if (ctx.photo) {
    side.push(photoNode(ctx.photo, 104, { alignment: 'center', margin: [0, 2, 0, 8] }));
  }
  if (ctx.contacts.length) {
    side.push(
      keep([
        sideHeading('Contact'),
        ...ctx.contacts.map((item) => ({
          stack: [
            { text: item.label.toUpperCase(), fontSize: theme.size - 2.4, characterSpacing: 0.8, color: onSoft },
            linked(item.text, item.link, { color: on, fontSize: theme.size - 0.6 }),
          ],
          margin: [0, 0, 0, 5 * theme.space],
        })),
      ]),
    );
  }
  const main: Content[] = [];
  if (basics.name.trim()) {
    main.push({ text: basics.name.trim(), font: theme.pairing.heading.font, bold: theme.pairing.heading.bold, fontSize: 27, lineHeight: 1.05, color: theme.ink });
  }
  if (basics.headline.trim()) {
    main.push({ text: basics.headline.trim(), fontSize: theme.size + 3, color: theme.accentText, margin: [0, 4, 0, 0] });
  }

  for (const section of ctx.sections) {
    if (SIDE_KINDS.has(section.kind)) {
      let items: Content[];
      if (section.kind === 'skills') {
        items = section.entries.map((entry) => ({
          stack: [
            ...(entry.title.trim() ? [{ text: entry.title.trim(), font: theme.pairing.strong.font, bold: theme.pairing.strong.bold, color: on, fontSize: theme.size - 0.2 }] : []),
            { text: listItems(entry.text).join(glue('  ·  ')), color: onSoft, fontSize: theme.size - 0.6, margin: [0, 1, 0, 0] },
          ],
          margin: [0, 0, 0, 6 * theme.space],
        }));
      } else if (section.kind === 'languages') {
        items = section.entries.map((entry) => ({
          columns: [
            { width: '*', text: entry.title.trim(), color: on, fontSize: theme.size - 0.4 },
            { width: 'auto', text: entry.subtitle.trim(), color: onSoft, fontSize: theme.size - 0.8, alignment: 'right' },
          ],
          margin: [0, 0, 0, 3.5 * theme.space],
        }));
      } else {
        items = section.entries.map((entry) => ({
          stack: [
            linked(entry.title.trim(), linkTarget(entry.url), { color: on, fontSize: theme.size - 0.4, font: theme.pairing.strong.font, bold: theme.pairing.strong.bold }),
            { text: joinParts([entry.subtitle, dateRange(entry)]), color: onSoft, fontSize: theme.size - 1 },
          ],
          margin: [0, 0, 0, 5 * theme.space],
        }));
      }
      const [first, ...rest] = items;
      side.push(keep([sideHeading(section.title), first]), ...rest.map((item) => keep([item])));
    } else if (section.kind === 'summary') {
      main.push(keep([mainHeading(section.title), ...summaryText(section, theme)]));
    } else {
      main.push(...sectionBlock(mainHeading(section.title), section, theme, (entry) => standardEntry(entry, theme, { subtitleColor: theme.muted }), 10));
    }
  }

  return {
    margins: [0, 38, 0, 38],
    background: (_page, size) => ({
      canvas: [{ type: 'rect', x: 0, y: 0, w: sideWidth, h: size.height, color: theme.accent }],
    }),
    content: [
      {
        columns: [
          { width: sideWidth, stack: side, margin: [sidePad, 0, sidePad, 0] },
          { width: mainWidth, stack: main, margin: [26, 0, 0, 0] },
        ],
        columnGap: 0,
      },
    ],
  };
}

// --- 4. Split: two columns on white ------------------------------------------------------------

function split(ctx: TemplateContext): Design {
  const { theme, resume } = ctx;
  const { basics } = resume;
  const margin = 42;
  const width = ctx.page.width - margin * 2;
  const gap = 24;
  const sideWidth = Math.round(width * 0.31);
  const mainWidth = width - sideWidth - gap;
  const tint = mix(theme.accent, '#ffffff', 0.86);
  const tagText = readableOn(theme.accent, tint);

  const heading = (title: string, w: number): Node => ({
    stack: [
      { canvas: [{ type: 'rect', x: 0, y: theme.size * 0.36, w: 5, h: 5, color: theme.accent }], relativePosition: { x: 0, y: 0 } },
      { text: title.toUpperCase(), font: theme.pairing.heading.font, bold: theme.pairing.heading.bold, fontSize: theme.size + 0.2, characterSpacing: 1.3, color: theme.ink, margin: [11, 0, 0, 0] },
      { canvas: [{ type: 'line', x1: 0, y1: 3, x2: w, y2: 3, lineWidth: 0.5, lineColor: theme.rule }] },
    ],
    margin: [0, 14 * theme.space, 0, 7 * theme.space],
  });

  const nameBlock: Content[] = [];
  if (basics.name.trim()) {
    nameBlock.push({ text: basics.name.trim(), font: theme.pairing.heading.font, bold: theme.pairing.heading.bold, fontSize: 28, lineHeight: 1.05 });
  }
  if (basics.headline.trim()) {
    nameBlock.push({ text: basics.headline.trim(), color: theme.accentText, fontSize: theme.size + 2.6, margin: [0, 4, 0, 0] });
  }
  const contactBlock: Content[] = ctx.contacts.map((item) =>
    linked(item.text, item.link, { alignment: 'right', color: theme.muted, fontSize: theme.size - 0.6, lineHeight: 1.35, noWrap: item.text.length <= MAX_UNBROKEN }),
  );

  const headerColumns: Content[] = [];
  if (ctx.photo) {
    headerColumns.push({ width: 62, ...photoNode(ctx.photo, 62) });
  }
  headerColumns.push({ width: '*', stack: nameBlock, margin: [0, ctx.photo ? 6 : 0, 0, 0] });
  if (contactBlock.length) {
    headerColumns.push({ width: 'auto', stack: contactBlock });
  }

  const main: Content[] = [];
  const side: Content[] = [];
  for (const section of ctx.sections) {
    if (SIDE_KINDS.has(section.kind)) {
      let items: Content[];
      if (section.kind === 'skills') {
        // Each skill is a tinted box made of the text's own background, padded
        // with no-break spaces so a two-word skill never splits across lines.
        items = section.entries.map((entry) => {
          const tags: Content[] = [];
          listItems(entry.text).forEach((item, index) => {
            if (index > 0) {
              tags.push({ text: '  ' });
            }
            tags.push({ text: NBSP + item.replace(/ /g, NBSP) + NBSP, background: tint, color: tagText });
          });
          return {
            stack: [
              ...(entry.title.trim() ? [{ text: entry.title.trim(), font: theme.pairing.strong.font, bold: theme.pairing.strong.bold, fontSize: theme.size - 0.2, margin: [0, 0, 0, 2] }] : []),
              { text: tags, fontSize: theme.size - 0.8, lineHeight: 1.75 },
            ],
            margin: [0, 0, 0, 5 * theme.space],
          };
        });
      } else if (section.kind === 'languages') {
        items = section.entries.map((entry) => ({
          stack: [
            { text: entry.title.trim(), font: theme.pairing.strong.font, bold: theme.pairing.strong.bold },
            { text: entry.subtitle.trim(), color: theme.muted, fontSize: theme.size - 0.6 },
          ],
          margin: [0, 0, 0, 4 * theme.space],
        }));
      } else {
        items = certificationLines(section, theme);
      }
      const [first, ...rest] = items;
      side.push(keep([heading(section.title, sideWidth), first]), ...rest.map((item) => keep([item])));
    } else if (section.kind === 'summary') {
      main.push(keep([heading(section.title, mainWidth), ...summaryText(section, theme)]));
    } else {
      main.push(...sectionBlock(heading(section.title, mainWidth), section, theme, (entry) => standardEntry(entry, theme), 10));
    }
  }

  return {
    margins: [margin, 40, margin, 40],
    content: [
      { columns: headerColumns, columnGap: 14 },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 2, lineColor: theme.accent }], margin: [0, 12, 0, 0] },
      {
        columns: [
          { width: mainWidth, stack: main },
          { width: sideWidth, stack: side },
        ],
        columnGap: gap,
      },
    ],
  };
}

// --- 5. Compact: headings in the margin ------------------------------------------------------------

function compact(ctx: TemplateContext): Design {
  const { theme, resume } = ctx;
  const { basics } = resume;
  const margin = 36;
  const width = ctx.page.width - margin * 2;
  const gutter = 92;
  const size = theme.size - 0.6;
  const strong = { font: theme.pairing.strong.font, bold: theme.pairing.strong.bold };

  const row = (title: string, body: Content[], first: boolean): Node => ({
    stack: [
      ...(first ? [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.5, lineColor: theme.rule }], margin: [0, 0, 0, 7 * theme.space] }] : []),
      {
        columns: [
          { width: gutter, text: first ? title.toUpperCase() : '', font: theme.pairing.heading.font, bold: theme.pairing.heading.bold, fontSize: size - 0.6, characterSpacing: 1, color: theme.accentText, margin: [0, 1, 0, 0] },
          { width: '*', stack: body },
        ],
        columnGap: 12,
      },
    ],
    margin: [0, first ? 9 * theme.space : 5.5 * theme.space, 0, 0],
  });

  const entryBody = (entry: ResumeEntry): Content[] => {
    const titleLine: Content[] = [];
    if (entry.title.trim()) {
      titleLine.push({ text: entry.title.trim(), ...strong });
    }
    const org = joinParts([entry.subtitle, entry.location], ', ');
    if (org) {
      titleLine.push({ text: `${titleLine.length ? '  ·  ' : ''}${org}`, color: theme.muted });
    }
    return [
      lineWithDate(titleLine, dateRange(entry), { color: theme.muted, fontSize: size - 0.4 }),
      ...urlLine(entry, theme),
      ...paragraph(entry.text, theme, { margin: [0, 1, 0, 0] }),
      ...bulletList(entry, theme, { marker: 'square', markerColor: theme.accent }).map((list) => ({ ...list, margin: [0, 1.5, 0, 0] })),
    ];
  };

  const content: Content[] = [];
  const header: Content[] = [];
  if (ctx.photo) {
    header.push({ width: 50, ...photoNode(ctx.photo, 50) });
  }
  header.push({
    width: '*',
    stack: [
      ...(basics.name.trim() ? [{ text: basics.name.trim(), font: theme.pairing.heading.font, bold: theme.pairing.heading.bold, fontSize: 21, lineHeight: 1.05 }] : []),
      ...(basics.headline.trim() ? [{ text: basics.headline.trim(), color: theme.accentText, fontSize: size + 1.6, margin: [0, 2, 0, 0] }] : []),
    ],
    margin: [0, ctx.photo ? 4 : 0, 0, 0],
  });
  if (ctx.contacts.length) {
    const half = Math.ceil(ctx.contacts.length / 2);
    header.push({
      width: Math.round(width * 0.56),
      stack: [ctx.contacts.slice(0, half), ctx.contacts.slice(half)]
        .filter((part) => part.length)
        .map((part) => contactLine(part, '  ·  ', { alignment: 'right', color: theme.muted, separatorColor: theme.rule, fontSize: size - 0.5 })),
      margin: [0, 3, 0, 0],
    });
  }
  content.push({ columns: header, columnGap: 12, margin: [0, 0, 0, 2] });

  for (const section of ctx.sections) {
    if (section.kind === 'summary') {
      content.push(keep([row(section.title, summaryText(section, theme), true)]));
    } else if (section.kind === 'skills') {
      content.push(keep([row(section.title, skillLines(section, theme), true)]));
    } else if (section.kind === 'languages') {
      content.push(keep([row(section.title, [{ text: section.entries.map(languageText).join(', ') }], true)]));
    } else if (section.kind === 'certifications') {
      content.push(
        keep([
          row(
            section.title,
            section.entries.map((entry) =>
              lineWithDate(
                [linked(entry.title.trim(), linkTarget(entry.url), strong), ...(entry.subtitle.trim() ? [{ text: `  ·  ${entry.subtitle.trim()}`, color: theme.muted }] : [])],
                dateRange(entry),
                { color: theme.muted, fontSize: size - 0.4 },
              ),
            ),
            true,
          ),
        ]),
      );
    } else {
      section.entries.forEach((entry, index) => content.push(keep([row(section.title, entryBody(entry), index === 0)])));
    }
  }
  return {
    margins: [margin, 34, margin, 34],
    content: [{ stack: content, fontSize: size, lineHeight: 1.22 }],
  };
}

// --- 6. Spotlight: colour band and timeline ----------------------------------------------------------

function spotlight(ctx: TemplateContext): Design {
  const { theme, resume } = ctx;
  const { basics } = resume;
  const margin = 46;
  const top = 40;
  const width = ctx.page.width - margin * 2;
  const on = textOn(theme.accent);
  const onSoft = mix(on, theme.accent, 0.2);
  const gutter = 82;

  // A two-cell table: the heading, then an empty cell whose bottom border is
  // the rule. Unlike a canvas line, a border knows how wide its cell turned out.
  const heading = (title: string): Node => ({
    table: {
      widths: ['auto', '*'],
      body: [
        [
          { text: title, font: theme.pairing.heading.font, bold: theme.pairing.heading.bold, fontSize: theme.size + 4.2, color: theme.accentText, border: [false, false, false, false], margin: [0, 0, 0, -3] },
          { text: '', border: [false, false, false, true] },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => theme.rule,
      paddingLeft: (i: number) => (i === 0 ? 0 : 0),
      paddingRight: (i: number) => (i === 0 ? 10 : 0),
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 15 * theme.space, 0, 8 * theme.space],
  });

  const timelineEntry = (entry: ResumeEntry): Content => ({
    columns: [
      { width: gutter, text: dateRange(entry).replace(' – ', '\n– '), color: theme.muted, fontSize: theme.size - 0.8, lineHeight: 1.25, margin: [0, 1.5, 0, 0] },
      { width: 10, canvas: [{ type: 'ellipse', x: 3, y: theme.size * 0.75, r1: 2.6, r2: 2.6, color: theme.accent }] },
      { width: '*', stack: standardEntry(entry, theme, { dates: false }) },
    ],
    columnGap: 4,
  });

  // The band is a table cell rather than a background, so it grows with a
  // long name or a wrapped contact line instead of being drawn behind them.
  const bandText: Content[] = [];
  if (basics.name.trim()) {
    bandText.push({ text: basics.name.trim(), font: theme.pairing.heading.font, bold: theme.pairing.heading.bold, fontSize: 30, lineHeight: 1.05, color: on });
  }
  if (basics.headline.trim()) {
    bandText.push({ text: basics.headline.trim(), color: onSoft, fontSize: theme.size + 3, margin: [0, 4, 0, 0] });
  }
  if (ctx.contacts.length) {
    bandText.push(contactLine(ctx.contacts, '   ·   ', { color: on, separatorColor: onSoft, fontSize: theme.size - 0.5, margin: [0, 10, 0, 0] }));
  }
  const bandColumns: Content[] = [{ width: '*', stack: bandText, margin: [0, 30, 0, 26] }];
  if (ctx.photo) {
    const size = 92;
    bandColumns.push({
      width: size + 6,
      stack: [
        { canvas: [{ type: 'ellipse', x: size / 2 + 3, y: size / 2 + 3, r1: size / 2 + 3, r2: size / 2 + 3, color: '#ffffff' }] },
        photoNode(ctx.photo, size, { relativePosition: { x: 3, y: -(size + 3) } }),
      ],
      margin: [0, 24, 0, 20],
    });
  }

  const content: Content[] = [
    {
      table: { widths: ['*'], body: [[{ columns: bandColumns, columnGap: 18, margin: [margin, 0, margin, 0] }]] },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        fillColor: () => theme.accent,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      margin: [-margin, -top, -margin, 6],
    },
  ];

  for (const section of ctx.sections) {
    const simple = simpleSection(section, theme, {
      summary: (s) => summaryText(s, theme),
      skills: (s) => skillLines(s, theme),
      languages: (s) => [{ text: s.entries.map(languageText).join('   ·   ') }],
      certifications: (s) => certificationLines(s, theme),
    });
    if (simple) {
      content.push(keep([heading(section.title), ...simple]));
    } else {
      content.push(...sectionBlock(heading(section.title), section, theme, timelineEntry, 11));
    }
  }
  return { margins: [margin, top, margin, 40], content };
}

const DESIGNS: Record<TemplateId, (ctx: TemplateContext) => Design> = {
  clarity,
  heritage,
  sidebar,
  split,
  compact,
  spotlight,
};

/** For the editor: which kinds a design moves into its narrow column. */
export function sideKinds(template: TemplateId): ReadonlySet<SectionKind> {
  return template === 'sidebar' || template === 'split' ? SIDE_KINDS : new Set();
}

export { SECTION_KINDS };
