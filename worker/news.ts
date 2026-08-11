/**
 * Today's technology news, fetched from CurrentsAPI and cached in Upstash Redis.
 *
 * The free CurrentsAPI plan allows only 1000 requests a day, so the API is the
 * last thing we ever touch. Three layers sit in front of it, cheapest first:
 *
 *   1. The browser (`Cache-Control` on the /api/news response) — a visitor
 *      moving between pages re-uses one response for half an hour.
 *   2. Cloudflare's edge cache (`caches.default`, set in worker/index.ts) — most
 *      requests are served at the POP without running any of this module.
 *   3. Upstash Redis (here) — a single shared entry with a few-hour freshness
 *      window, so even a cold edge only calls CurrentsAPI a handful of times a
 *      day. A separate long-lived backup entry lets us serve slightly-stale news
 *      rather than nothing if CurrentsAPI is down when the fresh copy expires.
 *
 * With a 3-hour fresh window that is at most ~8 upstream calls a day — two
 * orders of magnitude inside the free quota — even before the edge cache is
 * counted. Everything fails soft: no key, no Redis, or a bad upstream response
 * degrades to "news unavailable", never an error that touches the rest of the
 * site.
 */
import { Redis } from '@upstash/redis';

/** One story, trimmed to just what the feed renders. */
export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  /** The publication's bare hostname, e.g. "theverge.com". */
  source: string;
  category: string;
  /** ISO-8601 publish time, as reported by CurrentsAPI. */
  published: string;
}

export interface NewsPayload {
  articles: NewsArticle[];
  /** When this batch was fetched from CurrentsAPI (ISO-8601). */
  updated: string;
}

export interface NewsEnv {
  /** CurrentsAPI key — a secret (`wrangler secret put CURRENTS_API_KEY`). */
  CURRENTS_API_KEY?: string;
  /** Upstash REST endpoint — a plain var (see wrangler.jsonc). */
  UPSTASH_REDIS_REST_URL?: string;
  /** Upstash REST token — a secret (`wrangler secret put UPSTASH_REDIS_REST_TOKEN`). */
  UPSTASH_REDIS_REST_TOKEN?: string;
}

export type NewsResult =
  | { ok: true; payload: NewsPayload; cache: 'fresh' | 'miss' | 'stale' }
  | { ok: false; code: 'NOT_CONFIGURED' | 'UPSTREAM_UNAVAILABLE' };

/**
 * Two CurrentsAPI endpoints, tried in order. `/search` is the only one that
 * accepts a `category` filter, so it gives the technology-scoped feed we want;
 * `/latest-news` takes `language` alone and is the general fallback used if the
 * category search returns nothing usable, so the feed is never empty while the
 * API is up. Both return the same `{ status, news[] }` shape.
 */
const SEARCH_URL = 'https://api.currentsapi.services/v1/search';
const LATEST_URL = 'https://api.currentsapi.services/v1/latest-news';
/**
 * "Diverse Perspectives" for a developer audience: the latest technology news
 * aggregated across many independent outlets, in English. The other free-plan
 * angles fit worse — Stock Exchange News is for a finance audience, Local &
 * Regional needs a locale the site has no reason to guess, and Geolocation Data
 * is an IP lookup rather than news at all.
 */
const LANGUAGE = 'en';
const CATEGORY = 'technology';

/** The list is short by design — a strip and a single page, not an archive. */
const MAX_ARTICLES = 12;

/**
 * How long a fetched batch is served before we refresh it. Three hours keeps
 * "news of the day" current while capping upstream calls at ~8/day, far inside
 * the 1000/day free quota.
 */
const FRESH_TTL_SECONDS = 3 * 60 * 60;
/** The stale-fallback copy outlives the fresh one, so an upstream outage still shows news. */
const BACKUP_TTL_SECONDS = 48 * 60 * 60;

const FRESH_KEY = 'yydevtools:news:tech:fresh';
const BACKUP_KEY = 'yydevtools:news:tech:backup';

/** Give up on CurrentsAPI quickly; a slow feed must not hold the request open. */
const FETCH_TIMEOUT_MS = 8000;

interface CurrentsArticle {
  id?: string;
  title?: string;
  description?: string;
  url?: string;
  category?: string[];
  published?: string;
}

interface CurrentsResponse {
  status?: string;
  news?: CurrentsArticle[];
}

// One Redis client per isolate, mirroring worker/rate-limit.ts.
let redis: Redis | null = null;

