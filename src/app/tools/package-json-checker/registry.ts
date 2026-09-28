/**
 * The package.json Checker's three calls, all made straight from the browser.
 *
 * - registry.npmjs.org: one GET per package *name*, for npm's abbreviated
 *   metadata (dist-tags, version list, deprecation messages). `Accept` is a
 *   CORS-safelisted header, so there is no preflight; the registry answers
 *   with `Access-Control-Allow-Origin: *`.
 * - api.osv.dev/v1/querybatch: one POST carrying `{name, version}` pairs,
 *   where each version is the one the declared range resolves to.
 * - api.osv.dev/v1/vulns/{id}: the summary and fix for each advisory OSV
 *   returned. The id came from OSV, not from the file.
 *
 * Nothing else from the package.json is sent anywhere, and no referrer goes
 * with any of it.
 */
import { registryPath, toPackument, toVuln, type Packument, type Vuln } from './package-check';

export const REGISTRY = 'https://registry.npmjs.org/';
export const OSV_BATCH = 'https://api.osv.dev/v1/querybatch';
export const OSV_VULN = 'https://api.osv.dev/v1/vulns/';

const TIMEOUT_MS = 10_000;
/** Parallel requests per host: enough to be quick, few enough to be polite. */
export const CONCURRENCY = 6;
/** OSV's documented ceiling for one querybatch. */
const OSV_BATCH_MAX = 1000;

const INIT: RequestInit = { referrerPolicy: 'no-referrer', credentials: 'omit' };

/**
 * `null` when the package is not on the public registry (a 404), and
 * `'unreadable'` for a scoped name the browser could not read at all. Throws
 * on anything else.
 *
 * The registry answers a missing *scoped* package with a 404 that carries no
 * `Access-Control-Allow-Origin` (an unscoped 404 does carry it; checked
 * 2026-09-28), so the browser reports it as a network error, the same
 * TypeError as being offline. The caller decides which it was.
 */
export async function fetchPackument(name: string): Promise<Packument | null | 'unreadable'> {
  let response: Response;
  try {
    response = await fetch(REGISTRY + registryPath(name), {
      ...INIT,
      headers: { Accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // A timeout is a DOMException, not a TypeError, so it is still a failure.
    if (name.startsWith('@') && error instanceof TypeError) return 'unreadable';
    throw error;
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`The registry answered ${response.status}`);
  return toPackument(await response.json());
}

/**
 * Advisory ids for each `{name, version}`, in the same order. Throws if OSV
 * cannot be reached, so the caller can say "not checked" rather than "none".
 */
export async function queryOsv(
  packages: ReadonlyArray<{ name: string; version: string }>,
): Promise<string[][]> {
  const ids: string[][] = [];
  for (let start = 0; start < packages.length; start += OSV_BATCH_MAX) {
    const queries = packages.slice(start, start + OSV_BATCH_MAX).map(({ name, version }) => ({
      package: { name, ecosystem: 'npm' },
      version,
    }));
    const response = await fetch(OSV_BATCH, {
      ...INIT,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`OSV answered ${response.status}`);
    const body = (await response.json()) as { results?: Array<{ vulns?: Array<{ id?: unknown }> }> };
    for (let i = 0; i < queries.length; i++) {
      // ponytail: a package with more than OSV's page of advisories (1,000)
      // shows the first page only; follow next_page_token if that ever happens.
      const vulns = body.results?.[i]?.vulns ?? [];
      ids.push(vulns.map((vuln) => String(vuln.id)).filter(Boolean));
    }
  }
  return ids;
}

/** One advisory's details; `null` if they could not be fetched (the id is still shown). */
export async function fetchVuln(id: string, name: string, version: string): Promise<Vuln | null> {
  try {
    const response = await fetch(OSV_VULN + encodeURIComponent(id), {
      ...INIT,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return toVuln(await response.json(), name, version);
  } catch {
    return null;
  }
}

/** Run `task` over `items` with at most `limit` in flight; never rejects. */
export async function eachLimited<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++];
      await task(item).catch(() => undefined);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
