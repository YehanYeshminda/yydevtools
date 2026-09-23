import { describe, expect, it } from 'vitest';

import { TOOLS } from '../tools/tools.data';
import { OPEN_IN_SLUGS, openTargets } from './open-in';

const slugs = (name: string, mime: string) => openTargets(name, mime).map((tool) => tool.slug);

describe('openTargets', () => {
  it('puts the viewer for a type first', () => {
    expect(slugs('decoded.pdf', 'application/pdf')[0]).toBe('pdf-viewer');
    expect(slugs('decoded.png', 'image/png')[0]).toBe('image-viewer');
    expect(slugs('decoded.svg', 'image/svg+xml')[0]).toBe('image-viewer');
  });

  it('goes by MIME when the name says nothing, as with a data URI', () => {
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(slugs('decoded.bin', docx)[0]).toBe('word-viewer');
  });

  it('trusts the extension over a wrong MIME', () => {
    expect(slugs('report.pdf', 'application/octet-stream')[0]).toBe('pdf-viewer');
  });

  it('still offers the any-file tools for something unrecognised', () => {
    expect(slugs('decoded.bin', 'application/octet-stream')).toEqual(['file-inspector']);
  });

  it('lists each tool once', () => {
    const list = slugs('decoded.png', 'image/png');
    expect(new Set(list).size).toBe(list.length);
  });

  it('only names tools that exist and are built', () => {
    const ready = new Set(TOOLS.filter((tool) => tool.ready).map((tool) => tool.slug));
    expect(OPEN_IN_SLUGS.filter((slug) => !ready.has(slug))).toEqual([]);
  });
});
