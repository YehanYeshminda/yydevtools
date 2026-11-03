/**
 * The resume itself: its shape, the edits the form makes to it, and the file
 * format it is saved in.
 *
 * Every function here is pure and returns a new object, so the component can
 * keep the whole resume in one signal and the preview can tell a change by
 * reference. Nothing in this file knows about pdfmake or the DOM.
 */

export type SectionKind =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'languages'
  | 'custom';

/**
 * One item in a section: a job, a degree, a skill group, a language.
 *
 * Every kind uses the same shape and leaves the fields it has no use for
 * empty. One shape means one editor, one importer and one set of tests; the
 * per-kind differences live in SECTION_KINDS as labels.
 */
export interface ResumeEntry {
  id: string;
  hidden: boolean;
  /** Job title, degree, skill group, language, project or certificate name. */
  title: string;
  /** Company, school, proficiency, issuer, or a project's role or stack. */
  subtitle: string;
  location: string;
  /** "YYYY-MM", "YYYY" or "". */
  start: string;
  /** "YYYY-MM", "YYYY" or "". Ignored while `current` is set. */
  end: string;
  current: boolean;
  url: string;
  /** A paragraph. For skills, the skills themselves, separated by commas. */
  text: string;
  /** One bullet point per line. */
  bullets: string;
}

export interface ResumeSection {
  id: string;
  kind: SectionKind;
  /** The heading printed on the page; editable, so "Experience" can be "Work history". */
  title: string;
  hidden: boolean;
  entries: ResumeEntry[];
}

export interface ResumeLink {
  id: string;
  label: string;
  url: string;
}

export interface ResumeBasics {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  links: ResumeLink[];
  /** A square JPEG as a data URL, or "". */
  photo: string;
}

export interface Resume {
  basics: ResumeBasics;
  sections: ResumeSection[];
}

export type EntryField = keyof Omit<ResumeEntry, 'id' | 'hidden' | 'current'>;

export interface SectionKindInfo {
  kind: SectionKind;
  /** The heading a new section of this kind starts with. */
  title: string;
  /** What one entry is called on the buttons: "Add a position". */
  noun: string;
  /** Exactly one entry, no add or remove (the summary). */
  single?: boolean;
  /** The fields the editor shows, in order, with their labels. */
  fields: Partial<Record<EntryField, string>>;
  /** Whether the editor shows start/end dates and the "present" box. */
  dates: 'range' | 'single' | 'none';
  /** Placeholders, to show the kind of thing each field wants. */
  hints?: Partial<Record<EntryField, string>>;
}

export const SECTION_KINDS: Record<SectionKind, SectionKindInfo> = {
  summary: {
    kind: 'summary',
    title: 'Summary',
    noun: 'summary',
    single: true,
    fields: { text: 'Summary' },
    dates: 'none',
    hints: { text: 'Two or three sentences: who you are, what you are best at, what you want next.' },
  },
  experience: {
    kind: 'experience',
    title: 'Experience',
    noun: 'position',
    fields: {
      title: 'Job title',
      subtitle: 'Company',
      location: 'Location',
      text: 'Description (optional)',
      bullets: 'Achievements, one per line',
    },
    dates: 'range',
    hints: { bullets: 'Cut checkout time by 40% by rebuilding the payment flow' },
  },
  education: {
    kind: 'education',
    title: 'Education',
    noun: 'qualification',
    fields: {
      title: 'Degree or qualification',
      subtitle: 'School',
      location: 'Location',
      text: 'Details (optional)',
      bullets: 'Highlights, one per line',
    },
    dates: 'range',
  },
  skills: {
    kind: 'skills',
    title: 'Skills',
    noun: 'skill group',
    fields: { title: 'Group (optional)', text: 'Skills, separated by commas' },
    dates: 'none',
    hints: { title: 'Languages', text: 'TypeScript, Go, SQL' },
  },
  projects: {
    kind: 'projects',
    title: 'Projects',
    noun: 'project',
    fields: {
      title: 'Project name',
      subtitle: 'Role or stack',
      url: 'Link',
      text: 'Description',
      bullets: 'Highlights, one per line',
    },
    dates: 'range',
  },
  certifications: {
    kind: 'certifications',
    title: 'Certifications',
    noun: 'certification',
    fields: { title: 'Certification', subtitle: 'Issuer', url: 'Link' },
    dates: 'single',
  },
  languages: {
    kind: 'languages',
    title: 'Languages',
    noun: 'language',
    fields: { title: 'Language', subtitle: 'Level' },
    dates: 'none',
    hints: { subtitle: 'Native, Fluent, Professional, Conversational' },
  },
  custom: {
    kind: 'custom',
    title: 'Volunteering',
    noun: 'entry',
    fields: {
      title: 'Title',
      subtitle: 'Organisation',
      location: 'Location',
      text: 'Description',
      bullets: 'Points, one per line',
    },
    dates: 'range',
  },
};

