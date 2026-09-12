import { describe, expect, it } from 'vitest';

import { anchorOf, centeredRect, clampRect, fromCorner, outputSize } from './crop';

describe('clampRect', () => {
  it('keeps the box inside the image and never below the minimum', () => {
    expect(clampRect({ x: -5, y: 10, width: 50, height: 2 }, 100, 80)).toEqual({
      x: 0,
      y: 10,
      width: 50,
      height: 8,
    });
    expect(clampRect({ x: 90, y: 70, width: 50, height: 50 }, 100, 80)).toEqual({
      x: 50,
      y: 30,
      width: 50,
      height: 50,
    });
  });
});

describe('centeredRect', () => {
  it('fits a square into a landscape image, centred horizontally', () => {
    expect(centeredRect(1, 400, 300)).toEqual({ x: 50, y: 0, width: 300, height: 300 });
  });

  it('fits a wide ratio into a portrait image, centred vertically', () => {
    expect(centeredRect(16 / 9, 300, 400)).toEqual({ x: 0, y: 116, width: 300, height: 169 });
  });

  it('is the whole image when the ratio is free', () => {
    expect(centeredRect(null, 300, 400)).toEqual({ x: 0, y: 0, width: 300, height: 400 });
  });
});

describe('fromCorner', () => {
  it('spans anchor to pointer in any direction', () => {
    expect(fromCorner({ x: 0, y: 0 }, { x: 100, y: 50 }, null, 200, 200)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    });
    expect(fromCorner({ x: 100, y: 100 }, { x: 40, y: 70 }, null, 200, 200)).toEqual({
      x: 40,
      y: 70,
      width: 60,
      height: 30,
    });
  });

  it('follows the dominant axis when an aspect ratio is locked', () => {
    // Pointer pushed 100 wide but only 50 tall: the square becomes 100 × 100.
    expect(fromCorner({ x: 0, y: 0 }, { x: 100, y: 50 }, 1, 200, 200)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
  });

  it('shrinks to stay inside the image when the ratio would spill over', () => {
    // Only 80 px of height available below the anchor: the square is capped at 80.
    expect(fromCorner({ x: 0, y: 0 }, { x: 150, y: 20 }, 1, 200, 80)).toEqual({
      x: 0,
      y: 0,
      width: 80,
      height: 80,
    });
    // Dragging up-left from an anchor near the top: room above is the limit.
    const rect = fromCorner({ x: 190, y: 30 }, { x: 20, y: 0 }, 2, 200, 200);
    expect(rect.height).toBe(30);
    expect(rect.width).toBe(60);
    expect(rect.x + rect.width).toBe(190);
    expect(rect.y + rect.height).toBe(30);
  });
});

describe('anchorOf', () => {
  it('is the opposite corner', () => {
    const rect = { x: 10, y: 20, width: 30, height: 40 };
    expect(anchorOf(rect, 'nw')).toEqual({ x: 40, y: 60 });
    expect(anchorOf(rect, 'se')).toEqual({ x: 10, y: 20 });
    expect(anchorOf(rect, 'ne')).toEqual({ x: 10, y: 60 });
    expect(anchorOf(rect, 'sw')).toEqual({ x: 40, y: 20 });
  });
});

describe('outputSize', () => {
  const crop = { x: 0, y: 0, width: 640, height: 480 };

  it('follows the crop when nothing is asked', () => {
    expect(outputSize(crop, { width: null, height: null }, true)).toEqual({
      width: 640,
      height: 480,
    });
  });

  it('derives the other dimension when locked', () => {
    expect(outputSize(crop, { width: 320, height: null }, true)).toEqual({
      width: 320,
      height: 240,
    });
    expect(outputSize(crop, { width: null, height: 120 }, true)).toEqual({
      width: 160,
      height: 120,
    });
    // Both given and locked: width wins.
    expect(outputSize(crop, { width: 320, height: 999 }, true)).toEqual({
      width: 320,
      height: 240,
    });
  });

  it('takes both as given when unlocked', () => {
    expect(outputSize(crop, { width: 100, height: 100 }, false)).toEqual({
      width: 100,
      height: 100,
    });
  });
});
