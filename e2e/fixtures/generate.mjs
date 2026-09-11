/**
 * Builds the binary fixtures the file-based tool tests upload.
 *
 * Generated rather than committed: the PDFs need known page counts and known
 * text for the OCR/convert/split assertions, and a committed binary drifts from
 * what the tests claim about it. Everything here is built from the app's own
 * dependencies, so a fixture can never be newer than the library that reads it.
 *
 * Run: node e2e/fixtures/generate.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import { zipSync, strToU8 } from 'fflate';

const OUT = dirname(fileURLToPath(import.meta.url));
mkdirSync(OUT, { recursive: true });

const write = (name, bytes) => {
  writeFileSync(join(OUT, name), bytes);
  console.log(`  ${name} — ${bytes.length} bytes`);
};

/* PDFs ------------------------------------------------------------------ */

/** A text PDF with `pages` pages, each stamped with its own number. */
async function makePdf(pages, title) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(title, { x: 60, y: 760, size: 24, font, color: rgb(0, 0, 0) });
    page.drawText(`Page ${i} of ${pages}`, { x: 60, y: 710, size: 14, font });
    page.drawText('The quick brown fox jumps over the lazy dog.', {
      x: 60,
      y: 670,
      size: 12,
      font,
    });
  }
  return Buffer.from(await doc.save());
}

/* Images ---------------------------------------------------------------- */

/**
 * A valid 8x8 RGB PNG, built by hand.
 *
 * Hand-built rather than pulled from a library because the only PNG encoder in
 * the tree is a wasm codec meant for the browser; a few CRCs are cheaper than
 * booting that in Node.
 */
function makePng(size = 8) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const cr = Buffer.alloc(4);
    cr.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, cr]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  // 10..12 stay 0: deflate, adaptive filtering, no interlace.

  // One filter byte + RGB triplets per row, in a gradient so the file is not
  // uniformly compressible (a solid colour makes compressor tests meaningless).
  const raw = Buffer.alloc(size * (1 + size * 3));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      raw[o++] = (x * 255) / size;
      raw[o++] = (y * 255) / size;
      raw[o++] = 128;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * A 1x1 baseline JPEG with an EXIF APP1 block carrying Make, Model, DateTime
 * and a GPS position — the four things the EXIF Viewer is asked to surface.
 */
