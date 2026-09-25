/**
 * The canonical form of a page path, or `null` when the path already is one.
 *
 * Every page is served at exactly one URL: no trailing slash, and never the
 * `/index.html` file behind it. The canonical tags and the sitemap already say
 * so. Left to itself, the asset server's `drop-trailing-slash` handling still
 * answers `/tools/x/` and `/tools/x/index.html` with a 307, which a search
 * engine treats as temporary and may keep indexing. The Worker answers these
 * with a 301 instead, so the signal is consolidated on the one real URL.
 */
export function canonicalPath(path: string): string | null {
  const clean = path.replace(/\/index\.html$/, '/').replace(/\/+$/, '') || '/';
  return clean === path ? null : clean;
}
