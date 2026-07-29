import { describe, expect, it } from 'vitest';

import { TOOLS } from '../../tools/tools.data';
import { PaletteSection, buildSections, rank } from './command-palette.search';

const flat = (sections: PaletteSection[]) => sections.flatMap((s) => s.items);

describe('rank', () => {
  it('returns the whole catalog, in order, for an empty query', () => {
    expect(rank('').map((t) => t.slug)).toEqual(TOOLS.map((t) => t.slug));
    expect(rank('   ')).toHaveLength(TOOLS.length);
  });

  it('drops everything when nothing matches', () => {
    expect(rank('zzznotarealtool')).toEqual([]);
  });

  it('puts a name-prefix match first', () => {
    expect(rank('json')[0].name.toLowerCase().startsWith('json')).toBe(true);
  });

  it('orders every name match ahead of description-only matches', () => {
    const results = rank('format');
    const isNameMatch = (name: string) => name.toLowerCase().includes('format');
    const firstDescOnly = results.findIndex((t) => !isNameMatch(t.name));
    // Once the ranking crosses into description-only hits, no name hit follows.
    if (firstDescOnly !== -1) {
      expect(results.slice(firstDescOnly).some((t) => isNameMatch(t.name))).toBe(false);
    }
  });

  it('is case-insensitive and trims surrounding space', () => {
    expect(rank('  JSON  ').map((t) => t.slug)).toEqual(rank('json').map((t) => t.slug));
  });

  it('falls back to a category match', () => {
    const results = rank('document');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((t) => t.category === 'Document')).toBe(true);
  });
});

describe('buildSections', () => {
  it('shows a single "All tools" group when there are no shortcuts', () => {
    const sections = buildSections('', [], []);
    expect(sections.map((s) => s.title)).toEqual(['All tools']);
    expect(flat(sections)).toHaveLength(TOOLS.length);
  });

  it('lifts favourites into their own group and out of "All tools"', () => {
    const sections = buildSections('', ['hash-generator'], []);
    expect(sections[0].title).toBe('Favourites');
    expect(sections[0].items.map((i) => i.tool.slug)).toEqual(['hash-generator']);
    const all = sections.find((s) => s.title === 'All tools')!;
    expect(all.items.some((i) => i.tool.slug === 'hash-generator')).toBe(false);
  });

  it('numbers rows contiguously from zero across all groups', () => {
    const sections = buildSections('', ['hash-generator'], ['json-formatter']);
    const items = flat(sections);
    expect(items.map((i) => i.index)).toEqual(items.map((_, n) => n));
  });

  it('shows a tool that is both starred and recent only under Favourites', () => {
    const sections = buildSections('', ['hash-generator'], ['hash-generator']);
    const appearances = flat(sections).filter((i) => i.tool.slug === 'hash-generator');
    expect(appearances).toHaveLength(1);
    expect(sections.find((s) => s.title === 'Recently used')).toBeUndefined();
  });

  it('ignores slugs that no longer map to a tool', () => {
    const sections = buildSections('', ['not-a-real-slug'], []);
    expect(sections.map((s) => s.title)).toEqual(['All tools']);
    expect(flat(sections)).toHaveLength(TOOLS.length);
  });

  it('collapses to a ranked "Results" group once a query is typed', () => {
    const sections = buildSections('json', ['hash-generator'], ['sql-formatter']);
    expect(sections.map((s) => s.title)).toEqual(['Results']);
    expect(sections[0].items[0].tool.name.toLowerCase()).toContain('json');
  });

  it('returns no groups when a query matches nothing', () => {
    expect(buildSections('zzznotarealtool', [], [])).toEqual([]);
  });
});