/** The kinds offered by "Add a section", in the order they are offered. */
export const ADDABLE_KINDS: readonly SectionKind[] = [
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'languages',
  'custom',
];

export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

// --- Ids -------------------------------------------------------------------

/**
 * A fresh id for something the visitor just added.
 *
 * Only ever called from a click, never while the page is prerendered: the
 * empty resume below uses fixed ids, so the static HTML and the hydrated page
 * agree on every id attribute.
 */
export function newId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// --- Construction ------------------------------------------------------------

export function emptyEntry(id: string = newId()): ResumeEntry {
  return {
    id,
    hidden: false,
    title: '',
    subtitle: '',
    location: '',
    start: '',
    end: '',
    current: false,
    url: '',
    text: '',
    bullets: '',
  };
}

export function newSection(kind: SectionKind, id: string = newId()): ResumeSection {
  const info = SECTION_KINDS[kind];
  return {
    id,
    kind,
    title: info.title,
    hidden: false,
    entries: info.single ? [emptyEntry(`${id}-e`)] : [],
  };
}

/** The blank resume a first visit starts from. Fixed ids, see newId. */
export function emptyResume(): Resume {
  return {
    basics: {
      name: '',
      headline: '',
      email: '',
      phone: '',
      location: '',
      website: '',
      links: [],
      photo: '',
    },
    sections: (['summary', 'experience', 'education', 'skills'] as const).map((kind) =>
      newSection(kind, `s-${kind}`),
    ),
  };
}

// --- Edits -------------------------------------------------------------------

/**
 * Moves the item at `from` by `by` places, clamped to the ends.
 *
 * Returns the same array when nothing moves, so a press of "up" on the first
 * item is not a change and does not trigger a save or a redraw.
 */
export function move<T>(items: readonly T[], from: number, by: number): T[] {
  const to = Math.max(0, Math.min(items.length - 1, from + by));
  if (from < 0 || from >= items.length || to === from) {
    return items as T[];
  }
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function updateSection(
  resume: Resume,
  sectionId: string,
  change: (section: ResumeSection) => ResumeSection,
): Resume {
  return {
    ...resume,
    sections: resume.sections.map((section) =>
      section.id === sectionId ? change(section) : section,
    ),
  };
}

export function updateEntry(
  resume: Resume,
  sectionId: string,
  entryId: string,
  change: Partial<ResumeEntry>,
): Resume {
  return updateSection(resume, sectionId, (section) => ({
    ...section,
    entries: section.entries.map((entry) =>
      entry.id === entryId ? { ...entry, ...change, id: entry.id } : entry,
    ),
  }));
}

export function moveSection(resume: Resume, sectionId: string, by: number): Resume {
  const from = resume.sections.findIndex((section) => section.id === sectionId);
  const sections = move(resume.sections, from, by);
  return sections === resume.sections ? resume : { ...resume, sections };
}

export function moveEntry(resume: Resume, sectionId: string, entryId: string, by: number): Resume {
  return updateSection(resume, sectionId, (section) => {
    const from = section.entries.findIndex((entry) => entry.id === entryId);
    const entries = move(section.entries, from, by);
    return entries === section.entries ? section : { ...section, entries };
  });
}

// --- Reading -----------------------------------------------------------------

/** Bullet lines with any typed-in marker ("-", "*", "•") taken off. */
export function bulletLines(bullets: string): string[] {
  return bullets
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•‣◦⁃∙]\s*)?/, '').trim())
    .filter((line) => line.length > 0);
}

