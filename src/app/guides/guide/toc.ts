/**
 * Choosing which entry in a guide's contents list to highlight.
 *
 * This is separated from the component because it is the only part with any
 * real logic in it, and because the alternative — checking it by scrolling a
 * browser — is not something a test can do reliably.
 */

export interface TocEntry {
  id: string;
  text: string;
  /** True for an h3, which is rendered indented beneath its h2. */
  sub: boolean;
}

/**
 * The entry for the section currently being read: the **last heading scrolled
 * past**, rather than whichever heading happens to be on screen.
 *
 * The difference matters. The obvious implementation asks which heading sits
 * inside a band near the top of the viewport, and it fails in practice: a
 * section is usually far taller than any such band, so for most of the time
 * spent reading one there is no heading inside it and nothing gets highlighted.
 * Walking the list and keeping the last one whose top has passed the offset
 * always yields the section the reader is actually inside.
 *
 * Returns null before the first heading is reached, which is correct — at the
 * top of the article the reader is in the introduction, not in any section.
 *
 * @param entries   The headings, in document order.
 * @param topOf     Viewport-relative top of a heading, or null if it is absent.
 * @param offset    How far down the viewport counts as "reached", in pixels.
 */
export function activeHeadingId(
  entries: readonly TocEntry[],
  topOf: (id: string) => number | null,
  offset: number,
): string | null {
  let current: string | null = null;
  for (const entry of entries) {
    const top = topOf(entry.id);
    if (top !== null && top <= offset) {
      current = entry.id;
    }
  }
  return current;
}
