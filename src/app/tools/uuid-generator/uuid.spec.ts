import { describe, expect, it } from 'vitest';

import {
  NAMESPACES,
  createUuidV7Generator,
  describeUuid,
  formatUuid,
  parseUuid,
  uuidV4,
  uuidV5,
} from './uuid';

const field = (uuid: string, label: string) =>
  describeUuid(parseUuid(uuid)!).fields.find((f) => f.label === label)?.value;

/** A fill that hands out a fixed byte, so every random bit is known. */
const fixedFill = (byte: number) => (bytes: Uint8Array) => bytes.fill(byte);

describe('uuidV4', () => {
  it('has version 4 and the RFC variant', () => {
    for (let i = 0; i < 50; i++) {
      expect(uuidV4()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });
});

describe('createUuidV7Generator', () => {
  it('puts the millisecond timestamp, version, counter and variant where RFC 9562 says', () => {
    // 0x017F22E279B0 is the RFC 9562 appendix A.6 example time.
    const next = createUuidV7Generator(() => 0x017f22e279b0, fixedFill(0xff));
    const uuid = next();
    expect(uuid.slice(0, 13)).toBe('017f22e2-79b0');
    expect(uuid[14]).toBe('7');
    // Seed is 0xffff masked to 11 bits: 0x7ff, so rand_a reads 7ff.
    expect(uuid.slice(14, 18)).toBe('77ff');
    // Variant 10, then all-ones random bits.
    expect(uuid.slice(19)).toBe('bfff-ffffffffffff');
    expect(field(uuid, 'Timestamp (UTC)')).toBe('2022-02-22T19:22:22.000Z');
  });

  it('stays strictly increasing within one millisecond, past the counter, and when the clock steps back', () => {
    const times = [5000, ...Array(5000).fill(5000), 4000, 4000];
    let i = 0;
    const next = createUuidV7Generator(() => times[Math.min(i++, times.length - 1)]);
    const batch = times.map(() => next());
    for (let k = 1; k < batch.length; k++) {
      expect(batch[k] > batch[k - 1], `${batch[k - 1]} then ${batch[k]}`).toBe(true);
    }
    // 5001 values in one millisecond overflow the 12-bit counter at least once,
    // so the timestamp was borrowed forward rather than the order breaking.
    expect(parseInt(batch.at(-1)!.replace(/-/g, '').slice(0, 12), 16)).toBeGreaterThan(5000);
  });

  it('reseeds the counter when the millisecond moves on', () => {
    let t = 1;
    const next = createUuidV7Generator(() => t, fixedFill(0));
    expect(next().slice(14, 18)).toBe('7000');
    expect(next().slice(14, 18)).toBe('7001');
    t = 2;
    expect(next().slice(14, 18)).toBe('7000');
  });
});

describe('uuidV5', () => {
  it('matches the RFC 9562 appendix A.4 vector', async () => {
    expect(await uuidV5('www.example.com', NAMESPACES.dns)).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });

  it('matches Python uuid.uuid5(NAMESPACE_DNS, "python.org")', async () => {
    expect(await uuidV5('python.org', NAMESPACES.dns)).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
  });

  it('hashes the name as UTF-8 and depends on the namespace', async () => {
    const a = await uuidV5('café', NAMESPACES.url);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab]/);
    expect(await uuidV5('café', NAMESPACES.dns)).not.toBe(a);
    expect(await uuidV5('café', NAMESPACES.url)).not.toBe(a);
  });

  it('rejects a namespace that is not a UUID', async () => {
    await expect(uuidV5('x', 'not-a-uuid')).rejects.toThrow();
  });
});