/** A comma-separated (or line-separated) skills list, cleaned. */
export function listItems(text: string): string[] {
  return text
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** "2024-05" → "May 2024"; "2024" → "2024"; anything else → "". */
export function formatYearMonth(value: string): string {
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(value.trim());
  if (!match) {
    return '';
  }
  const month = match[2] ? Number(match[2]) : 0;
  return month >= 1 && month <= 12 ? `${MONTHS[month - 1]} ${match[1]}` : match[1];
}

/**
 * The date line for an entry: "Jan 2020 – Present", "2018 – 2022", "May 2023".
 *
 * An end with no start prints alone (a graduation date); a start with no end
 * and no "present" prints alone too, rather than as "2020 –", which reads as
 * a typo.
 */
export function dateRange(entry: Pick<ResumeEntry, 'start' | 'end' | 'current'>): string {
  const start = formatYearMonth(entry.start);
  const end = entry.current ? 'Present' : formatYearMonth(entry.end);
  if (start && end) {
    return start === end ? start : `${start} – ${end}`;
  }
  return start || end;
}

/** Splits "YYYY-MM" into the two halves the month and year controls show. */
export function splitYearMonth(value: string): { year: string; month: string } {
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(value);
  return match ? { year: match[1], month: match[2] ?? '' } : { year: '', month: '' };
}

/**
 * Joins a year and a month back together. A month without a year is not a
 * date, so it is dropped rather than stored as "-05".
 */
export function joinYearMonth(year: string, month: string): string {
  const y = year.trim();
  if (!/^\d{4}$/.test(y)) {
    return '';
  }
  return /^(0[1-9]|1[0-2])$/.test(month) ? `${y}-${month}` : y;
}

/** True when an entry has nothing printable in it. */
export function isBlankEntry(entry: ResumeEntry): boolean {
  return ![
    entry.title,
    entry.subtitle,
    entry.location,
    entry.url,
    entry.text,
    entry.bullets,
    dateRange(entry),
  ].some((value) => value.trim().length > 0);
}

/** The sections and entries that will actually be printed, in order. */
export function visibleSections(resume: Resume): ResumeSection[] {
  return resume.sections
    .filter((section) => !section.hidden)
    .map((section) => ({
      ...section,
      entries: section.entries.filter((entry) => !entry.hidden && !isBlankEntry(entry)),
    }))
    .filter((section) => section.entries.length > 0);
}

/** Every piece of text that will be printed, joined, for checking fonts against. */
export function printableText(resume: Resume): string {
  const { basics } = resume;
  const parts = [basics.name, basics.headline, basics.email, basics.phone, basics.location, basics.website];
  for (const link of basics.links) {
    parts.push(link.label, link.url);
  }
  for (const section of visibleSections(resume)) {
    parts.push(section.title);
    for (const entry of section.entries) {
      parts.push(entry.title, entry.subtitle, entry.location, entry.url, entry.text, entry.bullets);
    }
  }
  return parts.join(' ');
}

/** True when the resume has nothing on it at all. */
export function isEmptyResume(resume: Resume): boolean {
  const { basics } = resume;
  const basicText = [basics.name, basics.headline, basics.email, basics.phone, basics.location, basics.website];
  return (
    basicText.every((value) => !value.trim()) &&
    basics.links.every((link) => !link.url.trim()) &&
    visibleSections(resume).length === 0
  );
}

/** A file name from the person's name: "jordan-ellis-resume". */
export function fileStem(resume: Resume): string {
  const slug = resume.basics.name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug ? `${slug}-resume` : 'resume';
}

/** "https://www.linkedin.com/in/x/" → "linkedin.com/in/x", for printing. */
export function displayUrl(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '');
}

