import { describe, expect, it } from 'vitest';

import { isDeferLoadFailure, isStaleChunkError } from './stale-chunk';

describe('isDeferLoadFailure', () => {
  it('is Angular’s NG0750 and nothing else', () => {
    expect(isDeferLoadFailure(Object.assign(new Error('NG0750'), { code: -750 }))).toBe(true);
    expect(isDeferLoadFailure(Object.assign(new Error('NG0100'), { code: -100 }))).toBe(false);
    expect(isDeferLoadFailure(null)).toBe(false);
    expect(isDeferLoadFailure('NG0750')).toBe(false);
  });
});

describe('isStaleChunkError', () => {
  it('recognises each engine’s failed dynamic import', () => {
    expect(
      isStaleChunkError(
        new TypeError('Failed to fetch dynamically imported module: https://yydevtools.com/chunk-XLK7WJA2.js'),
      ),
    ).toBe(true);
    expect(isStaleChunkError(new TypeError('error loading dynamically imported module: /chunk-A.js'))).toBe(true);
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
  });

  it('leaves every other navigation failure alone', () => {
    expect(isStaleChunkError(new Error('NG04002: Cannot match any routes'))).toBe(false);
    expect(isStaleChunkError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});
