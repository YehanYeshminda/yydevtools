/**
 * Prints what the Worker has been counting — which pages, and which tools, people
 * actually open.
 *
 * Reads the daily hashes written by worker/stats.ts straight from Upstash over
 * its REST API. It is a local script rather than an endpoint on the site on
 * purpose: an endpoint would be public surface to guard and a secret to rotate,
 * for a report that is read occasionally by one person who already has the
 * token.
 *
 *   npm run stats           # last 30 days
 *   npm run stats -- 7      # last 7 days
 *
 * The token comes from UPSTASH_REDIS_REST_TOKEN in the environment, falling back
 * to .dev.vars (gitignored). The URL is read from wrangler.jsonc so there is one
 * source of truth for it.
 */
import { readFile } from 'node:fs/promises';

const DAYS = Number(process.argv[2] ?? 30);
const KEY_PREFIX = 'yydevtools:stats:';

async function readDevVar(name) {
  try {
    const text = await readFile('.dev.vars', 'utf8');
    // Values in .dev.vars are commonly quoted; the quotes are not part of the token.
    return text
      .match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, '');
  } catch {
    return undefined;
  }
}

async function resolveUrl() {
  if (process.env.UPSTASH_REDIS_REST_URL) {
    return process.env.UPSTASH_REDIS_REST_URL;
  }
  const config = await readFile('wrangler.jsonc', 'utf8');
  return config.match(/"UPSTASH_REDIS_REST_URL":\s*"([^"]+)"/)?.[1];
}

/** HGETALL comes back either as a flat [field, value, ...] array or as an object. */
function toCounts(result) {
  if (!result) return {};
  if (Array.isArray(result)) {
    const out = {};
    for (let i = 0; i + 1 < result.length; i += 2) {
      out[result[i]] = Number(result[i + 1]);
    }
    return out;
  }
  return Object.fromEntries(Object.entries(result).map(([k, v]) => [k, Number(v)]));
}

function bar(value, max, width = 28) {
  return '█'.repeat(Math.max(value > 0 ? 1 : 0, Math.round((value / max) * width)));
}

function table(rows, heading) {
  if (rows.length === 0) {
    console.log(`\n${heading}\n  (nothing yet)`);
    return;
  }
  const max = rows[0][1];
  const pad = Math.min(42, Math.max(...rows.map(([path]) => path.length)));
  console.log(`\n${heading}`);
  for (const [path, count] of rows) {
    console.log(`  ${path.padEnd(pad)}  ${String(count).padStart(6)}  ${bar(count, max)}`);
  }
}

const url = await resolveUrl();
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? (await readDevVar('UPSTASH_REDIS_REST_TOKEN'));

if (!url || !token) {
  console.error(
    'Missing Upstash credentials. Set UPSTASH_REDIS_REST_TOKEN in the environment or .dev.vars.',
  );
  process.exit(1);
}

const days = Array.from({ length: DAYS }, (_, i) => {
  const d = new Date(Date.now() - i * 86_400_000);
  return d.toISOString().slice(0, 10);
});

const response = await fetch(`${url}/pipeline`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(days.map((day) => ['HGETALL', `${KEY_PREFIX}${day}`])),
});

if (!response.ok) {
  console.error(`Upstash responded ${response.status}: ${await response.text()}`);
  process.exit(1);
}

const totals = new Map();
let grand = 0;
let activeDays = 0;

for (const entry of await response.json()) {
  const counts = toCounts(entry?.result);
  if (Object.keys(counts).length > 0) activeDays += 1;
  for (const [path, count] of Object.entries(counts)) {
    totals.set(path, (totals.get(path) ?? 0) + count);
    grand += count;
  }
}

/**
 * How many tools the catalogue holds.
 *
 * Counted from the catalogue rather than typed in. This line said "of 37" while
 * there were 68, which is the worse half of the bug: the report exists to
 * decide what to build next, and a denominator that never moves hides exactly
 * the thing it is meant to show — how many tools nobody has opened.
 */
async function toolCount() {
  const source = await readFile('src/app/tools/tools.data.ts', 'utf8');
  return source.match(/^\s*slug: '[a-z0-9-]+',$/gm)?.length ?? 0;
}

const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
const tools = ranked.filter(([path]) => path.startsWith('/tools/'));
const rest = ranked.filter(([path]) => !path.startsWith('/tools/'));

console.log(
  `\n${grand.toLocaleString()} page views over ${DAYS} days (${activeDays} with data), bots excluded.`,
);

table(tools, `Tools — ${tools.length} of ${await toolCount()} opened at least once`);
table(rest.slice(0, 15), 'Everything else');

if (tools.length > 0) {
  const cold = tools.slice(-5).reverse();
  console.log(
    `\nLeast opened: ${cold.map(([p, c]) => `${p.replace('/tools/', '')} (${c})`).join(', ')}`,
  );
}
console.log();
