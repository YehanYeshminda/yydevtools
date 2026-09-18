import { describe, expect, it } from 'vitest';

import type { EditableFont } from './font-metrics';
import { findTextRuns, type FormXObject } from './text-runs';

/**
 * The geometry is checked here against arithmetic that can be done by hand, and
 * against pdf.js on real documents in `oracle` runs during development. A font
 * where every glyph is exactly half an em keeps the sums in this file legible:
 * a run of four characters at 10pt is 20 points wide, and no more.
 */
const HALF_EM: EditableFont = {
  resource: 'F1',
  family: 'Test',
  twoByte: false,
  decode: (bytes) => [...bytes],
  textOf: (codes) => String.fromCharCode(...codes),
  widthOf: () => 500,
  encode: (text) => Uint8Array.from(text, (char) => char.charCodeAt(0)),
  missing: () => [],
  isWordSpace: (code) => code === 32,
};

const FONTS = new Map<string, EditableFont>([['F1', HALF_EM]]);

function runs(source: string, options?: Parameters<typeof findTextRuns>[2]) {
  return findTextRuns(
    Uint8Array.from(source, (char) => char.charCodeAt(0) & 0xff),
    FONTS,
    options,
  );
}

describe('findTextRuns', () => {
  it('places a run where its text matrix puts it', () => {
    const [run] = runs('BT /F1 10 Tf 1 0 0 1 60 700 Tm (abcd) Tj ET');
    expect(run.text).toBe('abcd');
    expect(run.x).toBe(60);
    expect(run.y).toBe(700);
    expect(run.width).toBe(20);
    expect(run.size).toBe(10);
  });

  it('carries the page transformation into the position', () => {
    const [run] = runs('q 2 0 0 2 10 20 cm BT /F1 10 Tf 1 0 0 1 5 5 Tm (ab) Tj ET Q');
    expect([run.x, run.y]).toEqual([20, 30]);
    // Both the advance and the painted size are doubled by the matrix.
    expect(run.width).toBe(20);
    expect(run.size).toBe(20);
  });

  it('undoes a transformation when the stack is popped', () => {
    const found = runs(
      'q 3 0 0 3 0 0 cm BT /F1 10 Tf 1 0 0 1 1 1 Tm (a) Tj ET Q BT /F1 10 Tf 1 0 0 1 1 1 Tm (a) Tj ET',
    );
    expect(found.map((run) => run.x)).toEqual([3, 1]);
  });

  it('counts a kerning number as movement without letters', () => {
    const [tightened] = runs('BT /F1 10 Tf 1 0 0 1 0 0 Tm [(ab) 1000 (cd)] TJ ET');
    expect(tightened.text).toBe('abcd');
    // Four half-em glyphs at 10pt is 20; a positive number is subtracted, so a
    // whole em of it pulls the second pair a full 10 points closer.
    expect(tightened.width).toBe(10);

    const [loosened] = runs('BT /F1 10 Tf 1 0 0 1 0 0 Tm [(ab) -1000 (cd)] TJ ET');
    expect(loosened.width).toBe(30);
  });

  it('adds character and word spacing the way a viewer does', () => {
    const [plain] = runs('BT /F1 10 Tf 1 0 0 1 0 0 Tm (a b) Tj ET');
    expect(plain.width).toBe(15);
    const [spaced] = runs('BT /F1 10 Tf 2 Tc 5 Tw 1 0 0 1 0 0 Tm (a b) Tj ET');
    // Three glyphs gain 2 each, and the one space gains another 5.
    expect(spaced.width).toBe(15 + 6 + 5);
  });

  it('scales the advance horizontally without scaling the size', () => {
    const [run] = runs('BT /F1 10 Tf 50 Tz 1 0 0 1 0 0 Tm (abcd) Tj ET');
    expect(run.width).toBe(10);
    expect(run.size).toBe(10);
    expect(run.horizontal).toBe(0.5);
  });

  it('moves down a line for Td, TD and T*', () => {
    const found = runs(
      'BT /F1 10 Tf 1 0 0 1 0 500 Tm 10 -20 Td (a) Tj 0 -30 TD (b) Tj T* (c) Tj ET',
    );
    expect(found.map((run) => [run.x, run.y])).toEqual([
      [10, 480],
      [10, 450],
      [10, 420],
    ]);
  });

  it('treats \' as a new line and " as spacing plus a new line', () => {
    const found = runs('BT /F1 10 Tf 12 TL 1 0 0 1 0 100 Tm (a) Tj (b) \' 3 1 (c) " ET');
    expect(found.map((run) => run.y)).toEqual([100, 88, 76]);
    expect(found[2].wordSpacing).toBe(3);
    expect(found[2].charSpacing).toBe(1);
  });

  it('records the fill colour a run was drawn in', () => {
    const found = runs(
      'BT /F1 10 Tf 1 0 0 1 0 0 Tm 1 0 0 rg (a) Tj .5 g (b) Tj 0 0 0 1 k (c) Tj ET',
    );
    expect(found.map((run) => run.color)).toEqual(['#ff0000', '#808080', '#000000']);
  });

  it('marks the invisible text mode a scan hides its transcript in', () => {
    const found = runs('BT /F1 10 Tf 1 0 0 1 0 0 Tm 3 Tr (hidden) Tj 0 Tr (shown) Tj ET');
    expect(found.map((run) => run.invisible)).toEqual([true, false]);
  });

  it('marks a run that does not read left to right', () => {
    const [run] = runs('BT /F1 10 Tf 0 1 -1 0 60 700 Tm (side) Tj ET');
    expect(run.rotated).toBe(true);
  });

  it('skips a show operator whose font was never set', () => {
    expect(runs('BT (nothing) Tj ET')).toEqual([]);
  });

  it('remembers which operator drew a run, and the bytes it occupies', () => {
    const source = 'BT /F1 10 Tf 1 0 0 1 0 0 Tm [(a)] TJ ET';
    const [run] = runs(source);
    expect(run.opText).toBe('TJ');
    expect(source.slice(run.start, run.end)).toBe('[(a)] TJ');
  });
});

