import { Tool } from '../../tools/tool.model';
import { TOOLS } from '../../tools/tools.data';

/** One navigable row. `index` is its position in the flat, top-to-bottom list. */
export interface PaletteItem {
  tool: Tool;
  index: number;
}

export interface PaletteSection {
  title: string;
  icon: string;
  items: PaletteItem[];
}

const BY_SLUG = new Map(TOOLS.map((tool) => [tool.slug, tool]));

function toTools(slugs: readonly string[]): Tool[] {
  return slugs.map((slug) => BY_SLUG.get(slug)).filter((tool): tool is Tool => tool !== undefined);
}

/**
 * Build the grouped, ordered rows shown in the palette. An empty query yields
 * Favourites + Recently-used shortcuts followed by every remaining tool; a
 * non-empty query yields a single ranked "Results" group. A running counter
 * numbers every row so keyboard navigation can address any of them by one flat
 * index regardless of how they are grouped.
 *
 * Unknown slugs (a stale favourite or recent that no longer maps to a tool) are
 * dropped, and a tool that is both starred and recent appears only under
 * Favourites.
 */
export function buildSections(
  rawQuery: string,
  favoriteSlugs: readonly string[],
  recentSlugs: readonly string[],
): PaletteSection[] {
  let running = 0;
  const number = (tools: Tool[]): PaletteItem[] =>
    tools.map((tool) => ({ tool, index: running++ }));

  const query = rawQuery.trim().toLowerCase();
  if (query !== '') {
    const ranked = rank(query);
    return ranked.length > 0 ? [{ title: 'Results', icon: 'matSearchOutline', items: number(ranked) }] : [];
  }

  const favorites = toTools(favoriteSlugs);
  const shortcut = new Set(favorites.map((tool) => tool.slug));
  const recents = toTools(recentSlugs).filter((tool) => !shortcut.has(tool.slug));
  recents.forEach((tool) => shortcut.add(tool.slug));
  const rest = TOOLS.filter((tool) => !shortcut.has(tool.slug));

  const sections: PaletteSection[] = [];
  if (favorites.length > 0) {
    sections.push({ title: 'Favourites', icon: 'matStarOutline', items: number(favorites) });
  }
  if (recents.length > 0) {
    sections.push({ title: 'Recently used', icon: 'matHistoryOutline', items: number(recents) });
  }
  sections.push({ title: 'All tools', icon: 'matAppsOutline', items: number(rest) });
  return sections;
}

/**
 * Rank tools for a query, best first. A name hit beats a description hit, and
 * within names an earlier match position wins — so "js" surfaces "JSON…" above a
 * tool that only mentions JS in its description. Ties keep catalog order, since
 * the sort is stable. Tools that match nowhere are dropped.
 */
export function rank(rawQuery: string): Tool[] {
  const query = rawQuery.trim().toLowerCase();
  if (query === '') {
    return [...TOOLS];
  }
  const scored: { tool: Tool; score: number }[] = [];
  for (const tool of TOOLS) {
    const name = tool.name.toLowerCase();
    const nameAt = name.indexOf(query);
    if (nameAt === 0) {
      scored.push({ tool, score: 0 });
    } else if (nameAt > 0) {
      scored.push({ tool, score: 1 + nameAt / 100 });
    } else if (tool.description.toLowerCase().includes(query)) {
      scored.push({ tool, score: 100 });
    } else if (tool.category.toLowerCase().includes(query)) {
      scored.push({ tool, score: 200 });
    }
  }
  return scored.sort((a, b) => a.score - b.score).map((entry) => entry.tool);
}
