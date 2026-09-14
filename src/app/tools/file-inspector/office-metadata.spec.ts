import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { readOfficeMetadata, stripOfficeMetadata } from './office-metadata';

const CORE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="x" xmlns:dc="y" xmlns:dcterms="z" xmlns:xsi="w">
<dc:title>Q3 plan</dc:title><dc:creator>Priya &amp; Co</dc:creator>
<cp:lastModifiedBy>Sam</cp:lastModifiedBy><cp:revision>7</cp:revision>
<dcterms:created xsi:type="dcterms:W3CDTF">2026-01-02T03:04:05Z</dcterms:created>
</cp:coreProperties>`;

const APP = `<Properties><Application>Microsoft Office Word</Application><Company>Acme</Company><TotalTime>42</TotalTime><Words>120</Words></Properties>`;

const DOCUMENT = `<w:document><w:body><w:ins w:id="1" w:author="Sam" w:date="x"><w:r/></w:ins><w:del w:author="Priya"/></w:body></w:document>`;
const COMMENTS = `<w:comments><w:comment w:id="0" w:author="Lee"/><w:comment w:id="1" w:author="Sam"/></w:comments>`;

const RELS = `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail" Target="docProps/thumbnail.jpeg"/><Relationship Id="rId2" Type="core" Target="docProps/core.xml"/></Relationships>`;

function docx(extra: Record<string, string> = {}): Uint8Array {
  const parts: Record<string, Uint8Array> = {};
  for (const [name, xml] of Object.entries({
    'docProps/core.xml': CORE,
    'docProps/app.xml': APP,
    'word/document.xml': DOCUMENT,
    'word/comments.xml': COMMENTS,
    '_rels/.rels': RELS,
    'docProps/thumbnail.jpeg': 'JPEG',
    ...extra,
  })) {
    parts[name] = strToU8(xml);
  }
  return zipSync(parts);
}

describe('readOfficeMetadata', () => {
  it('reads core and app properties, decoding entities', () => {
    const meta = readOfficeMetadata(docx())!;
    expect(meta.fields).toEqual(
      expect.arrayContaining([
        { label: 'Title', value: 'Q3 plan', identifying: false },
        { label: 'Author', value: 'Priya & Co', identifying: true },
        { label: 'Last modified by', value: 'Sam', identifying: true },
        { label: 'Created', value: '2026-01-02T03:04:05Z', identifying: true },
        { label: 'Company', value: 'Acme', identifying: true },
        { label: 'Words', value: '120', identifying: false },
      ]),
    );
    expect(meta.hasThumbnail).toBe(true);
  });

  it('counts comments and tracked changes and names their authors', () => {
    const meta = readOfficeMetadata(docx())!;
    expect(meta.comments).toBe(2);
    expect(meta.revisions).toBe(2);
    expect(meta.authors.sort()).toEqual(['Lee', 'Priya', 'Sam']);
  });

  it('returns null for something that is not an Office package', () => {
    expect(readOfficeMetadata(strToU8('not a zip'))).toBeNull();
    expect(readOfficeMetadata(zipSync({ 'a.txt': strToU8('x') }))).toBeNull();
  });
});

describe('stripOfficeMetadata', () => {
  it('removes the identifying properties and the thumbnail, leaving the body untouched', () => {
    const clean = unzipSync(stripOfficeMetadata(docx())!);

    const core = strFromU8(clean['docProps/core.xml']);
    expect(core).not.toMatch(/creator|lastModifiedBy|created|revision|title/);
    expect(core).toMatch(/<cp:coreProperties/);

    const app = strFromU8(clean['docProps/app.xml']);
    expect(app).not.toMatch(/Company|TotalTime/);
    expect(app).toMatch(/<Words>120<\/Words>/);

    expect(clean['docProps/thumbnail.jpeg']).toBeUndefined();
    expect(strFromU8(clean['_rels/.rels'])).not.toMatch(/thumbnail/);
    expect(strFromU8(clean['_rels/.rels'])).toMatch(/core\.xml/);

    expect(strFromU8(clean['word/document.xml'])).toBe(DOCUMENT);
    expect(readOfficeMetadata(stripOfficeMetadata(docx())!)!.fields.map((f) => f.label)).toEqual([
      'Application',
      'Words',
    ]);
  });

  it('returns null when there is nothing to remove', () => {
    const bare = zipSync({
      'docProps/core.xml': strToU8('<cp:coreProperties/>'),
      'word/document.xml': strToU8(DOCUMENT),
    });
    expect(stripOfficeMetadata(bare)).toBeNull();
  });
});
