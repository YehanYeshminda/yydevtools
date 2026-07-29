/**
 * Writes sitemap.xml from whatever the prerender pass actually produced.
 *
 * Deriving it from the output directory rather than from a hand-kept list means
 * the sitemap cannot drift out of step with the routes: add a route, it gets
 * prerendered, it lands here.
 *
 * Runs after `ng build` — see the "build" script in package.json.
 */
import { readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const SITE_URL = 'https://yydevtools.com';
const OUT_DIR = 'dist/yydevtools/browser';

/** Prerendered but deliberately not indexed. */
const EXCLUDED = new Set(['/404']);

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

const lastmod = new Date().toISOString().slice(0, 10);

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (route) => `  <url>
    <loc>${SITE_URL}${route === '/' ? '/' : route}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${priorityFor(route)}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`;

await writeFile(join(OUT_DIR, 'sitemap.xml'), xml, 'utf8');
console.log(`sitemap.xml: ${routes.length} URLs`);
