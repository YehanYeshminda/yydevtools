/**
 * Password strength estimation, wrapping @zxcvbn-ts.
 *
 * Entropy (see `generate.ts`) says how large the search space is *in theory*.
 * zxcvbn asks a different and complementary question: how quickly would a real
 * cracker get there, given dictionaries, names, dates, keyboard walks, repeats
 * and l33t substitutions? For a value this tool generated the two agree. For a
 * password someone typed in themselves — `P@ssw0rd123` has a respectable
 * character pool and falls in seconds — only zxcvbn tells the truth.
 *
 * The dictionaries are several megabytes unpacked, so everything here loads on
 * demand and is cached after the first call. Nothing is fetched until a strength
 * reading is actually needed, which keeps it off the initial bundle entirely.
 */
import type { ZxcvbnResult } from '@zxcvbn-ts/core';

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface StrengthReading {
  score: StrengthScore;
  /** Order-of-magnitude guesses, the stable number behind the score. */
  guessesLog10: number;
  /** Human-readable time for an offline attack at 10 000 000 000 guesses/sec. */
  offlineFastHashing: string;
  /** Human-readable time for a throttled online attack (100/hour). */
  onlineThrottled: string;
  warning: string | null;
  suggestions: string[];
}

/** Labels for each score band. */
export const SCORE_LABELS: Record<StrengthScore, string> = {
  0: 'Very weak',
  1: 'Weak',
  2: 'Fair',
  3: 'Strong',
  4: 'Very strong',
};

type Checker = (password: string) => ZxcvbnResult;

/**
 * Cached across calls *and* across component instances — the dictionaries are
 * immutable, so building the factory twice would only pay the cost twice.
 */
let checkerPromise: Promise<Checker> | null = null;

function loadChecker(): Promise<Checker> {
  checkerPromise ??= (async () => {
    const [core, common, english] = await Promise.all([
      import('@zxcvbn-ts/core'),
      import('@zxcvbn-ts/language-common'),
      import('@zxcvbn-ts/language-en'),
    ]);

    const factory = new core.ZxcvbnFactory({
      dictionary: { ...common.dictionary, ...english.dictionary },
      graphs: common.adjacencyGraphs,
      translations: english.translations,
    });

    return (password: string) => factory.check(password);
  })();

  return checkerPromise;
}

/**
 * zxcvbn's matching is superlinear in the input length, and beyond ~72
 * characters the answer is "uncrackable" regardless. Truncating keeps a long
 * passphrase from stalling the main thread while changing no verdict that
 * matters.
 */
const MAX_ANALYSED = 72;

export async function estimateStrength(password: string): Promise<StrengthReading | null> {
  if (!password) {
    return null;
  }

  const check = await loadChecker();
  const result = check(password.slice(0, MAX_ANALYSED));

  return {
    score: result.score,
    guessesLog10: result.guessesLog10,
    // Each crack time is a { base, seconds, display } triple; `display` is the
    // already-humanised string ("centuries", "3 days").
    offlineFastHashing: result.crackTimes.offlineFastHashingXPerSecond.display,
    onlineThrottled: result.crackTimes.onlineThrottlingXPerHour.display,
    warning: result.feedback.warning,
    suggestions: result.feedback.suggestions,
  };
}

/**
 * A rough, instant band from entropy alone, shown while zxcvbn's dictionaries
 * are still downloading so the meter is never blank. The thresholds follow the
 * usual reading of NIST-style entropy bands.
 */
export function scoreFromEntropy(bits: number): StrengthScore {
  if (bits < 28) return 0;
  if (bits < 36) return 1;
  if (bits < 60) return 2;
  if (bits < 80) return 3;
  return 4;
}
