import {
  DEFAULT_SETTINGS,
  bulletLines,
  dateRange,
  emptyEntry,
  emptyResume,
  fileStem,
  formatYearMonth,
  isEmptyResume,
  joinYearMonth,
  linkTarget,
  listItems,
  move,
  moveEntry,
  moveSection,
  newSection,
  normalizeResume,
  normalizeSettings,
  paperForLocale,
  parseResumeFile,
  splitYearMonth,
  toFile,
  updateEntry,
  visibleSections,
  type Resume,
} from './resume';
import { exampleResume } from './resume-example';

describe('move', () => {
  it('moves an item up and down by one', () => {
    expect(move(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(move(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('returns the very same array when nothing can move', () => {
    const items = ['a', 'b'];
    expect(move(items, 0, -1)).toBe(items);
    expect(move(items, 1, 1)).toBe(items);
    expect(move(items, -1, 1)).toBe(items);
  });

  it('clamps a long move to the end', () => {
    expect(move(['a', 'b', 'c'], 0, 9)).toEqual(['b', 'c', 'a']);
  });
});

describe('moving sections and entries', () => {
  it('reorders sections and leaves the rest of the resume alone', () => {
    const resume = emptyResume();
    const ids = resume.sections.map((section) => section.id);
    const moved = moveSection(resume, ids[1], 1);
    expect(moved.sections.map((section) => section.id)).toEqual([ids[0], ids[2], ids[1], ids[3]]);
    expect(moved.basics).toBe(resume.basics);
    expect(moveSection(resume, ids[0], -1)).toBe(resume);
  });

  it('reorders entries within their own section only', () => {
    const resume = exampleResume();
    const experience = resume.sections.find((section) => section.kind === 'experience')!;
    const [first, second] = experience.entries;
    const moved = moveEntry(resume, experience.id, first.id, 1);
    const after = moved.sections.find((section) => section.id === experience.id)!;
    expect(after.entries.slice(0, 2).map((entry) => entry.id)).toEqual([second.id, first.id]);
    expect(moved.sections.filter((section) => section.id !== experience.id)).toEqual(
      resume.sections.filter((section) => section.id !== experience.id),
    );
  });

  it('updates one entry and never its id', () => {
    const resume = exampleResume();
    const section = resume.sections[1];
    const entry = section.entries[0];
    const updated = updateEntry(resume, section.id, entry.id, { title: 'CTO', id: 'other' } as never);
    const after = updated.sections[1].entries[0];
    expect(after.title).toBe('CTO');
    expect(after.id).toBe(entry.id);
  });
});

describe('dates', () => {
  it('formats months and bare years', () => {
    expect(formatYearMonth('2024-05')).toBe('May 2024');
    expect(formatYearMonth('2024')).toBe('2024');
    expect(formatYearMonth('2024-13')).toBe('2024');
    expect(formatYearMonth('May 2024')).toBe('');
  });

  it('writes a range with an en dash and "Present"', () => {
    expect(dateRange({ start: '2021-03', end: '', current: true })).toBe('Mar 2021 – Present');
    expect(dateRange({ start: '2018-01', end: '2021-02', current: false })).toBe('Jan 2018 – Feb 2021');
  });

  it('prints a lone start or end without a dangling dash', () => {
    expect(dateRange({ start: '2020', end: '', current: false })).toBe('2020');
    expect(dateRange({ start: '', end: '2016-06', current: false })).toBe('Jun 2016');
    expect(dateRange({ start: '2020-01', end: '2020-01', current: false })).toBe('Jan 2020');
    expect(dateRange({ start: '', end: '', current: false })).toBe('');
  });

  it('round-trips the two date pickers, and drops a month with no year', () => {
    expect(splitYearMonth('2019-07')).toEqual({ year: '2019', month: '07' });
    expect(joinYearMonth('2019', '07')).toBe('2019-07');
    expect(joinYearMonth('2019', '')).toBe('2019');
    expect(joinYearMonth('', '07')).toBe('');
  });
});

describe('reading entries', () => {
  it('takes typed bullet markers off and drops blank lines', () => {
    expect(bulletLines('- one\n\n• two\r\n  * three\nfour')).toEqual(['one', 'two', 'three', 'four']);
  });

  it('splits skills on commas, semicolons and lines', () => {
    expect(listItems('Go, SQL;TypeScript\n  Rust ,')).toEqual(['Go', 'SQL', 'TypeScript', 'Rust']);
  });

  it('leaves hidden sections, hidden entries and blank entries off the page', () => {
    const resume = exampleResume();
    resume.sections[0].hidden = true;
    resume.sections[1].entries[0].hidden = true;
    resume.sections[2].entries.push(emptyEntry('blank'));
    const visible = visibleSections(resume);
    expect(visible.map((section) => section.kind)).not.toContain('summary');
    expect(visible[0].entries).toHaveLength(resume.sections[1].entries.length - 1);
    expect(visible[1].entries.map((entry) => entry.id)).not.toContain('blank');
  });

  it('calls a resume empty until something printable is in it', () => {
    const resume = emptyResume();
    expect(isEmptyResume(resume)).toBe(true);
    resume.basics.links.push({ id: 'l', label: 'GitHub', url: '' });
    expect(isEmptyResume(resume)).toBe(true);
    resume.basics.name = 'Ada';
    expect(isEmptyResume(resume)).toBe(false);
  });
});

describe('names and links', () => {
  it('makes a file name from the person', () => {
    expect(fileStem({ ...emptyResume(), basics: { ...emptyResume().basics, name: 'Zoë  O’Brien-Smith' } })).toBe(
      'zoe-o-brien-smith-resume',
    );
    expect(fileStem(emptyResume())).toBe('resume');
  });

  it('links a typed address only when it is one', () => {
    expect(linkTarget('github.com/ada')).toBe('https://github.com/ada');
    expect(linkTarget('https://x.dev')).toBe('https://x.dev');
    expect(linkTarget('not a link')).toBe('');
    expect(linkTarget('javascript:alert(1)')).toBe('');
  });

  it('picks Letter for North America and A4 elsewhere', () => {
    expect(paperForLocale('en-US')).toBe('letter');
    expect(paperForLocale('fr-CA')).toBe('letter');
    expect(paperForLocale('en-GB')).toBe('a4');
    expect(paperForLocale('de')).toBe('a4');
    expect(paperForLocale('es-MX')).toBe('letter');
    expect(paperForLocale('zh-Hant-TW')).toBe('a4');
  });
});

describe('the saved file', () => {
  it('round-trips through JSON exactly', () => {
    const resume = exampleResume();
    const settings = { ...DEFAULT_SETTINGS, template: 'sidebar' as const, accent: '#0f766e', showPhoto: true };
    const parsed = parseResumeFile(JSON.stringify(toFile(resume, settings)));
    expect(parsed).toEqual({ ok: true, resume, settings });
  });

  it('refuses JSON it did not write, and says why', () => {
    expect(parseResumeFile('{nope')).toMatchObject({ ok: false, error: expect.stringContaining('not JSON') });
    expect(parseResumeFile('{"basics":{}}')).toMatchObject({ ok: false, error: expect.stringContaining('not saved by') });
    expect(parseResumeFile('{"format":"yydevtools-resume","version":99}')).toMatchObject({
      ok: false,
      error: expect.stringContaining('newer version'),
    });
  });

  it('repairs a hand-edited file instead of trusting it', () => {
    const resume = normalizeResume({
      basics: { name: 42, links: 'none', photo: 'data:text/html;base64,PHNjcmlwdD4=' },
      sections: [
        { id: 'same', kind: 'experience', entries: [{ id: 'same', start: 'May 2020', bullets: ['x'] }, null] },
        { id: 'x', kind: 'not-a-kind', entries: [] },
        { kind: 'summary', entries: [] },
      ],
    });
    expect(resume.basics.name).toBe('');
    expect(resume.basics.links).toEqual([]);
    expect(resume.basics.photo).toBe('');
    expect(resume.sections.map((section) => section.kind)).toEqual(['experience', 'summary']);
    const [first, second] = resume.sections[0].entries;
    expect(first.start).toBe('');
    expect(first.bullets).toBe('');
    expect(first.id).not.toBe(resume.sections[0].id);
    expect(second.title).toBe('');
    // A summary always has its one entry, even when the file had none.
    expect(resume.sections[1].entries).toHaveLength(1);
    expect(resume.sections[1].title).toBe('Summary');
  });

  it('keeps settings inside their allowed values', () => {
    expect(normalizeSettings({ template: 'fancy', accent: 'red', fonts: 'comic', density: 'tight', paper: 'a3' })).toEqual(
      DEFAULT_SETTINGS,
    );
    expect(normalizeSettings({ accent: '#ABCDEF', showPhoto: true }).accent).toBe('#abcdef');
  });
});

describe('the starting points', () => {
  it('starts empty with fixed ids, so the prerendered page and the live one agree', () => {
    expect(emptyResume()).toEqual(emptyResume());
    expect(emptyResume().sections.map((section) => section.id)).toEqual([
      's-summary',
      's-experience',
      's-education',
      's-skills',
    ]);
  });

  it('gives a new summary its single entry and other sections none', () => {
    expect(newSection('summary', 'x').entries).toHaveLength(1);
    expect(newSection('projects', 'y').entries).toHaveLength(0);
  });

  it('has an example with every kind of section filled in', () => {
    const example: Resume = exampleResume();
    expect(new Set(visibleSections(example).map((section) => section.kind))).toEqual(
      new Set(['summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'languages']),
    );
    expect(example.basics.email.endsWith('@example.com')).toBe(true);
  });
});
