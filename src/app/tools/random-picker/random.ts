/**
 * Fair randomness for the Random Picker: coins, dice, numbers in a range,
 * picking from a list, shuffling and splitting into teams.
 *
 * Every draw goes through one function, `randomInt(n)`, built on the same
 * unbiased chooser the Password Generator uses (secure-random-password's
 * `Random`). It reads bytes from `crypto.getRandomValues` and turns them into
 * an index by **rejection sampling**: with one byte (0-255) and a six-sided
 * die, 256 is not a multiple of 6, so `byte % 6` would make 1-4 come up 43
 * times in 256 and 5-6 only 42. Instead, bytes 252-255 are thrown away and
 * drawn again, leaving 252 = 6 x 42 equally likely values. The unit spec
 * proves this by feeding it every possible byte.
 *
 * Every function takes the integer source as its last argument, so the spec
 * can drive it with known bytes. The page always uses the crypto one.
 */
import { Random } from 'secure-random-password/lib/random';

/** Returns `count` random bytes. */
export type ByteSource = (count: number) => ArrayLike<number>;

/** A uniform integer in [0, n). */
export type IntSource = (n: number) => number;

export const cryptoBytes: ByteSource = (count) => crypto.getRandomValues(new Uint8Array(count));

/** An unbiased `randomInt` drawing from `bytes`. */
export function intSource(bytes: ByteSource = cryptoBytes): IntSource {
  const random = new Random(bytes);
  return (n) => random.getInt(n);
}

/** Made on first use, since a prerender never draws anything. */
let cryptoInt: IntSource | null = null;
const defaultInt: IntSource = (n) => (cryptoInt ??= intSource())(n);

/** The widest range a single draw covers: 2^48, six bytes, well inside a double's exact integers. */
export const MAX_RANGE = 2 ** 48;

export type Coin = 'Heads' | 'Tails';

export function flipCoins(count: number, int: IntSource = defaultInt): Coin[] {
  return Array.from({ length: count }, () => (int(2) === 0 ? 'Heads' : 'Tails'));
}

export interface DiceRoll {
  rolls: number[];
  total: number;
}

export function rollDice(count: number, sides: number, int: IntSource = defaultInt): DiceRoll {
  const rolls = Array.from({ length: count }, () => int(sides) + 1);
  return { rolls, total: rolls.reduce((sum, roll) => sum + roll, 0) };
}

/** Largest range we will lay out in memory to draw unique numbers from. */
const SHUFFLE_LIMIT = 100_000;

/**
 * `count` integers between `min` and `max` inclusive. With `unique`, no
 * number appears twice, so `count` may not exceed the size of the range.
 */
