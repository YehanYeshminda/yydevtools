import { beforeEach, describe, expect, it, vi } from 'vitest';

const { hincrby, expire } = vi.hoisted(() => ({
  hincrby: vi.fn(),
  expire: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
  Redis: class {
    hincrby = hincrby;
    expire = expire;
  },
}));

const env = {
  UPSTASH_REDIS_REST_URL: 'https://redis.example',
  UPSTASH_REDIS_REST_TOKEN: 'token',
};

/** The module caches its client and TTL flag at module scope, so each test gets a fresh copy. */
async function freshStats() {
  vi.resetModules();
  return import('./stats');
}

beforeEach(() => {
  hincrby.mockReset().mockResolvedValue(1);
  expire.mockReset().mockResolvedValue(1);
});

describe('isPageView', () => {
  it('counts a navigation, which asks for html', async () => {
    const { isPageView } = await freshStats();
    expect(isPageView('GET', 'text/html,application/xhtml+xml')).toBe(true);
  });

  it('ignores the fetches a page makes for its own assets', async () => {
    const { isPageView } = await freshStats();
    expect(isPageView('GET', 'image/avif,image/webp,*/*')).toBe(false);
    expect(isPageView('GET', 'application/json')).toBe(false);
    expect(isPageView('GET', '*/*')).toBe(false);
  });

  it('ignores anything that is not a GET', async () => {
    const { isPageView } = await freshStats();
    expect(isPageView('POST', 'text/html')).toBe(false);
  });
});

describe('isBot', () => {
  it('excludes crawlers and monitors', async () => {
    const { isBot } = await freshStats();
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0)',
      'curl/8.4.0',
      'Chrome-Lighthouse',
    ]) {
      expect(isBot(ua), ua).toBe(true);
    }
  });

  it("excludes this project's own Playwright runs, which would skew the ranking", async () => {
    const { isBot } = await freshStats();
    expect(isBot('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/140.0.0.0 Safari/537.36')).toBe(
      true,
    );
  });

  it('keeps an ordinary browser', async () => {
    const { isBot } = await freshStats();
    expect(
      isBot(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      ),
    ).toBe(false);
  });
});

describe('recordPageView', () => {
  it('counts one view against the day and the path', async () => {
    const { recordPageView } = await freshStats();

    await recordPageView(env, '/tools/regex-tester', '2026-09-12');

    expect(hincrby).toHaveBeenCalledWith('yydevtools:stats:2026-09-12', '/tools/regex-tester', 1);
  });

  it('sets the TTL once, not on every view', async () => {
    const { recordPageView } = await freshStats();

    await recordPageView(env, '/a', '2026-09-12');
    await recordPageView(env, '/b', '2026-09-12');
    await recordPageView(env, '/c', '2026-09-12');

    expect(hincrby).toHaveBeenCalledTimes(3);
    // Three views, one EXPIRE — the whole point of the per-isolate flag.
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it('sets a fresh TTL when the day rolls over', async () => {
    const { recordPageView } = await freshStats();

    await recordPageView(env, '/a', '2026-09-12');
    await recordPageView(env, '/a', '2026-09-13');

    expect(expire).toHaveBeenCalledTimes(2);
    expect(expire).toHaveBeenLastCalledWith('yydevtools:stats:2026-09-13', 120 * 24 * 60 * 60);
  });

  it('does nothing when Upstash is not configured, rather than throwing', async () => {
    const { recordPageView } = await freshStats();

    await expect(recordPageView({}, '/tools/regex-tester', '2026-09-12')).resolves.toBeUndefined();
    expect(hincrby).not.toHaveBeenCalled();
  });

  it('swallows a Redis failure, because a count must never affect a response', async () => {
    const { recordPageView } = await freshStats();
    hincrby.mockRejectedValue(new Error('redis is down'));

    await expect(recordPageView(env, '/tools/regex-tester', '2026-09-12')).resolves.toBeUndefined();
  });
});

describe('dayKey', () => {
  it('buckets by UTC date', async () => {
    const { dayKey } = await freshStats();
    expect(dayKey(new Date('2026-09-12T23:59:59Z'))).toBe('2026-09-12');
    expect(dayKey(new Date('2026-09-13T00:00:01Z'))).toBe('2026-09-13');
  });
});
