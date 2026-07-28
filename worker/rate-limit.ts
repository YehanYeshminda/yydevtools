/**
 * Exact, globally-consistent per-IP rate limiting backed by Upstash Redis.
 *
 * The Cloudflare Rate Limiting binding is per-location and eventually
 * consistent, so it cannot enforce a true global ceiling on the metered Fly
 * operations. Upstash gives us one shared counter across every Cloudflare
 * location. It talks to Upstash over the REST API (plain fetch), so it works
 * inside a Worker with no raw TCP sockets.
 *
 * Free-tier budget (10k cmd/s, 256 MB data, 50 GB/mo): the sliding-window
 * algorithm costs a single Redis command per check, keys are tiny and expire on
 * their own, and the in-isolate `ephemeralCache` lets an already-blocked IP be
 * rejected WITHOUT touching Redis until its window resets. Analytics are off —
 * they add commands and bandwidth we do not need.
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export interface RedisEnv {
  /** Upstash REST endpoint — a plain var (see wrangler.jsonc). */
  UPSTASH_REDIS_REST_URL?: string;
  /** Upstash REST token — a secret (`wrangler secret put UPSTASH_REDIS_REST_TOKEN`). */
  UPSTASH_REDIS_REST_TOKEN?: string;
}

/** 20 requests per 60 s per IP — the ceiling the Cloudflare limiter used, now exact and global. */
const LIMIT = 20;
const WINDOW = '60 s' as const;

// One limiter per isolate. The ephemeral cache only saves Redis calls if it
// outlives individual requests, so both live at module scope.
let cached: Ratelimit | null = null;
const ephemeralCache = new Map<string, number>();

function getLimiter(env: RedisEnv): Ratelimit | null {
  if (cached) {
    return cached;
  }
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  cached = new Ratelimit({
    redis: new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    }),
    limiter: Ratelimit.slidingWindow(LIMIT, WINDOW),
    prefix: 'yydevtools:rl',
    // Off for the free tier: analytics add extra commands and bandwidth.
    analytics: false,
    ephemeralCache,
    // If Redis is slow, fail open after 1s rather than stalling the user; the
    // Cloudflare limiter in front is the coarse backstop.
    timeout: 1000,
  });
  return cached;
}

/**
 * Returns true if the request may proceed. When Upstash is not configured, or a
 * Redis call fails, this fails OPEN (allow): the Cloudflare limiter is the
 * backstop, and a Redis hiccup must never take every tool offline.
 */
export async function allowRequest(env: RedisEnv, ip: string): Promise<boolean> {
  const limiter = getLimiter(env);
  if (!limiter) {
    return true;
  }
  try {
    const { success } = await limiter.limit(ip);
    return success;
  } catch {
    return true;
  }
}
