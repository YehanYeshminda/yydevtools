/**
 * The page list an Organizer session is editing, and the operations on it.
 *
 * Everything here is pure and works on plain arrays, which is the point: the
 * component owns thumbnails, drag gestures and canvases, while the part that
 * decides what the finished document contains is separately testable. Getting
 * "move page 12 before page 3" wrong is invisible until someone opens the
 * export, so it is worth pinning down here.
 *
 * A page is either a reference into one of the loaded documents or a blank
 * inserted by the user. Nothing is copied until the export runs — reordering a
 * 300-page scan just permutes an array of small records.
 */

/** Quarter-turns clockwise, on top of whatever rotation the page already has. */
export type Rotation = 0 | 90 | 180 | 270;

export interface SourcePage {
  kind: 'source';
  id: string;
  /** Index of the document this page came from. */
  doc: number;
  /** 0-based page index within that document. */
  index: number;
  rotation: Rotation;
  /** Page size in points, used to size an inserted blank to match. */
  width: number;
  height: number;
}

export interface BlankPage {
  kind: 'blank';
  id: string;
  rotation: Rotation;
  width: number;
  height: number;
}

export type Page = SourcePage | BlankPage;

/** A4 in points, for a blank inserted when there is nothing to copy a size from. */
export const A4 = { width: 595.28, height: 841.89 } as const;

/**
 * Moves the page at `from` so that it sits at `to`.
 *
 * `to` is interpreted against the list *after* the page has been lifted out,
 * which is what a drag gesture means by a drop position — dragging page 1 to
 * the end should put it last, not one short of last.
 */
export function movePage(pages: readonly Page[], from: number, to: number): Page[] {
  if (from < 0 || from >= pages.length || from === to) {
    return pages as Page[];
  }
  const next = pages.slice();
  const [moved] = next.splice(from, 1);
  next.splice(clamp(to, 0, next.length), 0, moved);
  return next;
}

/** Rotates the given pages by `quarterTurns` (may be negative). */
export function rotatePages(
  pages: readonly Page[],
  ids: ReadonlySet<string>,
  quarterTurns: number,
): Page[] {
  if (ids.size === 0 || quarterTurns === 0) {
    return pages as Page[];
  }
  return pages.map((page) =>
    ids.has(page.id) ? { ...page, rotation: addTurns(page.rotation, quarterTurns) } : page,
  );
}

/** Normalises any number of quarter-turns onto 0/90/180/270. */
export function addTurns(rotation: Rotation, quarterTurns: number): Rotation {
  const turns = (((rotation / 90 + quarterTurns) % 4) + 4) % 4;
  return (turns * 90) as Rotation;
}

export function removePages(pages: readonly Page[], ids: ReadonlySet<string>): Page[] {
  return ids.size === 0 ? (pages as Page[]) : pages.filter((page) => !ids.has(page.id));
}

/**
 * Inserts a blank page after `index` (use -1 for the very start).
 *
 * The blank takes the size of the page it follows, so a blank dropped into a
 * document of landscape scans is landscape too rather than an A4 surprise.
 */
export function insertBlankAfter(pages: readonly Page[], index: number, id: string): Page[] {
  const neighbour = pages[index] ?? pages[pages.length - 1] ?? null;
  const blank: BlankPage = {
    kind: 'blank',
    id,
    rotation: 0,
    width: neighbour?.width ?? A4.width,
    height: neighbour?.height ?? A4.height,
  };
  const next = pages.slice();
  next.splice(clamp(index + 1, 0, next.length), 0, blank);
  return next;
}

/** Reverses the whole list — the quick fix for a back-to-front scan. */
export function reversePages(pages: readonly Page[]): Page[] {
  return pages.slice().reverse();
}

/**
 * Builds the page list for a freshly loaded document.
 *
 * `startId` keeps ids unique across several documents loaded into one session.
 */
export function pagesForDocument(
  doc: number,
  sizes: ReadonlyArray<{ width: number; height: number }>,
  startId: number,
): Page[] {
  return sizes.map((size, index) => ({
    kind: 'source',
    id: `p${startId + index}`,
    doc,
    index,
    rotation: 0,
    width: size.width,
    height: size.height,
  }));
}

/** How many pages of the finished document come from each source. */
export function countByDocument(pages: readonly Page[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const page of pages) {
    if (page.kind === 'source') {
      counts.set(page.doc, (counts.get(page.doc) ?? 0) + 1);
    }
  }
  return counts;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
