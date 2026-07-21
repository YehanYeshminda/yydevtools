/**
 * Soft budget guard for the Adobe PDF Services free tier.
 *
 * Adobe bills per document transaction and the free tier is small, so we track
 * usage ourselves and stop *before* Adobe starts refusing requests — a tool
 * that degrades on our own counter gives a much better message than one that
 * degrades on an opaque 429.
 *
 * KV has no atomic increment, so two simultaneous requests can both read the
 * same count and overshoot by one. That is why `ADOBE_MONTHLY_LIMIT` should sit
 * below the real Adobe allowance: the margin absorbs the race.
 */

export interface QuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  /** Month this count applies to, as `YYYY-MM`. */
  period: string;
}

/** Adobe's free tier resets monthly, so the counter is keyed by month. */
export function periodKey(now: number): string {
  const date = new Date(now);
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}`;
}

export async function readQuota(
  kv: KVNamespace,
  limit: number,
  now: number,
): Promise<QuotaStatus> {
  const period = periodKey(now);
  const raw = await kv.get(`usage:${period}`);
  const used = raw ? Number(raw) : 0;
  const safe = Number.isFinite(used) && used >= 0 ? used : 0;
  return { used: safe, limit, remaining: Math.max(0, limit - safe), period };
}

/**
 * Records one consumed transaction.
 *
 * Called only after Adobe actually returns a result, so a failed job does not
 * eat the user's budget. The trade-off is that a job Adobe billed but never
 * delivered goes uncounted — the safety margin covers that too.
 */
export async function recordUsage(kv: KVNamespace, now: number): Promise<void> {
  const period = periodKey(now);
  const key = `usage:${period}`;
  const raw = await kv.get(key);
  const used = raw ? Number(raw) : 0;
  const next = (Number.isFinite(used) && used >= 0 ? used : 0) + 1;
  // Expire well after the month ends so old counters clean themselves up.
  await kv.put(key, String(next), { expirationTtl: 60 * 60 * 24 * 70 });
}
