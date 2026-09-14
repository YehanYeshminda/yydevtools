import { describe, expect, it } from 'vitest';

import { toolForFile } from './drop-targets';

describe('toolForFile', () => {
  it('trusts the extension over a blank or wrong MIME type', () => {
    expect(toolForFile('report.PDF', '')).toBe('pdf-viewer');
    expect(toolForFile('deck.pptx', 'application/octet-stream')).toBe('powerpoint-viewer');
    expect(toolForFile('logo.svg', 'image/svg+xml')).toBe('xml-viewer');
  });

  it('falls back to the MIME type when the name says nothing', () => {
    expect(toolForFile('', 'image/webp')).toBe('image-compressor');
    expect(toolForFile('photo', 'application/pdf')).toBe('pdf-viewer');
  });

  it('sends everything else to the inspector', () => {
    expect(toolForFile('archive.zip', 'application/zip')).toBe('file-inspector');
    expect(toolForFile('', '')).toBe('file-inspector');
  });
});
