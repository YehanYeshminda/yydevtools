import { describe, expect, it } from 'vitest';

import { TOOLS } from '../tools/tools.data';
import { SEND_TARGETS, sendFragment } from './send-to';
import { decodeState } from './tool-state';

/**
 * The guard this table was missing.
 *
 * `GUIDES` and `DROP_TARGETS` are both checked against the catalogue; this one
 * was not, so a mistyped slug here failed silently — the menu item appeared,
 * and clicking it navigated to a route that does not exist. Nothing in the
 * build or the type system catches it, because `slug` is only a string.
 */
describe('SEND_TARGETS', () => {
  const known = new Map(TOOLS.map((tool) => [tool.slug, tool]));

  it('only names tools that exist', () => {
    const missing = SEND_TARGETS.filter((target) => !known.has(target.slug)).map(
      (target) => target.slug,
    );
    expect(missing, `no such tool: ${missing.join(', ')}`).toEqual([]);
  });

  it('only offers tools that are built', () => {
    const unready = SEND_TARGETS.filter((target) => known.get(target.slug)?.ready === false).map(
      (target) => target.slug,
    );
    expect(unready, `not ready: ${unready.join(', ')}`).toEqual([]);
  });

  it('names each tool once', () => {
    const slugs = SEND_TARGETS.map((target) => target.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every target a field to put the text in', () => {
    expect(SEND_TARGETS.every((target) => target.field.trim() !== '')).toBe(true);
  });

  it('encodes the text under that target field', () => {
    const target = SEND_TARGETS.find((entry) => entry.slug === 'email-template')!;
    const fragment = new URLSearchParams(sendFragment(target, 'Hi Ada,', 'markdown-editor')!);
    expect(decodeState(fragment.get('s')!)).toEqual({ source: 'Hi Ada,' });
    expect(fragment.get('from')).toBe('markdown-editor');
  });
});
