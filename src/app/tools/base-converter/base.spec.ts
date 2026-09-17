import {
  fittingWidth,
  fitsIn,
  fromBits,
  group,
  parseValue,
  popCount,
  toBase,
  toBits,
  toggleBit,
} from './base';

describe('base', () => {
  describe('parseValue', () => {
    it('reads a decimal number', () => {
      expect(parseValue('255', 10)?.value).toBe(255n);
    });

    it('reads in the selected base', () => {
      expect(parseValue('ff', 16)?.value).toBe(255n);
      expect(parseValue('11111111', 2)?.value).toBe(255n);
      expect(parseValue('377', 8)?.value).toBe(255n);
    });

    it('lets a prefix override the selected base', () => {
      const parsed = parseValue('0xff', 10);
      expect(parsed?.value).toBe(255n);
      expect(parsed?.base).toBe(16);
      expect(parsed?.fromPrefix).toBe(true);
      expect(parseValue('0b1010', 10)?.value).toBe(10n);
      expect(parseValue('0o17', 10)?.value).toBe(15n);
    });

    it('is case-insensitive', () => {
      expect(parseValue('0XFF', 10)?.value).toBe(255n);
      expect(parseValue('DEADBEEF', 16)?.value).toBe(3735928559n);
    });

    it('ignores underscores and spaces', () => {
      expect(parseValue('1_000_000', 10)?.value).toBe(1000000n);
      expect(parseValue('1010 1010', 2)?.value).toBe(170n);
    });

    it('reads a negative', () => {
      expect(parseValue('-42', 10)?.value).toBe(-42n);
      expect(parseValue('-0xff', 10)?.value).toBe(-255n);
    });

    it('rejects a digit the base does not have', () => {
      expect(parseValue('2', 2)).toBeNull();
      expect(parseValue('8', 8)).toBeNull();
      expect(parseValue('g', 16)).toBeNull();
    });

    it('rejects a bare prefix', () => {
      expect(parseValue('0x', 10)).toBeNull();
    });

    it('rejects nothing at all', () => {
      expect(parseValue('', 10)).toBeNull();
      expect(parseValue('   ', 10)).toBeNull();
    });

    // The reason the whole file is BigInt: this is above 2^53, where a double
    // would round and hand back a plausible-looking wrong answer.
    it('keeps every bit of a 64-bit value', () => {
      const parsed = parseValue('ffffffffffffffff', 16);
      expect(parsed?.value).toBe(18446744073709551615n);
      expect(toBase(parsed!.value, 10)).toBe('18446744073709551615');
    });
  });

  describe('toBase', () => {
    it('writes the common bases', () => {
      expect(toBase(255n, 2)).toBe('11111111');
      expect(toBase(255n, 8)).toBe('377');
      expect(toBase(255n, 16)).toBe('ff');
      expect(toBase(255n, 36)).toBe('73');
    });

    it('keeps the sign', () => {
      expect(toBase(-255n, 16)).toBe('-ff');
    });
  });

  describe('group', () => {
    it('groups binary in fours from the right', () => {
      expect(group('11111111', 2)).toBe('1111 1111');
      expect(group('101010101', 2)).toBe('1 0101 0101');
    });

    it('groups decimal in threes', () => {
      expect(group('1000000', 10)).toBe('1 000 000');
    });

    it('keeps the sign outside the grouping', () => {
      expect(group('-1000', 10)).toBe('-1 000');
    });

    it('leaves a short value alone', () => {
      expect(group('42', 10)).toBe('42');
    });
  });

  describe('bits', () => {
    it('writes a positive value', () => {
      expect(toBits(5n, 8)).toEqual([false, false, false, false, false, true, false, true]);
    });

    // Two's complement, not sign-and-magnitude: this is what the hardware has.
    it('writes a negative value in two’s complement', () => {
      expect(toBits(-1n, 8).every(Boolean)).toBe(true);
      expect(toBits(-128n, 8)).toEqual([true, false, false, false, false, false, false, false]);
    });

    it('round-trips through fromBits', () => {
      for (const value of [0n, 1n, -1n, 127n, -128n, 12345n, -12345n, 255n, 65535n]) {
        const width = 32;
        expect(fromBits(toBits(value, width), value < 0n)).toBe(value);
      }
    });

    it('reads the same pattern either way', () => {
      const pattern = toBits(255n, 8);
      expect(fromBits(pattern, false)).toBe(255n);
      expect(fromBits(pattern, true)).toBe(-1n);
    });

    it('flips one bit without throwing the value across zero', () => {
      // Bit 7 of an eight-bit value is the last one shown, worth 1.
      expect(toggleBit(0n, 8, 7)).toBe(1n);
      expect(toggleBit(0n, 8, 0)).toBe(128n);
      expect(toggleBit(255n, 8, 7)).toBe(254n);
      // A value that was already negative stays read as signed.
      expect(toggleBit(-1n, 8, 7)).toBe(-2n);
    });

    it('counts set bits', () => {
      expect(popCount(0n, 8)).toBe(0);
      expect(popCount(255n, 8)).toBe(8);
      expect(popCount(-1n, 64)).toBe(64);
    });
  });

  describe('fitsIn', () => {
    // Either reading, so a byte is eight bits whether it is 255 or -1.
    it('covers the signed range below and the unsigned range above', () => {
      expect(fitsIn(255n, 8)).toBe(true);
      expect(fitsIn(256n, 8)).toBe(false);
      expect(fitsIn(-128n, 8)).toBe(true);
      expect(fitsIn(-129n, 8)).toBe(false);
    });

    it('picks the smallest width that holds a value', () => {
      expect(fittingWidth(5n)).toBe(8);
      expect(fittingWidth(255n)).toBe(8);
      expect(fittingWidth(256n)).toBe(16);
      expect(fittingWidth(65535n)).toBe(16);
      expect(fittingWidth(100000n)).toBe(32);
      expect(fittingWidth(2n ** 40n)).toBe(64);
      expect(fittingWidth(2n ** 100n)).toBeNull();
    });
  });
});
