import { DEFAULT_SETTINGS, TEMPLATE_IDS, emptyResume, type ResumeSettings, type TemplateId } from './resume';
import { exampleResume } from './resume-example';
import {
  FONT_FAMILIES,
  FONT_PAIRINGS,
  TEMPLATES,
  breakBefore,
  buildDocument,
  contrast,
  familiesFor,
  glue,
  missingGlyphs,
  readableOn,
  textOn,
  type Content,
} from './resume-layout';

const PHOTO = 'data:image/png;base64,iVBORw0KGgo=';

function settings(template: TemplateId, extra: Partial<ResumeSettings> = {}): ResumeSettings {
  return { ...DEFAULT_SETTINGS, template, ...extra };
}

/** Every node in a document, depth first. */
function nodes(content: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(content)) {
    content.forEach((child) => nodes(child, out));
  } else if (content && typeof content === 'object') {
    const node = content as Record<string, unknown>;
    out.push(node);
    for (const key of ['stack', 'columns', 'text', 'ul', 'table', 'body']) {
      if (key in node) {
        nodes(node[key], out);
      }
    }
  }
  return out;
}

/** Every string drawn, in document order. */
function strings(content: unknown, out: string[] = []): string[] {
  if (typeof content === 'string') {
    out.push(content);
  } else if (Array.isArray(content)) {
    content.forEach((child) => strings(child, out));
  } else if (content && typeof content === 'object') {
    const node = content as Record<string, unknown>;
    for (const key of ['stack', 'columns', 'text', 'ul', 'table', 'body']) {
      if (key in node) {
        strings(node[key], out);
      }
    }
  }
  return out;
}