export function numbersInRange(
  min: number,
  max: number,
  count: number,
  unique: boolean,
  int: IntSource = defaultInt,
): number[] | { error: string } {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) return { error: 'Use whole numbers.' };
  if (min > max) return { error: 'The lowest number must not be above the highest.' };
  const size = max - min + 1;
  if (size > MAX_RANGE) return { error: 'That range is too wide. Keep it under 281 trillion numbers.' };
  if (unique && count > size) {
    return { error: `There are only ${size} different numbers from ${min} to ${max}.` };
  }
  if (!unique) return Array.from({ length: count }, () => min + int(size));

  if (size <= SHUFFLE_LIMIT) {
    // A partial Fisher-Yates shuffle: the first `count` places of a shuffled range.
    const pool = Array.from({ length: size }, (_, i) => min + i);
    for (let i = 0; i < count; i++) {
      const j = i + int(size - i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }
  // Too wide to lay out, so draw and redraw repeats. count is small next to
  // size here (count <= 1000, size > 100,000), so a repeat is rare.
  const seen = new Set<number>();
  while (seen.size < count) seen.add(min + int(size));
  return [...seen];
}

/** A Fisher-Yates shuffle: every order equally likely. */
export function shuffle<T>(items: readonly T[], int: IntSource = defaultInt): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The names in a pasted list: lines, or commas when it is all on one line. */
export function parseNames(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const parts = lines.filter((line) => line.trim()).length === 1 ? text.split(/[,;\t]/) : lines;
  return parts.map((part) => part.trim()).filter(Boolean);
}

export type TeamSplit = { teams: number } | { perTeam: number };

/**
 * Shuffles `names` and deals them out like cards, so team sizes never differ
 * by more than one. "3 per team" for 10 people gives 4 teams of 3, 3, 2, 2,
 * rather than 3, 3, 3 and one person on their own.
 */
export function splitTeams(
  names: readonly string[],
  split: TeamSplit,
  int: IntSource = defaultInt,
): string[][] | { error: string } {
  if (names.length < 2) return { error: 'Add at least two names to split into teams.' };
  const teamCount = 'teams' in split ? split.teams : Math.ceil(names.length / split.perTeam);
  if (!Number.isInteger(teamCount) || teamCount < 2) return { error: 'That makes only one team. Ask for at least two.' };
  if (teamCount > names.length) {
    return { error: `${names.length} names cannot fill ${teamCount} teams.` };
  }
  const teams: string[][] = Array.from({ length: teamCount }, () => []);
  shuffle(names, int).forEach((name, i) => teams[i % teamCount].push(name));
  return teams;
}

// --- The wheel -------------------------------------------------------------

/**
 * Which segment sits under the pointer at the top after the wheel has turned
 * `rotation` degrees clockwise. Segment 0 starts at the top and they run
 * clockwise.
 */
export function segmentAt(rotation: number, segments: number): number {
  const size = 360 / segments;
  const under = (((-rotation % 360) + 360) % 360);
  return Math.min(segments - 1, Math.floor(under / size));
}

/**
 * The rotation to animate to so that `winner` stops under the pointer: from
 * `current`, a few whole turns for show, then on to a point inside the
 * winning segment. `offset` (0-1) is where in the segment it stops, kept away
 * from the edges so the pointer never sits on a line. The winner is chosen
 * before the wheel moves; the animation only shows it.
 */
export function wheelRotation(current: number, winner: number, segments: number, offset: number, turns = 5): number {
  const size = 360 / segments;
  const stop = (winner + 0.1 + offset * 0.8) * size;
  const target = (360 - stop) % 360;
  const from = ((current % 360) + 360) % 360;
  return current + turns * 360 + ((target - from + 360) % 360);
}

// --- Results ---------------------------------------------------------------

export type Outcome =
  | { kind: 'coin'; coins: Coin[] }
  | { kind: 'dice'; roll: DiceRoll; sides: number }
  | { kind: 'number'; numbers: number[]; min: number; max: number }
  | { kind: 'name'; name: string; from: number; wheel: boolean }
  | { kind: 'teams'; teams: string[][] };

/**
 * One line of plain text for an outcome: what the live region reads out, what
 * the history keeps, and what Copy puts on the clipboard.
 */
export function describeOutcome(outcome: Outcome): string {
  switch (outcome.kind) {
    case 'coin': {
      if (outcome.coins.length === 1) return outcome.coins[0];
      const heads = outcome.coins.filter((coin) => coin === 'Heads').length;
      return `${heads} heads, ${outcome.coins.length - heads} tails: ${outcome.coins.join(', ')}`;
    }
    case 'dice': {
      const { rolls, total } = outcome.roll;
      const dice = `${rolls.length}d${outcome.sides}`;
      return rolls.length === 1 ? `${dice}: ${total}` : `${dice}: ${rolls.join(' + ')} = ${total}`;
    }
    case 'number':
      return outcome.numbers.length === 1
        ? `${outcome.numbers[0]} (from ${outcome.min} to ${outcome.max})`
        : `${outcome.numbers.join(', ')} (from ${outcome.min} to ${outcome.max})`;
    case 'name':
      return `${outcome.name} (picked from ${outcome.from})`;
    case 'teams':
      return outcome.teams.map((team, i) => `Team ${i + 1}: ${team.join(', ')}`).join('; ');
  }
}
