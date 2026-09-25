import { describe, expect, it } from 'vitest';

import { canonicalPath } from './canonical-path';

describe('canonicalPath', () => {
  it('leaves canonical paths alone', () => {
    for (const path of ['/', '/tools/json-formatter', '/guides', '/robots.txt', '/og-image.png']) {
      expect(canonicalPath(path), path).toBeNull();
    }
  });

  it('drops a trailing slash', () => {
    expect(canonicalPath('/tools/json-formatter/')).toBe('/tools/json-formatter');
    expect(canonicalPath('/guides/')).toBe('/guides');
    expect(canonicalPath('/guides//')).toBe('/guides');
  });

  it('drops index.html', () => {
    expect(canonicalPath('/index.html')).toBe('/');
    expect(canonicalPath('/tools/json-formatter/index.html')).toBe('/tools/json-formatter');
  });

  it('collapses a root made only of slashes', () => {
    expect(canonicalPath('//')).toBe('/');
  });
});