function makeJpegWithExif() {
  // Minimal baseline JPEG (1x1, grey), split so APP1 can be spliced after SOI.
  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
      'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
      'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
    'base64',
  );

  const ascii = (tag, value, offset) => ({ tag, type: 2, count: value.length + 1, offset });
  const strings = { make: 'YYDevTools', model: 'Fixture Cam', date: '2026:03:14 09:41:00' };

  // TIFF header + IFD0 (4 entries + GPS pointer), then the string pool.
  const entries = [];
  const pool = [];
  let poolAt = 8 + 2 + 5 * 12 + 4; // header + count + entries + next-IFD offset

  const pushAscii = (tag, value) => {
    const bytes = Buffer.from(value + '\0', 'ascii');
    entries.push(ascii(tag, value, poolAt));
    pool.push(bytes);
    poolAt += bytes.length + (bytes.length % 2);
    if (bytes.length % 2) pool.push(Buffer.alloc(1));
  };

  pushAscii(0x010f, strings.make);
  pushAscii(0x0110, strings.model);
  pushAscii(0x0132, strings.date);

  const gpsAt = poolAt;
  const ifd0 = Buffer.alloc(2 + 5 * 12 + 4);
  ifd0.writeUInt16LE(entries.length + 2, 0); // + orientation + GPS pointer
  let e = 2;
  for (const entry of entries) {
    ifd0.writeUInt16LE(entry.tag, e);
    ifd0.writeUInt16LE(entry.type, e + 2);
    ifd0.writeUInt32LE(entry.count, e + 4);
    ifd0.writeUInt32LE(entry.offset, e + 8);
    e += 12;
  }
  // Orientation = 1 (SHORT, inline).
  ifd0.writeUInt16LE(0x0112, e);
  ifd0.writeUInt16LE(3, e + 2);
  ifd0.writeUInt32LE(1, e + 4);
  ifd0.writeUInt32LE(1, e + 8);
  e += 12;
  // GPS IFD pointer (LONG, offset).
  ifd0.writeUInt16LE(0x8825, e);
  ifd0.writeUInt16LE(4, e + 2);
  ifd0.writeUInt32LE(1, e + 4);
  ifd0.writeUInt32LE(gpsAt, e + 8);

  // GPS IFD: 51.5074 N, 0.1278 W as rational deg/min/sec.
  const rationals = [];
  let ratAt = gpsAt + 2 + 4 * 12 + 4;
  const pushRational = (tag, triples) => {
    const buf = Buffer.alloc(triples.length * 8);
    triples.forEach(([n, d], i) => {
      buf.writeUInt32LE(n, i * 8);
      buf.writeUInt32LE(d, i * 8 + 4);
    });
    rationals.push({ tag, count: triples.length, offset: ratAt, buf });
    ratAt += buf.length;
  };
  pushRational(0x0002, [
    [51, 1],
    [30, 1],
    [2664, 100],
  ]);
  pushRational(0x0004, [
    [0, 1],
    [7, 1],
    [4008, 100],
  ]);

  const gps = Buffer.alloc(2 + 4 * 12 + 4);
  gps.writeUInt16LE(4, 0);
  let g = 2;
  const refN = Buffer.from('N\0', 'ascii');
  gps.writeUInt16LE(0x0001, g);
  gps.writeUInt16LE(2, g + 2);
  gps.writeUInt32LE(2, g + 4);
  refN.copy(gps, g + 8);
  g += 12;
  gps.writeUInt16LE(rationals[0].tag, g);
  gps.writeUInt16LE(5, g + 2);
  gps.writeUInt32LE(rationals[0].count, g + 4);
  gps.writeUInt32LE(rationals[0].offset, g + 8);
  g += 12;
  const refW = Buffer.from('W\0', 'ascii');
  gps.writeUInt16LE(0x0003, g);
  gps.writeUInt16LE(2, g + 2);
  gps.writeUInt32LE(2, g + 4);
  refW.copy(gps, g + 8);
  g += 12;
  gps.writeUInt16LE(rationals[1].tag, g);
  gps.writeUInt16LE(5, g + 2);
  gps.writeUInt32LE(rationals[1].count, g + 4);
  gps.writeUInt32LE(rationals[1].offset, g + 8);

  const tiff = Buffer.concat([
    Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]), // little-endian, IFD0 @ 8
    ifd0,
    ...pool,
    gps,
    ...rationals.map((r) => r.buf),
  ]);

  const app1Body = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const app1 = Buffer.alloc(4 + app1Body.length);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(app1Body.length + 2, 2);
  app1Body.copy(app1, 4);

  // Splice APP1 straight after SOI, dropping the encoder's own JFIF APP0.
  const app0Len = jpeg.readUInt16BE(4);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(4 + app0Len)]);
}

/* OOXML ----------------------------------------------------------------- */

const CONTENT_TYPES_DOCX = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = (target, type) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${type}" Target="${target}"/>
</Relationships>`;

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>YYDevTools fixture document</w:t></w:r></w:p>
<w:p><w:r><w:t>The quick brown fox jumps over the lazy dog.</w:t></w:r></w:p>
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
</w:body></w:document>`;

const CONTENT_TYPES_XLSX = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Fixture" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const SHEET_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Region</t></is></c><c r="B1" t="inlineStr"><is><t>Requests</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>iad</t></is></c><c r="B2"><v>1284</v></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>fra</t></is></c><c r="B3"><v>903</v></c></row>
</sheetData></worksheet>`;

const OFFICE_DOC_REL =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';
const WORKSHEET_REL =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet';

function makeDocx() {
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8(CONTENT_TYPES_DOCX),
      '_rels/.rels': strToU8(RELS('word/document.xml', OFFICE_DOC_REL)),
      'word/document.xml': strToU8(DOCUMENT_XML),
    }),
  );
}

function makeXlsx() {
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8(CONTENT_TYPES_XLSX),
      '_rels/.rels': strToU8(RELS('xl/workbook.xml', OFFICE_DOC_REL)),
      'xl/_rels/workbook.xml.rels': strToU8(RELS('worksheets/sheet1.xml', WORKSHEET_REL)),
      'xl/workbook.xml': strToU8(WORKBOOK_XML),
      'xl/worksheets/sheet1.xml': strToU8(SHEET_XML),
    }),
  );
}

/* ----------------------------------------------------------------------- */

console.log('Generating e2e fixtures…');
write('sample.pdf', await makePdf(3, 'Annual Report'));
write('sample-2.pdf', await makePdf(2, 'Appendix A'));
write('sample.png', makePng());
write('sample.jpg', makeJpegWithExif());
write('sample.csv', Buffer.from('region,requests,p99\niad,1284,210\nfra,903,188\nsyd,412,264\n'));
write('sample.docx', makeDocx());
write('sample.xlsx', makeXlsx());
console.log('Done.');
