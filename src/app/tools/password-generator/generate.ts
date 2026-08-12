/**
 * Password and passphrase generation.
 *
 * All randomness comes from `secure-random-password`, which draws from
 * `crypto.getRandomValues` and converts those bytes into an index with
 * rejection sampling — so every character and word is uniformly distributed.
 * That last part matters more than it sounds: the naive `bytes[i] % poolSize`
 * shortcut is measurably biased toward the start of the pool whenever the pool
 * size does not divide 256, and a biased generator quietly shrinks the search
 * space an attacker has to cover.
 *
 * These functions are pure and take their wordlist as an argument, which keeps
 * the 7,776-word EFF list out of this module's import graph — see
 * `eff-wordlist.ts` for why that is loaded on demand.
 */
import { digits, fullSymbols, lower, randomPassword, upper } from 'secure-random-password';
import { Random } from 'secure-random-password/lib/random';

/**
 * The library's unbiased chooser, driven straight from the Web Crypto API.
 *
 * Deliberately the *named* `Random` export rather than the module's ready-made
 * default instance: `lib/random` is CommonJS and already has its own `default`
 * key, so the bundler's ESM interop wraps it a second time and a default import
 * arrives as the module object instead of the instance. Named exports are not
 * affected.
 *
 * Supplying the byte source directly also removes a layer — the library's own
 * source does exactly this in a browser — while keeping the part that is easy
 * to get wrong (turning bytes into an unbiased index) in the library's hands.
 */
const random = new Random((count: number) => {
  const bytes = new Uint8Array(count);
  crypto.getRandomValues(bytes);
  return bytes;
});

/** Word separators offered for passphrases. */
export type Separator = '-' | ' ' | '.' | '_' | '';

export interface PasswordOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  numbers: boolean;
  symbols: boolean;
  /** Drop characters that are easy to misread: I, l, 1, |, O and 0. */
  avoidAmbiguous: boolean;
  /** Guarantee at least one character from every enabled set. */
  requireEach: boolean;
}

export interface PassphraseOptions {
  words: number;
  separator: Separator;
  capitalize: boolean;
  /** Append a digit to one randomly chosen word. */
  includeNumber: boolean;
}

/** Characters excluded when `avoidAmbiguous` is on, by set. */
const AMBIGUOUS = /[Il1|O0]/g;

/**
 * The symbol set. `fullSymbols` from the library is the full printable-ASCII
 * punctuation range; a few of those (quotes, backslash, backtick) are awkward
 * inside shell commands, CSV and JSON, so the offered set trims them. Everything
 * left is safe to paste anywhere without escaping.
 */
const SAFE_SYMBOLS = fullSymbols.replace(/["'\\`]/g, '');

/** The pool a given set of options draws from, after ambiguity filtering. */
export function characterPool(options: PasswordOptions): string {
  const parts: string[] = [];
  if (options.lowercase) parts.push(lower);
  if (options.uppercase) parts.push(upper);
  if (options.numbers) parts.push(digits);
  if (options.symbols) parts.push(SAFE_SYMBOLS);

  const pool = parts.join('');
  return options.avoidAmbiguous ? pool.replace(AMBIGUOUS, '') : pool;
}

/**
 * Generates one password. Returns an empty string when every character set is
 * switched off, which the caller surfaces as a validation message rather than
 * an exception — it is a UI state, not a failure.
 */
export function generatePassword(options: PasswordOptions): string {
  const sets: string[] = [];
  if (options.lowercase) sets.push(lower);
  if (options.uppercase) sets.push(upper);
  if (options.numbers) sets.push(digits);
  if (options.symbols) sets.push(SAFE_SYMBOLS);

  if (sets.length === 0) {
    return '';
  }

  const filtered = options.avoidAmbiguous
    ? sets.map((set) => set.replace(AMBIGUOUS, '')).filter((set) => set.length > 0)
    : sets;

  if (filtered.length === 0) {
    return '';
  }

  // A length shorter than the number of enabled sets cannot hold one of each,
  // so the guarantee is dropped rather than throwing.
  const canRequireEach = options.requireEach && options.length >= filtered.length;

  // `exactly: 1` pins one character from each set; the trailing unpinned set
  // fills the remaining positions from the whole pool. The library shuffles the
  // result, so the guaranteed characters do not land in predictable positions.
  const characters = canRequireEach
    ? [...filtered.map((set) => ({ characters: set, exactly: 1 })), filtered.join('')]
    : [filtered.join('')];

  return randomPassword({
    length: options.length,
    characters,
    // Ambiguity is already handled above, against the sets this tool offers.
    avoidAmbiguous: false,
  });
}

/**
 * Generates one passphrase from the supplied wordlist, choosing each word
 * independently *with* replacement — which is what makes the entropy simply
 * `words × log2(listLength)`. Sampling without replacement (as some diceware
 * packages do) makes each later word slightly more constrained than the last,
 * and quietly invalidates that arithmetic.
 */
export function generatePassphrase(
  options: PassphraseOptions,
  wordlist: readonly string[],
): string {
  if (wordlist.length === 0 || options.words < 1) {
    return '';
  }

  const words = Array.from({ length: options.words }, () => random.choose(wordlist));

  const cased = options.capitalize
    ? words.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    : words;

  if (options.includeNumber) {
    const index = random.getInt(cased.length);
    cased[index] = `${cased[index]}${random.getInt(10)}`;
  }

  return cased.join(options.separator);
}

/**
 * Shannon entropy in bits, the honest measure for a value drawn uniformly at
 * random: log2(possible values). It describes the generator, not the string —
 * which is exactly why it is the right number here and the wrong number for a
 * password a human invented.
 */
export function passwordEntropy(options: PasswordOptions): number {
  const pool = characterPool(options).length;
  return pool > 1 ? options.length * Math.log2(pool) : 0;
}

export function passphraseEntropy(options: PassphraseOptions, listLength: number): number {
  if (listLength < 2 || options.words < 1) {
    return 0;
  }
  const base = options.words * Math.log2(listLength);
  // The appended digit adds its own value (10) times the word it landed on.
  const extra = options.includeNumber ? Math.log2(10 * options.words) : 0;
  return base + extra;
}