/** A link target for a typed URL or address, or "" when it is not one. */
export function linkTarget(value: string): string {
  const text = value.trim();
  if (!text || /\s/.test(text)) {
    return '';
  }
  if (/^https?:\/\//i.test(text)) {
    return text;
  }
  if (/^mailto:/i.test(text)) {
    return text;
  }
  return /^[^@/]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(text) ? `https://${text}` : '';
}

// --- Settings ----------------------------------------------------------------

export type TemplateId = 'clarity' | 'heritage' | 'sidebar' | 'split' | 'compact' | 'spotlight';
export type FontPairingId = 'inter' | 'serif' | 'elegant' | 'geometric' | 'editorial';
export type Density = 'compact' | 'normal' | 'relaxed';
export type Paper = 'a4' | 'letter';

export interface ResumeSettings {
  template: TemplateId;
  accent: string;
  fonts: FontPairingId;
  density: Density;
  paper: Paper;
  /** Print the photo, on templates that have a place for one. */
  showPhoto: boolean;
}

export const TEMPLATE_IDS: readonly TemplateId[] = [
  'clarity',
  'heritage',
  'sidebar',
  'split',
  'compact',
  'spotlight',
];
export const FONT_PAIRING_IDS: readonly FontPairingId[] = [
  'inter',
  'serif',
  'elegant',
  'geometric',
  'editorial',
];
export const DENSITIES: readonly Density[] = ['compact', 'normal', 'relaxed'];

export const DEFAULT_SETTINGS: ResumeSettings = {
  template: 'clarity',
  accent: '#1f4e79',
  fonts: 'inter',
  density: 'normal',
  paper: 'a4',
  showPhoto: false,
};

/**
 * Regions whose usual paper is US Letter, from the Unicode CLDR measurement
 * data (the same list Wikipedia's Letter article footnotes). A4 everywhere else.
 */
const LETTER_REGIONS = new Set(['US', 'CA', 'MX', 'PH', 'PR', 'BZ', 'CL', 'CO', 'CR', 'SV', 'GT', 'NI', 'PA', 'VE']);

export function paperForLocale(locale: string): Paper {
  const region = /-([A-Za-z]{2})(?:-|$)/.exec(locale)?.[1]?.toUpperCase() ?? '';
  return LETTER_REGIONS.has(region) ? 'letter' : 'a4';
}

// --- Saving and loading --------------------------------------------------------

export const FILE_FORMAT = 'yydevtools-resume';
export const FILE_VERSION = 1;

export interface ResumeFile {
  format: typeof FILE_FORMAT;
  version: number;
  resume: Resume;
  settings: ResumeSettings;
}

export function toFile(resume: Resume, settings: ResumeSettings): ResumeFile {
  return { format: FILE_FORMAT, version: FILE_VERSION, resume, settings };
}

/** Limits on an imported file, so a hostile or broken one cannot hang the page. */
const MAX_TEXT = 5000;
const MAX_SECTIONS = 30;
const MAX_ENTRIES = 60;
const MAX_LINKS = 12;
/** About 1.5 MB of base64, far more than the 600px JPEG the photo picker makes. */
const MAX_PHOTO_CHARS = 2_000_000;

function text(value: unknown, max = MAX_TEXT): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function date(value: unknown): string {
  const raw = text(value, 10);
  return /^\d{4}(-(0[1-9]|1[0-2]))?$/.test(raw) ? raw : '';
}

