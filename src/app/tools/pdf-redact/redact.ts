/**
 * Redaction boxes and how they are found. Pure, so the substring geometry —
 * the part that would silently black out the wrong word — has a test.
 */
import type { PageTextItem } from '../../core/pdf-render';

/** A box as fractions of the unrotated page, origin top-left. */
export interface Box {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Extra cover around a found word, as a fraction of its height. */
const PAD = 0.15;

/**
 * Boxes over every occurrence of `query` in the page's text runs (case-
 * insensitive). A hit inside a longer run is placed by the proportion of the
 * run it occupies — exact for monospaced text and close enough for the rest
 * once padded.
 */
export function findBoxes(
  page: number,
  items: PageTextItem[],
  query: string,
  size: { width: number; height: number },
): Box[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const boxes: Box[] = [];
  for (const item of items) {
    const text = item.str.toLowerCase();
    let from = 0;
    for (;;) {
      const at = text.indexOf(needle, from);
      if (at < 0) {
        break;
      }
      const startFrac = at / text.length;
      const endFrac = (at + needle.length) / text.length;
      const pad = item.height * PAD;
      const x = item.x + item.width * startFrac - pad;
      const width = item.width * (endFrac - startFrac) + pad * 2;
      const bottom = item.y - pad;
      const height = item.height + pad * 2;
      boxes.push({
        page,
        x: x / size.width,
        y: 1 - (bottom + height) / size.height,
        width: width / size.width,
        height: height / size.height,
      });
      from = at + needle.length;
    }
  }
  return boxes;
}

/** The box between two drag points (fractions), clamped to the page. */
export function dragBox(
  page: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): Box {
  const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
  const x1 = clamp(Math.min(a.x, b.x));
  const y1 = clamp(Math.min(a.y, b.y));
  const x2 = clamp(Math.max(a.x, b.x));
  const y2 = clamp(Math.max(a.y, b.y));
  return { page, x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
