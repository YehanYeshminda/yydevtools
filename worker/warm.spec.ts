import { describe, expect, it } from 'vitest';

import { warmBaseUrl, type Env } from './index';

const env = {
  PDF_COMPRESS_URL: 'https://compress.example',
  PDF_OCR_URL: 'https://ocr.example',
  PDF_CONVERT_URL: 'https://convert.example',
  OFFICE_CONVERT_URL: 'https://office.example',
} as Env;

describe('warmBaseUrl', () => {
  it('maps each hosted tool to its own machine', () => {
    // The names are the ones the browser sends, and they match the `/api/pdf/*`
    // routes: the converter is "export", not "convert".
    expect(warmBaseUrl(env, 'compress')).toBe('https://compress.example');
    expect(warmBaseUrl(env, 'ocr')).toBe('https://ocr.example');
    expect(warmBaseUrl(env, 'export')).toBe('https://convert.example');
    // One key, not one per tool: Word Viewer and Excel Viewer share a machine.
    expect(warmBaseUrl(env, 'office')).toBe('https://office.example');
  });

  it('refuses anything else, so the query cannot pick the target', () => {
    for (const service of ['', 'convert', 'news', 'https://elsewhere.example', '../ocr']) {
      expect(warmBaseUrl(env, service), service).toBeUndefined();
    }
  });

  it('reports an unconfigured service rather than guessing a URL', () => {
    expect(warmBaseUrl({} as Env, 'compress')).toBeUndefined();
  });
});
