import { describe, expect, it } from 'vitest';

import { cacheControlFor, IMMUTABLE_CACHE_CONTROL } from './asset-cache';

describe('cacheControlFor', () => {
  it('pins the content-hashed bundles', () => {
    // Real names taken from dist/yydevtools/browser.
    for (const path of [
      '/main-4MABCUTM.js',
      '/chunk-24P2FEDI.js',
      '/styles-YECPLTDH.css',
      '/worker-VFRYLWSD.js',
    ]) {
      expect(cacheControlFor(path), path).toBe(IMMUTABLE_CACHE_CONTROL);
    }
  });

  it('leaves stable filenames on the revalidating default', () => {
    // Every one of these keeps its URL across deploys, so a year-long cache
    // would strand visitors on an old copy.
    for (const path of [
      '/sw.js',
      '/offline.html',
      '/robots.txt',
      '/sitemap.xml',
      '/site.webmanifest',
      '/index.html',
      '/wasm/webp_enc.wasm',
      '/tesseract/worker.min.js',
      '/tesseract/tesseract-core-lstm.wasm.js',
      '/pdfjs/build/pdf.mjs',
      '/pdfjs/web/viewer.css',
    ]) {
      expect(cacheControlFor(path), path).toBeNull();
    }
  });

  it('leaves the prerendered pages alone', () => {
    for (const path of ['/', '/about', '/tools/json-formatter', '/guides/https', '/404']) {
      expect(cacheControlFor(path), path).toBeNull();
    }
  });

  it('requires a real hash, not merely a hyphen', () => {
    expect(cacheControlFor('/vendor-bundle.js')).toBeNull();
    expect(cacheControlFor('/main-lowercase.js')).toBeNull();
    expect(cacheControlFor('/main-TOOLONGHASH.js')).toBeNull();
    expect(cacheControlFor('/main-SHORT12.js')).toBeNull();
  });

  it('does not reach into subdirectories', () => {
    // A hashed name under a stable directory is not something the build emits;
    // matching it would be guessing at a layout that does not exist.
    expect(cacheControlFor('/pdfjs/chunk-24P2FEDI.js')).toBeNull();
  });
});
