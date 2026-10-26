import { describe, expect, it } from 'vitest';

import {
  describeOutcome,
  flipCoins,
  intSource,
  numbersInRange,
  parseNames,
  rollDice,
  segmentAt,
  shuffle,
  splitTeams,
  wheelRotation,
  type ByteSource,
  type IntSource,
} from './random';

/** Bytes from a script, in order, then zeros. Records how many were asked for. */
function scripted(values: number[]): ByteSource & { calls: number } {
  const queue = [...values];
  const source = Object.assign(
    (count: number) => {
      source.calls++;
      return Array.from({ length: count }, () => queue.shift() ?? 0);
    },
    { calls: 0 },
  );
  return source;
}

/** Counts how often each result comes from every possible first byte. */
function tallyEveryByte(n: number): { counts: number[]; rejected: number[] } {
  const counts = new Array(n).fill(0);
  const rejected: number[] = [];
  for (let byte = 0; byte < 256; byte++) {
    const source = scripted([byte]);
    const value = intSource(source)(n);
    if (source.calls > 1) {
      rejected.push(byte);
    } else {
      counts[value]++;
    }
  }
  return { counts, rejected };
}

describe('randomInt has no modulo bias', () => {
  it('gives each face of a die exactly 42 of the 256 possible bytes, and redraws the other 4', () => {
    const { counts, rejected } = tallyEveryByte(6);
    expect(counts).toEqual([42, 42, 42, 42, 42, 42]);
    expect(rejected).toEqual([252, 253, 254, 255]);

    // The naive byte % 6 that rejection sampling replaces would favour 0-3.
    const naive = new Array(6).fill(0);
    for (let byte = 0; byte < 256; byte++) naive[byte % 6]++;
    expect(naive).toEqual([43, 43, 43, 43, 42, 42]);
  });

  it('is exactly uniform for every size a single byte can serve', () => {
    for (let n = 2; n <= 256; n++) {
      const { counts, rejected } = tallyEveryByte(n);
      const each = Math.floor(256 / n);
      expect(new Set(counts), `n=${n}`).toEqual(new Set([each]));
      expect(rejected.length, `n=${n}`).toBe(256 % n);
    }
  });

  it('uses more bytes, still rejection-sampled, once one byte is not enough', () => {
    // 1000 needs two bytes (0-65535); 65536 - 65536 % 1000 = 65000, so 65000 and up are redrawn.
    const source = scripted([0xfd, 0xe8, 0x00, 0x07]); // 65000, then 7
    expect(intSource(source)(1000)).toBe(7);
    expect(source.calls).toBe(2);
  });

  it('stays fair with the real crypto source (chi-square over 60,000 rolls)', () => {
    const counts = new Array(6).fill(0);
    for (const roll of rollDice(60_000, 6).rolls) counts[roll - 1]++;
    const expected = 10_000;
    const chi = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    // df = 5: 20.5 is p = 0.001, 40 is far beyond any fair run (p < 1e-7).
    expect(chi).toBeLessThan(40);
  });
});

/** An IntSource that replays fixed answers. */
function replay(values: number[]): IntSource {
  const queue = [...values];
  return (n) => {
    const value = queue.shift() ?? 0;
    if (value >= n) throw new Error(`asked for [0, ${n}) but scripted ${value}`);
    return value;
  };
}

describe('coins and dice', () => {
  it('flips heads for 0 and tails for 1', () => {
    expect(flipCoins(3, replay([0, 1, 0]))).toEqual(['Heads', 'Tails', 'Heads']);
  });

  it('rolls 1-based faces and totals them', () => {
    expect(rollDice(3, 20, replay([0, 19, 9]))).toEqual({ rolls: [1, 20, 10], total: 31 });
  });
});