function getRedis(env: NewsEnv): Redis | null {
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

/**
 * Returns the current news batch, going upstream only when the Redis cache has
 * no fresh copy. Never throws: every failure path resolves to a typed result.
 */
export async function getNews(env: NewsEnv): Promise<NewsResult> {
  if (!env.CURRENTS_API_KEY) {
    return { ok: false, code: 'NOT_CONFIGURED' };
  }

  const store = getRedis(env);

  // 1. Serve the fresh copy if one is still within its window.
  if (store) {
    const fresh = await safeGet(store, FRESH_KEY);
    if (fresh) {
      return { ok: true, payload: fresh, cache: 'fresh' };
    }
  }

  // 2. Fresh miss — this is the only path that spends a CurrentsAPI request.
  const fetched = await fetchCurrents(env.CURRENTS_API_KEY);
  if (fetched) {
    if (store) {
      await safeSet(store, FRESH_KEY, fetched, FRESH_TTL_SECONDS);
      await safeSet(store, BACKUP_KEY, fetched, BACKUP_TTL_SECONDS);
    }
    return { ok: true, payload: fetched, cache: 'miss' };
  }

  // 3. Upstream failed — a slightly-stale batch beats an empty feed.
  if (store) {
    const backup = await safeGet(store, BACKUP_KEY);
    if (backup) {
      return { ok: true, payload: backup, cache: 'stale' };
    }
  }

  return { ok: false, code: 'UPSTREAM_UNAVAILABLE' };
}

/**
 * Fetches the news batch: technology-scoped search first, then the general
 * latest-news feed as a fallback. Returns null only if both come back empty or
 * failing, which the caller treats as "unavailable".
 */
async function fetchCurrents(apiKey: string): Promise<NewsPayload | null> {
  // `wrangler secret put` keeps a trailing newline if the value was pasted, so
  // trim before it reaches the Authorization header.
  const key = apiKey.trim();

  const search = new URL(SEARCH_URL);
  search.searchParams.set('language', LANGUAGE);
  search.searchParams.set('category', CATEGORY);

  const latest = new URL(LATEST_URL);
  latest.searchParams.set('language', LANGUAGE);

  return (await fetchFrom(key, search)) ?? (await fetchFrom(key, latest));
}

/** One CurrentsAPI request + validation. Returns null (and logs why) on any failure. */
async function fetchFrom(key: string, url: URL): Promise<NewsPayload | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      // CurrentsAPI takes the key in the Authorization header (no "Bearer"),
      // which keeps it out of the URL and any logs.
      headers: { Authorization: key },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    // Network error or the abort timeout firing. Log the reason (never the key)
    // so a persistent outage is visible in `wrangler tail`.
    console.warn(`news: ${url.pathname} request failed`, (error as Error)?.name ?? error);
    return null;
  }

  if (!response.ok) {
    // 401/403 means the key is wrong or missing; a 400 usually means it is empty
    // or malformed. The body is the API's own message and never echoes the key.
    const detail = await response.text().catch(() => '');
    console.warn(`news: ${url.pathname} returned ${response.status}`, detail.slice(0, 200));
    return null;
  }

  let body: CurrentsResponse;
  try {
    body = (await response.json()) as CurrentsResponse;
  } catch {
    console.warn(`news: ${url.pathname} response was not valid JSON`);
    return null;
  }

  if (body.status !== 'ok' || !Array.isArray(body.news)) {
    console.warn(`news: ${url.pathname} status="${body.status}" (news array present: ${Array.isArray(body.news)})`);
    return null;
  }

  const articles = body.news.filter(usable).slice(0, MAX_ARTICLES).map(normalise);
  if (articles.length === 0) {
    return null;
  }

  return { articles, updated: new Date().toISOString() };
}

/** A story is only worth showing if it has both a title and somewhere to go. */
function usable(article: CurrentsArticle): article is CurrentsArticle & { title: string; url: string } {
  return (
    typeof article.title === 'string' &&
    article.title.trim() !== '' &&
    typeof article.url === 'string' &&
    article.url.trim() !== ''
  );
}

function normalise(article: CurrentsArticle & { title: string; url: string }): NewsArticle {
  return {
    id: typeof article.id === 'string' && article.id !== '' ? article.id : article.url,
    title: clip(article.title, 200),
    description: clip(typeof article.description === 'string' ? article.description : '', 280),
    url: article.url,
    source: hostname(article.url),
    category:
      Array.isArray(article.category) && article.category.length > 0
        ? article.category[0]
        : CATEGORY,
    published: typeof article.published === 'string' ? article.published : '',
  };
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Trim and hard-cap a string so a rogue upstream field can't bloat the cache. */
function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

async function safeGet(store: Redis, key: string): Promise<NewsPayload | null> {
  try {
    // The Upstash client JSON-parses values it stored as objects.
    return await store.get<NewsPayload>(key);
  } catch {
    return null;
  }
}

async function safeSet(store: Redis, key: string, value: NewsPayload, ttlSeconds: number): Promise<void> {
  try {
    await store.set(key, value, { ex: ttlSeconds });
  } catch {
    // The cache is an optimisation; a write failure just means the next request
    // goes upstream again.
  }
}