describe('form XObjects', () => {
  const inner = 'BT /F1 10 Tf 1 0 0 1 5 5 Tm (in) Tj ET';

  function form(matrix: FormXObject['matrix']): FormXObject {
    return {
      id: 'form-1',
      bytes: Uint8Array.from(inner, (char) => char.charCodeAt(0)),
      fonts: FONTS,
      matrix,
      resolve: () => null,
    };
  }

  it('follows Do and names the stream its runs came from', () => {
    const found = runs('q 1 0 0 1 100 200 cm /X1 Do Q', {
      resolve: (name) => (name === 'X1' ? form([1, 0, 0, 1, 0, 0]) : null),
      streamId: 'page:0',
    });
    expect(found).toHaveLength(1);
    expect(found[0].text).toBe('in');
    expect([found[0].x, found[0].y]).toEqual([105, 205]);
    expect(found[0].streamId).toBe('form-1');
  });

  it("applies the form's own matrix before the one in force", () => {
    const found = runs('q 1 0 0 1 100 0 cm /X1 Do Q', {
      resolve: () => form([2, 0, 0, 2, 0, 0]),
      streamId: 'page:0',
    });
    expect([found[0].x, found[0].y]).toEqual([110, 10]);
    expect(found[0].width).toBe(20);
  });

  it('stops rather than spins when a form draws itself', () => {
    const recursive: FormXObject = {
      id: 'loop',
      bytes: Uint8Array.from('/X1 Do', (char) => char.charCodeAt(0)),
      fonts: FONTS,
      matrix: [1, 0, 0, 1, 0, 0],
      resolve: () => recursive,
    };
    expect(runs('/X1 Do', { resolve: () => recursive })).toEqual([]);
  });

  it('leaves Do alone when nothing can resolve it', () => {
    expect(runs('/X1 Do')).toEqual([]);
  });
});
