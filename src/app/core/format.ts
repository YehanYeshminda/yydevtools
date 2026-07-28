/**
 * Formatting shared by the tools. Pure and dependency-free, so it is equally at
 * home in a component, a worker or a test.
 */

/**
 * A byte count as a short human-readable string ("1.4 MB").
 *
 * Values below 10 keep one decimal place, since the difference between 1.4 and
 * 1.9 MB matters when you are looking at a compression result; above that it
 * rounds, because "347 KB" reads better than "347.2 KB".
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded =
    value >= 10 || Number.isInteger(value) ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

/**
 * The one-line description of a loaded document. The page count is dropped when
 * it is unknown, which reads better than "? pages" and is honest about it.
 */
export function describeFile(name: string, pageCount: number | null, size: number): string {
  const parts = [name];
  if (pageCount !== null) {
    parts.push(`${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`);
  }
  parts.push(formatBytes(size));
  return parts.join(' · ');
}
