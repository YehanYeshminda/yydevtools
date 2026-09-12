import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkAllServices, checkService, type Env } from './index';

const env = {
  PDF_COMPRESS_URL: 'https://compress.example',
  PDF_OCR_URL: 'https://ocr.example',
  PDF_CONVERT_URL: 'https://convert.example',
  OFFICE_CONVERT_URL: 'https://office.example',
} as Env;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('checkService', () => {
  it('asks the machine for /health and reports it up', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkService(env, 'ocr');

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    // The machine behind the tool, and its unauthenticated health route.
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://ocr.example/health');
  });

  it('treats a 503 from a machine that lost its tool as down, not as an error', async () => {
    // This is the case /health exists for: Node is up, Ghostscript is not.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('NOT_READY', { status: 503 })));

    const result = await checkService(env, 'compress');

    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(result.error).toBeUndefined();
  });

  it('returns a failure rather than throwing when the machine never answers', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));

    const result = await checkService(env, 'export');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('TimeoutError: timed out');
  });

  it('reports an unconfigured service without inventing a URL', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkService({} as Env, 'office');

    expect(result).toMatchObject({ ok: false, error: 'not configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('checkAllServices', () => {
  it('checks every machine and names the ones that are down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string) =>
        String(input).includes('ocr.example')
          ? new Response('NOT_READY', { status: 503 })
          : new Response('ok', { status: 200 }),
      ),
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const results = await checkAllServices(env);

    expect(results).toHaveLength(4);
    // One line, at error level so the bad runs can be filtered from the good.
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('"down":["ocr"]');
  });

  it('logs a healthy run without raising it to error level', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await checkAllServices(env);

    expect(error).not.toHaveBeenCalled();
    expect(String(log.mock.calls[0][0])).toContain('"down":[]');
  });

  it('one dead machine does not stop the others being checked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string) => {
        if (String(input).includes('compress.example')) {
          throw new Error('connection refused');
        }
        return new Response('ok', { status: 200 });
      }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const results = await checkAllServices(env);

    expect(results.filter((result) => result.ok)).toHaveLength(3);
  });
});
