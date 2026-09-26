/**
 * "Has this password leaked?" against Have I Been Pwned's Pwned Passwords.
 *
 * The range API is k-anonymous: we send the first 5 hex characters of the
 * password's SHA-1 and get back every suffix that shares them (around 800 to
 * 1,000 real ones, padded with decoys). The match happens here, so neither the
 * password nor its full hash ever leaves the browser. `Add-Padding` asks the
 * API to pad each response with fake suffixes carrying a count of 0, so the
 * response size says nothing about which prefix was asked for.
 */

export const RANGE_API = 'https://api.pwnedpasswords.com/range/';

/** Upper-case hex SHA-1 of the UTF-8 bytes, as the range API lists them. */
export async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * How many breaches `suffix` (the 35 characters after the prefix) appears in,
 * read from a range response of `SUFFIX:COUNT` lines. Padding lines carry a
 * count of 0, so a padded match reads as "not found", which is what it is.
 */
export function countInRange(body: string, suffix: string): number {
  const wanted = suffix.toUpperCase();
  for (const line of body.split('\n')) {
    const [candidate, count] = line.trim().split(':');
    if (candidate.toUpperCase() === wanted) return Number(count) || 0;
  }
  return 0;
}

/**
 * The number of times `password` has been seen in a breach; 0 means not found.
 * Throws when the API cannot be reached or answers with an error, so the caller
 * can say "could not check" rather than a false "not found".
 */
export async function pwnedCount(password: string, timeoutMs = 10_000): Promise<number> {
  const hash = await sha1Hex(password);
  const response = await fetch(RANGE_API + hash.slice(0, 5), {
    headers: { 'Add-Padding': 'true' },
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Pwned Passwords answered ${response.status}`);
  return countInRange(await response.text(), hash.slice(5));
}
