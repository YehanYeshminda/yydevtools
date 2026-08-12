/**
 * Types for `secure-random-password`'s internal random module.
 *
 * The package's public entry point (and its @types) only exposes
 * `randomPassword`/`randomString`, which build passwords out of *character*
 * sets. Passphrase mode needs to pick whole words out of the EFF wordlist, so
 * it reaches for the same vetted random source one level down rather than
 * rolling a second, unreviewed one alongside it.
 *
 * `Random.choose` is generic over arrays as well as strings — it indexes its
 * argument with an unbiased integer (rejection sampling, see the package's
 * `lib/random.js`), so it works on a word array exactly as it does on a string
 * of characters.
 */
declare module 'secure-random-password/lib/random' {
  export interface SecureRandom {
    /** Picks one element, uniformly and without modulo bias. */
    choose<T>(choices: readonly T[]): T;
    choose(choices: string): string;
    /** An unbiased integer in [0, upperBoundExclusive). */
    getInt(upperBoundExclusive: number): number;
    /** Fisher-Yates-equivalent shuffle driven by the same unbiased source. */
    shuffle<T>(items: readonly T[]): T[];
  }

  /**
   * Returns `count` random bytes. Any array-like of byte values works — the
   * class only indexes it and reads `.length`.
   */
  export type RandomSource = (count: number) => ArrayLike<number>;

  /**
   * Only the named export is declared. The module also has a `default` export
   * holding a ready-made instance, but it is unusable through the bundler's
   * CommonJS interop — see the note in `generate.ts`.
   */
  export const Random: new (randomSource: RandomSource) => SecureRandom;
}
