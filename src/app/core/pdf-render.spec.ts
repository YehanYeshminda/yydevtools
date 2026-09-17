import { afterEach, describe, expect, it, vi } from 'vitest';

import { withRenderFrames } from './pdf-render';

/**
 * The frame shim, on its own.
 *
 * pdf.js is not involved here and does not need to be: what it does with the
 * frames is its business, and what is worth pinning down is that a hidden page
 * gets them at all, that cancelling still works, and that the browser's own
 * requestAnimationFrame is handed back exactly as it was found. The last one is
 * the part that would go unnoticed — a shim left installed is invisible until
 * something else on the page starts behaving strangely.
 */

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
}

afterEach(() => {
  setHidden(false);
  vi.useRealTimers();
});

describe('withRenderFrames', () => {
  it('delivers frames while the page is hidden, without waiting on the browser', async () => {
    setHidden(true);
    // The browser's own one is what stops firing in a hidden tab. jsdom's keeps
    // going, so asserting only that the callback ran would pass with no shim at
    // all — what has to be true is that the request never reached it.
    const real = vi.spyOn(window, 'requestAnimationFrame');
    const drawn: number[] = [];

    await withRenderFrames(
      () =>
        new Promise<void>((resolve) => {
          // Two slices, the way a render asks for its next chunk.
          requestAnimationFrame((time) => {
            drawn.push(time);
            requestAnimationFrame((next) => {
              drawn.push(next);
              resolve();
            });
          });
        }),
    );

    expect(drawn).toHaveLength(2);
    expect(real).not.toHaveBeenCalled();
    real.mockRestore();
  });

  it('hands the page back its own requestAnimationFrame', async () => {
    const before = window.requestAnimationFrame;
    const beforeCancel = window.cancelAnimationFrame;

    await withRenderFrames(async () => {
      expect(window.requestAnimationFrame).not.toBe(before);
    });

    expect(window.requestAnimationFrame).toBe(before);
    expect(window.cancelAnimationFrame).toBe(beforeCancel);
  });

  it('keeps the shim up until the last overlapping render is done', async () => {
    const before = window.requestAnimationFrame;
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const outer = withRenderFrames(() => held);
    await withRenderFrames(async () => undefined);

    // The inner render finished, but the outer one is still going.
    expect(window.requestAnimationFrame).not.toBe(before);
    release();
    await outer;
    expect(window.requestAnimationFrame).toBe(before);
  });

  it('cancels a hidden frame it issued, and passes real handles through', async () => {
    setHidden(true);
    let fired = false;

    await withRenderFrames(async () => {
      const handle = requestAnimationFrame(() => {
        fired = true;
      });
      // Negative, so it can never be mistaken for one the browser issued.
      expect(handle).toBeLessThan(0);
      cancelAnimationFrame(handle);
      // A handle the shim never issued is the browser's to deal with; the point
      // is that it does not throw or silently swallow it.
      expect(() => cancelAnimationFrame(1)).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    expect(fired).toBe(false);
  });

  it('leaves a visible page on the browser’s own frames', async () => {
    setHidden(false);
    const real = vi.spyOn(window, 'requestAnimationFrame');

    await withRenderFrames(async () => {
      // The spy is captured as "the real one" by the shim, so a call inside
      // must reach it rather than the timer path.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

    expect(real).toHaveBeenCalled();
    real.mockRestore();
  });
});