describe('colour', () => {
  it('darkens a pale accent until it reads as text on white', () => {
    const pale = '#7dd3fc';
    expect(contrast(pale, '#ffffff')).toBeLessThan(4.5);
    expect(contrast(readableOn(pale), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves an already readable accent exactly as it is', () => {
    expect(readableOn('#1f4e79')).toBe('#1f4e79');
  });

  it('writes white on dark fills and ink on light ones', () => {
    expect(textOn('#1f4e79')).toBe('#ffffff');
    expect(textOn('#fde68a')).not.toBe('#ffffff');
  });
});

describe('fonts', () => {
  it('names only families that exist, and only the ones a pairing uses', () => {
    for (const pairing of Object.values(FONT_PAIRINGS)) {
      for (const family of familiesFor(pairing.id)) {
        expect(FONT_FAMILIES[family]).toBeDefined();
      }
    }
    expect(familiesFor('inter')).toEqual(['Inter', 'InterSemi']);
  });

  it('gives every template a pairing that exists', () => {
    for (const template of TEMPLATES) {
      expect(FONT_PAIRINGS[template.fonts]).toBeDefined();
    }
    expect(TEMPLATES.map((template) => template.id)).toEqual(TEMPLATE_IDS);
  });
});

describe('missing glyphs', () => {
  it('finds nothing to warn about in European names', () => {
    expect(missingGlyphs('Zoë Łukasz Dvořák, Ελένη, Жанна, Nguyễn – São Paulo', 'inter')).toEqual([]);
  });

  it('names the characters no font here can draw', () => {
    expect(missingGlyphs('Nimal ජයසිංහ', 'inter')).toEqual(['ජ', 'ය', 'ස', 'ි', 'ං', 'හ']);
    expect(missingGlyphs('東京', 'serif')).toEqual(['東', '京']);
  });

  it('checks every font in the pairing, not just the body', () => {
    // Source Sans has Greek; Playfair, the heading face, does not.
    expect(missingGlyphs('Ελένη', 'elegant')).toContain('λ');
    expect(missingGlyphs('Ελένη', 'editorial')).toEqual([]);
  });
});

describe('page breaks', () => {
  const at = (verticalRatio: number, pageNumbers: number[], id = 'keep-3') => ({
    id,
    pageNumbers,
    startPosition: { verticalRatio },
  });

  it('moves a kept block that would straddle two pages', () => {
    expect(breakBefore(at(0.8, [1, 2]))).toBe(true);
  });

  it('leaves a block that fits, or one already at the top of a page', () => {
    expect(breakBefore(at(0.8, [1]))).toBe(false);
    // Taller than a page: moving it would only move the split, forever.
    expect(breakBefore(at(0, [2, 3]))).toBe(false);
  });

  it('ignores blocks nobody asked to keep together', () => {
    expect(breakBefore(at(0.8, [1, 2], 'paragraph'))).toBe(false);
    expect(breakBefore({ pageNumbers: [1, 2], startPosition: { verticalRatio: 0.8 } })).toBe(false);
  });

  it('keeps every section heading in one block with its first entry', () => {
    for (const template of TEMPLATE_IDS) {
      const doc = buildDocument({ resume: exampleResume(), settings: settings(template), roundPhoto: '' });
      const kept = nodes(doc.content).filter((node) => typeof node['id'] === 'string' && String(node['id']).startsWith('keep-'));
      const allText = strings(doc.content).join(' ');
      // The Experience heading and the first job title are drawn in the same kept block.
      const withHeading = kept.find((node) => strings(node).some((text) => /^experience$/i.test(text.trim())));
      expect(withHeading, template).toBeDefined();
      expect(strings(withHeading).join(' '), template).toContain('Senior Software Engineer');
      expect(allText).toContain('Junior Developer');
    }
  });

  it('wires the hook into the document', () => {
    const doc = buildDocument({ resume: exampleResume(), settings: settings('clarity'), roundPhoto: '' });
    expect(doc['pageBreakBefore']).toBe(breakBefore);
  });
});

describe('the documents', () => {
  it('puts the name first and the sections in the order the visitor chose', () => {
    const resume = exampleResume();
    resume.sections.reverse();
    for (const template of ['clarity', 'heritage', 'compact', 'spotlight'] as const) {
      const text = strings(buildDocument({ resume, settings: settings(template), roundPhoto: '' }).content);
      const index = (pattern: RegExp) => text.findIndex((item) => pattern.test(item.trim()));
      expect(index(/^Jordan Ellis$/), template).toBe(0);
      expect(index(/^languages$/i), template).toBeLessThan(index(/^experience$/i));
      expect(index(/^experience$/i), template).toBeLessThan(index(/^summary$/i));
    }
  });

  it('never puts an image in the ATS template, photo or not', () => {
    const doc = buildDocument({
      resume: exampleResume(),
      settings: settings('clarity', { showPhoto: true }),
      roundPhoto: PHOTO,
    });
    expect(nodes(doc.content).some((node) => 'image' in node)).toBe(false);
    expect(nodes(doc.content).some((node) => 'columns' in node && strings(node).length > 2)).toBe(false);
  });

  it('shows the photo only on designs with a place for it, and only when asked', () => {
    const has = (template: TemplateId, showPhoto: boolean, photo = PHOTO) =>
      nodes(buildDocument({ resume: exampleResume(), settings: settings(template, { showPhoto }), roundPhoto: photo }).content).some(
        (node) => node['image'] === PHOTO,
      );
    for (const template of TEMPLATES) {
      expect(has(template.id, true), template.id).toBe(template.photo);
      expect(has(template.id, false), template.id).toBe(false);
    }
    expect(has('sidebar', true, '')).toBe(false);
  });

  it('builds a valid page for an empty resume', () => {
    for (const template of TEMPLATE_IDS) {
      const doc = buildDocument({ resume: emptyResume(), settings: settings(template), roundPhoto: '' });
      expect(Array.isArray(doc.content), template).toBe(true);
      expect(doc.pageSize).toBe('A4');
    }
  });

  it('uses the chosen paper size and names the file in its metadata', () => {
    const doc = buildDocument({ resume: exampleResume(), settings: settings('split', { paper: 'letter' }), roundPhoto: '' });
    expect(doc.pageSize).toBe('LETTER');
    expect(doc['info']).toMatchObject({ title: 'Jordan Ellis – Resume', author: 'Jordan Ellis' });
  });

  it('prints hidden sections nowhere', () => {
    const resume = exampleResume();
    resume.sections.find((section) => section.kind === 'projects')!.hidden = true;
    for (const template of TEMPLATE_IDS) {
      const text = strings(buildDocument({ resume, settings: settings(template), roundPhoto: '' }).content).join(' ');
      expect(text, template).not.toContain('Ledgerline');
    }
  });

  it('links contact details, and never links a link that is not one', () => {
    const resume = exampleResume();
    resume.basics.website = 'javascript:alert(1)';
    const links = nodes(buildDocument({ resume, settings: settings('clarity'), roundPhoto: '' }).content)
      .map((node) => node['link'])
      .filter(Boolean);
    expect(links).toContain('mailto:jordan.ellis@example.com');
    expect(links).toContain('https://github.com/jordan-ellis-example');
    expect(links.some((link) => String(link).startsWith('javascript:'))).toBe(false);
  });

  it('glues a separator to the item before it so no line starts with one', () => {
    expect(glue('  ·  ').codePointAt(0)).toBe(0xa0);
    expect(glue('  ·  ').endsWith(' ')).toBe(true);
  });
});

/** Keeps the helpers' types honest. */
export type { Content };
