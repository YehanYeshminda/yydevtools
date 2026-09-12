/**
 * Writes sitemap.xml from whatever the prerender pass actually produced.
 *
 * Deriving it from the output directory rather than from a hand-kept list means
 * the sitemap cannot drift out of step with the routes: add a route, it gets
 * prerendered, it lands here.
 *
 * Runs after `ng build` — see the "build" script in package.json.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const SITE_URL = 'https://yydevtools.com';
const OUT_DIR = 'dist/yydevtools/browser';

/**
 * Prerendered but deliberately not indexed, so they must not be advertised in
 * the sitemap either — a sitemap that lists a `noindex` page sends a crawler a
 * contradiction. Keep this in step with the `noindex: true` route data.
 */
const EXCLUDED = new Set(['/404', '/news']);

/** Home first, then tools, then the rest — purely for a readable file. */
function priorityFor(path) {
  if (path === '/') return '1.0';
  if (path.startsWith('/tools/')) return '0.8';
  return '0.5';
}

async function findRoutes(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const routes = [];

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      routes.push(...(await findRoutes(full, base)));
    } else if (entry.name === 'index.html') {
      const rel = relative(base, dir).split(sep).join('/');
      routes.push(rel === '' ? '/' : `/${rel}`);
    }
  }

  return routes;
}

const routes = (await findRoutes(OUT_DIR))
  .filter((route) => !EXCLUDED.has(route))
  .sort((a, b) => a.localeCompare(b));

// Guides carry a real "updated" date in their data file; every other page has
// no honest date to give, and a build timestamp on all 67 URLs only teaches
// Google to ignore the field. So: guides get their date, the rest get none.
// Split on the guide-level `slug:` (four-space indent) so a tool slug quoted
// inside a guide's body cannot be paired with the wrong date.
const guideDates = new Map(
  (await readFile('src/app/guides/guides.data.ts', 'utf8'))
    .split("\n    slug: '")
    .slice(1)
    .map((block) => [
      `/guides/${block.slice(0, block.indexOf("'"))}`,
      block.match(/\n    updated: '(\d{4}-\d{2}-\d{2})'/)?.[1],
    ])
    .filter(([, date]) => date),
);
const lastmodFor = (route) => {
  const date = guideDates.get(route);
  return date ? `\n    <lastmod>${date}</lastmod>` : '';
};

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (route) => `  <url>
    <loc>${SITE_URL}${route === '/' ? '/' : route}</loc>${lastmodFor(route)}
    <priority>${priorityFor(route)}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`;

await writeFile(join(OUT_DIR, 'sitemap.xml'), xml, 'utf8');
console.log(`sitemap.xml: ${routes.length} URLs`);