describe('parseUuid and formatUuid', () => {
  const uuid = '919108f7-52d1-4320-9bac-f847db4148a8';

  it('round-trips every output format, in either case', () => {
    for (const format of ['standard', 'compact', 'braces', 'urn', 'base64url'] as const) {
      for (const upper of [false, true]) {
        const text = formatUuid(uuid, format, upper);
        expect(describeUuid(parseUuid(text)!).canonical, `${format} ${upper}`).toBe(uuid);
      }
    }
  });

  it('writes each format as documented', () => {
    expect(formatUuid(uuid, 'compact', true)).toBe('919108F752D143209BACF847DB4148A8');
    expect(formatUuid(uuid, 'braces', true)).toBe('{919108F7-52D1-4320-9BAC-F847DB4148A8}');
    expect(formatUuid(uuid, 'urn', true)).toBe('urn:uuid:919108F7-52D1-4320-9BAC-F847DB4148A8');
    expect(formatUuid(uuid, 'base64url', true)).toBe('kZEI91LRQyCbrPhH20FIqA');
  });

  it('ignores whitespace and accepts an uppercase URN prefix', () => {
    expect(parseUuid('  URN:UUID:919108F7-52D1-4320-9BAC-F847DB4148A8 \n')).not.toBeNull();
  });

  it('rejects near misses', () => {
    for (const bad of [
      '',
      '919108f7-52d1-4320-9bac-f847db4148a',
      '919108f7-52d1-4320-9bac-f847db4148a8a',
      '919108f752d1-4320-9bac-f847db4148a8',
      '919108f7-52d1-4320-9bac-f847db4148g8',
      '{919108f7-52d1-4320-9bac-f847db4148a8',
      // Valid base64url characters, but the spare low bits of the last one are set.
      'kZEI91LRQyCbrPhH20FIqB',
    ]) {
      expect(parseUuid(bad), bad).toBeNull();
    }
  });
});

describe('describeUuid', () => {
  it('decodes the RFC 9562 v1 example', () => {
    const uuid = 'C232AB00-9414-11EC-B3C8-9F6BDECED846';
    const report = describeUuid(parseUuid(uuid)!);
    expect(report.summary).toMatch(/^Version 1/);
    expect(field(uuid, 'Timestamp (UTC)')).toBe('2022-02-22T19:22:22.0000000Z');
    expect(field(uuid, 'Clock sequence')).toBe(String(0x33c8));
    expect(field(uuid, 'Node')).toMatch(/^9f:6b:de:ce:d8:46 \(multicast bit set/);
  });

  it('decodes the RFC 9562 v6 example to the same moment', () => {
    const uuid = '1EC9414C-232A-6B00-B3C8-9F6BDECED846';
    expect(describeUuid(parseUuid(uuid)!).summary).toMatch(/^Version 6/);
    expect(field(uuid, 'Timestamp (UTC)')).toBe('2022-02-22T19:22:22.0000000Z');
  });

  it('keeps the 100-nanosecond digits of a v1 timestamp', () => {
    // One tick after the A.5 example.
    expect(field('C232AB01-9414-11EC-B3C8-9F6BDECED846', 'Timestamp (UTC)')).toBe(
      '2022-02-22T19:22:22.0000001Z',
    );
  });

  it('decodes the RFC 9562 v7 example', () => {
    const uuid = '017F22E2-79B0-7CC3-98C4-DC0C0C07398F';
    expect(describeUuid(parseUuid(uuid)!).summary).toMatch(/^Version 7/);
    expect(field(uuid, 'Timestamp (UTC)')).toBe('2022-02-22T19:22:22.000Z');
    expect(field(uuid, 'Unix milliseconds')).toBe('1645557742000');
  });

  it('names v3, v4, v5 and v8 without inventing a timestamp', () => {
    for (const [uuid, version] of [
      ['5df41881-3aed-3515-88a7-2f4a814cf09e', 3],
      ['919108f7-52d1-4320-9bac-f847db4148a8', 4],
      ['2ed6657d-e927-568b-95e1-2665a8aea6a2', 5],
      ['2489E9AD-2EE2-8E00-8EC9-32D5F69181C0', 8],
    ] as const) {
      expect(describeUuid(parseUuid(uuid)!).summary).toMatch(new RegExp(`^Version ${version}:`));
      expect(field(uuid, 'Timestamp (UTC)')).toBeUndefined();
    }
  });

  it('recognises nil and max', () => {
    expect(describeUuid(parseUuid('00000000-0000-0000-0000-000000000000')!).summary).toMatch(/nil/);
    expect(describeUuid(parseUuid('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF')!).summary).toMatch(/max/);
  });

  it('refuses a version to a value whose variant is not the RFC one', () => {
    // Variant nibble c: the Microsoft reserved layout.
    const report = describeUuid(parseUuid('919108f7-52d1-4320-cbac-f847db4148a8')!);
    expect(report.summary).toMatch(/^Not an RFC 9562 UUID/);
    expect(report.fields.find((f) => f.label === 'Version')).toBeUndefined();
  });

  it('flags an undefined version number', () => {
    expect(describeUuid(parseUuid('919108f7-52d1-f320-9bac-f847db4148a8')!).summary).toMatch(
      /not defined/,
    );
  });
});
