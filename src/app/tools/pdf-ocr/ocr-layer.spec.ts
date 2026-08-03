import { describe, expect, it } from 'vitest';

import { horizontalScale, placeWords, sanitiseForPdf, type OcrWord } from './ocr-layer';

/** A confident word occupying the given image-pixel box. */
function word(text: string, box: [number, number, number, number], confidence = 90): OcrWord {
  const [x0, y0, x1, y1] = box;
  return { text, bbox: { x0, y0, x1, y1 }, confidence };
}

describe('placeWords', () => {
  // A page 400pt tall rendered at 2 px/pt is 800px tall.
  const options = { scale: 2, pageHeight: 400 };

  it('flips the y axis so the baseline lands under the ink', () => {
    // Box spans image y 100..140, i.e. 50..70pt from the image top.
    // The PDF baseline is the *bottom* of that box, 400 - 70 = 330.
    const [placed] = placeWords([word('Hello', [20, 100, 120, 140])], options);
    expect(placed).toEqual({ text: 'Hello', x: 10, y: 330, size: 20, targetWidth: 50 });
  });

  it('puts a word at the top of the page near the top of the PDF', () => {
    const [placed] = placeWords([word('Title', [0, 0, 100, 40])], options);
    expect(placed.y).toBe(380);
  });

  it('puts a word at the bottom of the page near y = 0', () => {
    const [placed] = placeWords([word('Footer', [0, 760, 100, 800])], options);
    expect(placed.y).toBe(0);
  });

  it('scales positions by the render scale', () => {
    const [placed] = placeWords([word('x', [200, 200, 300, 240])], { scale: 4, pageHeight: 400 });
    expect(placed.x).toBe(50);
    expect(placed.size).toBe(10);
    expect(placed.targetWidth).toBe(25);
  });

  it('drops words below the confidence floor', () => {
    const words = [word('good', [0, 0, 100, 40], 90), word('rubbish', [0, 50, 100, 90], 12)];
    expect(placeWords(words, options).map((p) => p.text)).toEqual(['good']);
  });

  it('honours a caller-supplied confidence floor', () => {
    const words = [word('maybe', [0, 0, 100, 40], 60)];
    expect(placeWords(words, { ...options, minConfidence: 80 })).toEqual([]);
  });

  it('drops whitespace-only and empty words', () => {
    const words = [word('   ', [0, 0, 100, 40]), word('', [0, 50, 100, 90])];
    expect(placeWords(words, options)).toEqual([]);
  });

  it('drops degenerate boxes', () => {
    const words = [word('sliver', [0, 0, 1, 40]), word('hairline', [0, 0, 100, 1])];
    expect(placeWords(words, options)).toEqual([]);
  });

  it('returns nothing for a nonsensical scale', () => {
    expect(placeWords([word('x', [0, 0, 10, 10])], { scale: 0, pageHeight: 400 })).toEqual([]);
  });
});

describe('horizontalScale', () => {
  it('squeezes a word that is too wide', () => {
    expect(horizontalScale(200, 100)).toBe(0.5);
  });

  it('stretches a word that is too narrow', () => {
    expect(horizontalScale(50, 100)).toBe(2);
  });

  it('clamps absurd ratios rather than distorting a whole line', () => {
    expect(horizontalScale(1, 1000)).toBe(10);
    expect(horizontalScale(1000, 1)).toBe(0.1);
  });

  it('falls back to 1 for unusable measurements', () => {
    expect(horizontalScale(0, 100)).toBe(1);
    expect(horizontalScale(100, 0)).toBe(1);
  });
});

describe('sanitiseForPdf', () => {
  it('leaves ordinary text alone', () => {
    expect(sanitiseForPdf('Invoice 2026-08')).toBe('Invoice 2026-08');
  });

  it('keeps hyphens', () => {
    // Guards a real failure mode: a control-character range written as literal
    // bytes degrades into a lone hyphen and silently eats these.
    expect(sanitiseForPdf('well-known co-operative')).toBe('well-known co-operative');
  });

  it('folds typographic punctuation to ASCII', () => {
    expect(sanitiseForPdf('“don’t — really…”')).toBe('"don\'t - really..."');
  });

  it('keeps accented Latin-1 characters', () => {
    expect(sanitiseForPdf('café naïve Ünter')).toBe('café naïve Ünter');
  });

  it('turns a non-breaking space into an ordinary one', () => {
    expect(sanitiseForPdf(`a${String.fromCharCode(0xa0)}b`)).toBe('a b');
  });

  it('strips control characters', () => {
    const noisy = `a${String.fromCharCode(0x00)}b${String.fromCharCode(0x1f)}c${String.fromCharCode(0x7f)}d`;
    expect(sanitiseForPdf(noisy)).toBe('abcd');
  });

  it('strips characters WinAnsi cannot encode', () => {
    expect(sanitiseForPdf('price 100 ₹ or 日本語')).toBe('price 100  or');
  });

  it('trims the result', () => {
    expect(sanitiseForPdf('  spaced  ')).toBe('spaced');
  });

  it('returns an empty string when nothing survives', () => {
    expect(sanitiseForPdf('日本語')).toBe('');
  });
});