describe('numbersInRange', () => {
  it('includes both ends of the range', () => {
    expect(numbersInRange(1, 10, 2, false, replay([0, 9]))).toEqual([1, 10]);
    expect(numbersInRange(-5, 5, 1, false, replay([0]))).toEqual([-5]);
  });

  it('never repeats when asked for unique numbers, and can use the whole range', () => {
    const all = numbersInRange(1, 50, 50, true);
    expect(Array.isArray(all) && [...all].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    const wide = numbersInRange(1, 10 ** 9, 1000, true);
    expect(Array.isArray(wide) && new Set(wide).size).toBe(1000);
  });

  it('explains what cannot be done', () => {
    expect(numbersInRange(1, 5, 6, true)).toEqual({ error: 'There are only 5 different numbers from 1 to 5.' });
    expect(numbersInRange(10, 1, 1, false)).toHaveProperty('error');
    expect(numbersInRange(1.5, 3, 1, false)).toHaveProperty('error');
    expect(numbersInRange(0, 2 ** 49, 1, false)).toHaveProperty('error');
  });
});

describe('shuffle and teams', () => {
  it('shuffles with Fisher-Yates', () => {
    // i=3 swaps with 0, i=2 with 2, i=1 with 0.
    expect(shuffle(['a', 'b', 'c', 'd'], replay([0, 2, 0]))).toEqual(['b', 'd', 'c', 'a']);
  });

  it('makes every order of three equally likely over all byte draws', () => {
    // Fisher-Yates on 3 items draws int(3) then int(2): 3 x 2 = 6 paths, one per order.
    const orders = new Set<string>();
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 2; b++) orders.add(shuffle(['x', 'y', 'z'], replay([a, b])).join(''));
    }
    expect(orders.size).toBe(6);
  });

  it('parses names by line, or by comma on a single line', () => {
    expect(parseNames('Ada\n\n  Grace \r\nAlan')).toEqual(['Ada', 'Grace', 'Alan']);
    expect(parseNames('Ada, Grace;Alan')).toEqual(['Ada', 'Grace', 'Alan']);
    expect(parseNames('Smith, Ada\nHopper, Grace')).toEqual(['Smith, Ada', 'Hopper, Grace']);
  });

  it('deals teams so sizes differ by at most one', () => {
    const names = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const byCount = splitTeams(names, { teams: 3 });
    expect(Array.isArray(byCount) && byCount.map((t) => t.length)).toEqual([4, 3, 3]);
    const perTeam = splitTeams(names, { perTeam: 3 });
    expect(Array.isArray(perTeam) && perTeam.map((t) => t.length)).toEqual([3, 3, 2, 2]);
    expect(Array.isArray(perTeam) && perTeam.flat().sort()).toEqual([...names].sort());
  });

  it('refuses splits that make no sense', () => {
    expect(splitTeams(['a'], { teams: 2 })).toHaveProperty('error');
    expect(splitTeams(['a', 'b'], { teams: 3 })).toHaveProperty('error');
    expect(splitTeams(['a', 'b', 'c'], { perTeam: 5 })).toHaveProperty('error');
  });
});

describe('the wheel', () => {
  it('stops with the chosen segment under the pointer, whatever it started from', () => {
    for (const segments of [2, 3, 7, 12, 40]) {
      for (const start of [0, 45, 359, 1234.5, -90]) {
        for (let winner = 0; winner < segments; winner++) {
          for (const offset of [0, 0.5, 1]) {
            const rotation = wheelRotation(start, winner, segments, offset);
            expect(segmentAt(rotation, segments), `${segments}/${start}/${winner}/${offset}`).toBe(winner);
            expect(rotation - start).toBeGreaterThanOrEqual(5 * 360);
            expect(rotation - start).toBeLessThan(6 * 360);
          }
        }
      }
    }
  });

  it('reads segment 0 at the top before any turn', () => {
    expect(segmentAt(0, 4)).toBe(0);
    // Turned 100 degrees clockwise, the point 260 degrees round (segment 2) is under the pointer.
    expect(segmentAt(100, 4)).toBe(2);
  });
});

describe('describeOutcome', () => {
  it('reads each kind of result as one line', () => {
    expect(describeOutcome({ kind: 'coin', coins: ['Tails'] })).toBe('Tails');
    expect(describeOutcome({ kind: 'coin', coins: ['Heads', 'Tails', 'Heads'] })).toBe(
      '2 heads, 1 tails: Heads, Tails, Heads',
    );
    expect(describeOutcome({ kind: 'dice', roll: { rolls: [3, 5], total: 8 }, sides: 6 })).toBe('2d6: 3 + 5 = 8');
    expect(describeOutcome({ kind: 'dice', roll: { rolls: [17], total: 17 }, sides: 20 })).toBe('1d20: 17');
    expect(describeOutcome({ kind: 'number', numbers: [4, 9], min: 1, max: 10 })).toBe('4, 9 (from 1 to 10)');
    expect(describeOutcome({ kind: 'name', name: 'Ada', from: 3, wheel: true })).toBe('Ada (picked from 3)');
    expect(describeOutcome({ kind: 'teams', teams: [['a', 'b'], ['c']] })).toBe('Team 1: a, b; Team 2: c');
  });
});
