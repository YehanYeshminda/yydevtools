/**
 * Anonymous page counts, kept on our own server.
 *
 * The question this exists to answer is "which of the 37 tools does anyone
 * actually open", because that is what should decide which tool gets built
 * next — and it was previously a guess.
 *
 * It counts in the Worker rather than from a script in the page, for two
 * reasons. The first is accuracy: this is a site for developers, and a large
 * share of them block client-side analytics, so a beacon would undercount and —
 * worse — undercount *unevenly*, which is exactly the distortion that makes a
 * ranking useless. The second is that a beacon would be a third-party request
 * on every page view, which is the thing this site removed Google Fonts to
 * avoid.
 *
 * What is stored is one integer per path per day. No IP address, no user agent,
 * no identifier, no cookie, nothing that could be tied back to a person, and so
 * nothing that needs a consent banner. The counts cannot be de-anonymised
 * because there is nothing in them to de-anonymise.
 */
import { Redis } from '@upstash/redis';

import type { RedisEnv } from './rate-limit';

/** One hash per day, so a day can be read or dropped on its own. */
const KEY_PREFIX = 'yydevtools:stats:';

/** Long enough to see a season, short enough that the keyspace stays bounded. */
const RETENTION_SECONDS = 120 * 24 * 60 * 60;

/**
 * Clients that are not people. Imperfect by nature — a determined crawler can
 * say anything — but it removes the honest majority, which is all a ranking
 * needs. `headless` also excludes this project's own Playwright runs, which
 * would otherwise put whichever tools the suite exercises at the top.
 */
const BOT_PATTERN =
  /bot|crawl|spider|slurp|headless|preview|monitor|lighthouse|curl|wget|python-requests|node-fetch|axios/i;

export function isBot(userAgent: string): boolean {
  return BOT_PATTERN.test(userAgent);
}

/**
 * True when the request is a person opening a page, rather than the browser
 * fetching something a page needs.
 *
 * `Accept` is the signal: a navigation asks for `text/html`, a script or image
 * fetch does not. The content-hashed bundles and the three vendored asset trees
 * never reach the Worker at all (see `run_worker_first` in wrangler.jsonc), so
 * what this mainly excludes is robots.txt, the sitemap, the manifest and the
 * favicons.
 */
export function isPageView(method: string, accept: string): boolean {
  return method === 'GET' && accept.includes('text/html');
}

/** The day bucket a timestamp belongs to, as an ISO date. */
export function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

let redis: Redis | null = null;

function getRedis(env: RedisEnv): Redis | null {
  if (redis) {
    return redis;
  }
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redis;
}

/** The last day this isolate set a TTL for, so it is set once rather than per view. */
let ttlSetFor: string | null = null;

/**
 * Records one page view. Call it from `ctx.waitUntil` — the visitor is not
 * waiting on this and must never be.
 *
 * Costs one Redis command per view. The TTL is set once per isolate per day
 * rather than on every write, because a second command per view would double
 * the cost of the whole feature to re-set a value that does not change.
 *
 * Every failure is swallowed. Counting a page view is the least important thing
 * this Worker does, and it must not be able to affect a response.
 */
export async function recordPageView(env: RedisEnv, path: string, day: string): Promise<void> {
  const client = getRedis(env);
  if (!client) {
    return;
  }

  const key = `${KEY_PREFIX}${day}`;
  try {
    await client.hincrby(key, path, 1);
    if (ttlSetFor !== day) {
      ttlSetFor = day;
      await client.expire(key, RETENTION_SECONDS);
    }
  } catch {
    // Deliberately silent: see above.
  }
}

/** The key a given day's counts live under, for the reader in scripts/stats.mjs. */
export function statsKeyFor(day: string): string {
  return `${KEY_PREFIX}${day}`;
}