function idOr(value: unknown, fallback: () => string): string {
  return typeof value === 'string' && /^[\w-]{1,40}$/.test(value) ? value : fallback();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function photo(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  return raw.length <= MAX_PHOTO_CHARS && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(raw)
    ? raw
    : '';
}

function isKind(value: unknown): value is SectionKind {
  return typeof value === 'string' && value in SECTION_KINDS;
}

/**
 * Rebuilds a resume from untrusted JSON: a file somebody picked, or what this
 * page left in localStorage last time (which can be hand-edited, or written
 * by an older version).
 *
 * Every field is copied by name and type-checked, so nothing unexpected rides
 * along into the state, a string where a list belongs becomes an empty list
 * rather than a crash, and ids are made unique again even if the file
 * repeated them.
 */
export function normalizeResume(input: unknown): Resume {
  const raw = record(input);
  const basics = record(raw['basics']);
  const seen = new Set<string>();
  const unique = (value: unknown): string => {
    let id = idOr(value, newId);
    while (seen.has(id)) {
      id = newId();
    }
    seen.add(id);
    return id;
  };

  const links = (Array.isArray(basics['links']) ? basics['links'] : [])
    .slice(0, MAX_LINKS)
    .map((link) => {
      const item = record(link);
      return { id: unique(item['id']), label: text(item['label'], 60), url: text(item['url'], 500) };
    });

  const sections = (Array.isArray(raw['sections']) ? raw['sections'] : [])
    .slice(0, MAX_SECTIONS)
    .map(record)
    .filter((section) => isKind(section['kind']))
    .map((section): ResumeSection => {
      const kind = section['kind'] as SectionKind;
      const id = unique(section['id']);
      let entries = (Array.isArray(section['entries']) ? section['entries'] : [])
        .slice(0, MAX_ENTRIES)
        .map(record)
        .map(
          (entry): ResumeEntry => ({
            id: unique(entry['id']),
            hidden: entry['hidden'] === true,
            title: text(entry['title'], 300),
            subtitle: text(entry['subtitle'], 300),
            location: text(entry['location'], 200),
            start: date(entry['start']),
            end: date(entry['end']),
            current: entry['current'] === true,
            url: text(entry['url'], 500),
            text: text(entry['text']),
            bullets: text(entry['bullets']),
          }),
        );
      if (SECTION_KINDS[kind].single) {
        entries = [entries[0] ?? emptyEntry(unique(undefined))];
      }
      return {
        id,
        kind,
        title: text(section['title'], 80) || SECTION_KINDS[kind].title,
        hidden: section['hidden'] === true,
        entries,
      };
    });

  return {
    basics: {
      name: text(basics['name'], 120),
      headline: text(basics['headline'], 200),
      email: text(basics['email'], 200),
      phone: text(basics['phone'], 80),
      location: text(basics['location'], 200),
      website: text(basics['website'], 500),
      links,
      photo: photo(basics['photo']),
    },
    sections,
  };
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function normalizeSettings(input: unknown): ResumeSettings {
  const raw = record(input);
  const accent = typeof raw['accent'] === 'string' && /^#[0-9a-f]{6}$/i.test(raw['accent'])
    ? raw['accent'].toLowerCase()
    : DEFAULT_SETTINGS.accent;
  return {
    template: pick(raw['template'], TEMPLATE_IDS, DEFAULT_SETTINGS.template),
    accent,
    fonts: pick(raw['fonts'], FONT_PAIRING_IDS, DEFAULT_SETTINGS.fonts),
    density: pick(raw['density'], DENSITIES, DEFAULT_SETTINGS.density),
    paper: pick(raw['paper'], ['a4', 'letter'] as const, DEFAULT_SETTINGS.paper),
    showPhoto: raw['showPhoto'] === true,
  };
}

export type ParseResult =
  | { ok: true; resume: Resume; settings: ResumeSettings }
  | { ok: false; error: string };

/** Reads a file this page exported. Says what is wrong rather than guessing. */
export function parseResumeFile(json: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: 'That file is not JSON, so it cannot be a saved resume.' };
  }
  const raw = record(data);
  if (raw['format'] !== FILE_FORMAT) {
    return {
      ok: false,
      error: 'That JSON was not saved by this Resume Builder. Export a resume from here first.',
    };
  }
  if (typeof raw['version'] !== 'number' || raw['version'] > FILE_VERSION) {
    return {
      ok: false,
      error: 'That file comes from a newer version of this page. Reload the page and try again.',
    };
  }
  return {
    ok: true,
    resume: normalizeResume(raw['resume']),
    settings: normalizeSettings(raw['settings']),
  };
}
