/**
 * Writing the draft as a Word document.
 *
 * A `.docx` is a zip of XML parts, so this needs no library beyond the one
 * already bundling files elsewhere on the site — `core/zip.ts`, which runs
 * fflate. What it does need is exactness, because Word's failure mode is a
 * dialog saying the content is unreadable and nothing at all about which of the
 * six parts was wrong. The things that actually go wrong:
 *
 *  - **Namespaces.** `w:` and `r:` must be the full OOXML URIs, character for
 *    character. A typo here is the unreadable-content dialog.
 *  - **Relationships.** A hyperlink is not a URL in the document; it is an
 *    `r:id` pointing at an entry in `document.xml.rels`, and the two must
 *    agree. A duplicated or dangling id is a corrupt file, not a dead link.
 *  - **Illegal characters.** XML 1.0 forbids most control characters outright,
 *    and a lone surrogate is not a character at all. Either will come through a
 *    paste from a PDF or a terminal, and either makes the file unopenable.
 *  - **Whitespace.** Word discards leading and trailing space in a run unless
 *    the run says `xml:space="preserve"`.
 *
 * Lists use a real `numbering.xml` rather than a literal bullet character, so
 * that what arrives in Word is a list you can add to and renumber rather than
 * paragraphs that merely look like one.
 */
import { buildZip } from '../../core/zip';
import type { Block, Draft, Span } from './draft';
import { safeHref } from './email-html';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CONTENT_TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';
const OFFICE_DOC = `${R}/officeDocument`;
const STYLES_REL = `${R}/styles`;
const NUMBERING_REL = `${R}/numbering`;
const HYPERLINK_REL = `${R}/hyperlink`;

const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** The media type a `.docx` is served and saved as. */
export const DOCX_MEDIA_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Bullets and numbers, as defined in numbering.xml below. */
const BULLET_NUM = 1;
const DECIMAL_NUM = 2;

/**
 * Relationship ids reserved for the parts that are always present.
 *
 * Hyperlinks are numbered from after them. Overlapping would put two
 * relationships under one id, which is a corrupt package rather than a link
 * that merely goes to the wrong place.
 */
const STYLES_ID = 'rId1';
const NUMBERING_ID = 'rId2';
const FIRST_LINK_ID = 3;

/** Collects the external links a document refers to, one entry per target. */
class Links {
  private readonly byTarget = new Map<string, string>();

  /** The `r:id` for `target`, creating the relationship the first time. */
  id(target: string): string {
    const existing = this.byTarget.get(target);
    if (existing) {
      return existing;
    }
    const id = `rId${this.byTarget.size + FIRST_LINK_ID}`;
    this.byTarget.set(target, id);
    return id;
  }

  entries(): { id: string; target: string }[] {
    return [...this.byTarget].map(([target, id]) => ({ id, target }));
  }
}

/** The draft as the bytes of a `.docx`. */
export async function renderDocx(draft: Draft): Promise<Uint8Array> {
  const links = new Links();
  const paragraphs: string[] = [];

  const subject = draft.subject?.trim();
  if (subject) {
    paragraphs.push(paragraph([{ text: subject }], links, { style: 'Heading1' }));
  }
  for (const block of draft.blocks) {
    paragraphs.push(...blockToXml(block, links));
  }
  // Word wants a body with something in it; an empty one opens as a damaged
  // file rather than as a blank page.
  if (paragraphs.length === 0) {
    paragraphs.push('<w:p/>');
  }

  const document =
    `${DECLARATION}\n<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>` +
    paragraphs.join('') +
    SECTION +
    '</w:body></w:document>';

  return buildZip([
    // [Content_Types].xml goes first: it is the part a reader looks for to
    // learn what everything else in the package is.
    { name: '[Content_Types].xml', bytes: utf8(contentTypes()) },
    { name: '_rels/.rels', bytes: utf8(packageRels()) },
    { name: 'word/document.xml', bytes: utf8(document) },
    { name: 'word/_rels/document.xml.rels', bytes: utf8(documentRels(links)) },
    { name: 'word/styles.xml', bytes: utf8(STYLES) },
    { name: 'word/numbering.xml', bytes: utf8(NUMBERING) },
  ]);
}

// --- Parts ----------------------------------------------------------------

function contentTypes(): string {
  return (
    `${DECLARATION}\n<Types xmlns="${CONTENT_TYPES}">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    `<Override PartName="/word/document.xml" ContentType="${DOCX_MEDIA_TYPE}.main+xml"/>` +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
    '</Types>'
  );
}

function packageRels(): string {
  return (
    `${DECLARATION}\n<Relationships xmlns="${PKG_REL}">` +
    `<Relationship Id="rId1" Type="${OFFICE_DOC}" Target="word/document.xml"/>` +
    '</Relationships>'
  );
}

function documentRels(links: Links): string {
  const external = links
    .entries()
    .map(
      ({ id, target }) =>
        `<Relationship Id="${id}" Type="${HYPERLINK_REL}" Target="${esc(target)}" TargetMode="External"/>`,
    )
    .join('');
  return (
    `${DECLARATION}\n<Relationships xmlns="${PKG_REL}">` +
    `<Relationship Id="${STYLES_ID}" Type="${STYLES_REL}" Target="styles.xml"/>` +
    `<Relationship Id="${NUMBERING_ID}" Type="${NUMBERING_REL}" Target="numbering.xml"/>` +
    external +
    '</Relationships>'
  );
}

/** A4 with 2cm margins, in twips — 1440 to the inch. */
const SECTION =
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
  '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>' +
  '</w:sectPr>';

/** Sizes are half-points: 22 is 11pt. */
const STYLES =
  `${DECLARATION}\n<w:styles xmlns:w="${W}">` +
  '<w:docDefaults><w:rPrDefault><w:rPr>' +
  '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/>' +
  '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>' +
  '<w:spacing w:after="160" w:line="259" w:lineRule="auto"/>' +
  '</w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  heading(1, 32, 0) +
  heading(2, 26, 1) +
  heading(3, 24, 2) +
  '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/>' +
  '<w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>' +
  '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/>' +
  '<w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>' +
  '</w:styles>';

function heading(level: number, halfPoints: number, outline: number): string {
  return (
    `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/>` +
    '<w:basedOn w:val="Normal"/>' +
    `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${outline}"/></w:pPr>` +
    `<w:rPr><w:b/><w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/></w:rPr></w:style>`
  );
}

/**
 * One bullet definition and one decimal one.
 *
 * The indent is stated on the level rather than left to the style, because
 * Word resolves a list's indent from the numbering definition first and a
 * missing one gives bullets hanging off the left margin.
 */
const NUMBERING =
  `${DECLARATION}\n<w:numbering xmlns:w="${W}">` +
  numberingLevel(0, 'bullet', '&#8226;') +
  numberingLevel(1, 'decimal', '%1.') +
  `<w:num w:numId="${BULLET_NUM}"><w:abstractNumId w:val="0"/></w:num>` +
  `<w:num w:numId="${DECIMAL_NUM}"><w:abstractNumId w:val="1"/></w:num>` +
  '</w:numbering>';

function numberingLevel(abstractId: number, format: string, text: string): string {
  return (
    `<w:abstractNum w:abstractNumId="${abstractId}"><w:lvl w:ilvl="0">` +
    '<w:start w:val="1"/>' +
    `<w:numFmt w:val="${format}"/>` +
    `<w:lvlText w:val="${text}"/>` +
    '<w:lvlJc w:val="left"/>' +
    '<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>' +
    '</w:lvl></w:abstractNum>'
  );
}

// --- Blocks ---------------------------------------------------------------

function blockToXml(block: Block, links: Links): string[] {
  switch (block.kind) {
    case 'heading':
      return [paragraph(block.spans, links, { style: `Heading${block.level}` })];
    case 'paragraph':
      return [paragraph(block.spans, links, {})];
    case 'list':
      return block.items.map((item) =>
        paragraph(item, links, {
          style: 'ListParagraph',
          numId: block.ordered ? DECIMAL_NUM : BULLET_NUM,
        }),
      );
    case 'button':
      // A Word document has no call-to-action button, so it becomes what it
      // always was underneath: a linked line of text.
      return [paragraph([{ text: block.text, href: block.href, bold: true }], links, {})];
    case 'rule':
      // Word draws a rule as a paragraph with a bottom border. There is no
      // horizontal-rule element in WordprocessingML.
      return [
        '<w:p><w:pPr><w:pBdr>' +
          '<w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/>' +
          '</w:pBdr></w:pPr></w:p>',
      ];
  }
}

interface ParagraphOptions {
  style?: string;
  numId?: number;
}

function paragraph(spans: readonly Span[], links: Links, options: ParagraphOptions): string {
  const props: string[] = [];
  if (options.style) {
    props.push(`<w:pStyle w:val="${options.style}"/>`);
  }
  if (options.numId !== undefined) {
    props.push(`<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${options.numId}"/></w:numPr>`);
  }
  const pPr = props.length ? `<w:pPr>${props.join('')}</w:pPr>` : '';
  return `<w:p>${pPr}${spans.map((span) => runOf(span, links)).join('')}</w:p>`;
}

function runOf(span: Span, links: Links): string {
  const href = span.href ? safeHref(span.href) : null;
  const marks: string[] = [];
  if (href) {
    marks.push('<w:rStyle w:val="Hyperlink"/>');
  }
  if (span.bold) {
    marks.push('<w:b/>');
  }
  if (span.italic) {
    marks.push('<w:i/>');
  }
  if (span.code) {
    marks.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>');
  }
  const rPr = marks.length ? `<w:rPr>${marks.join('')}</w:rPr>` : '';

  // A newline inside a span is a line break in the same paragraph, so the run
  // is split around an explicit <w:br/>.
  const body = clean(span.text)
    .split('\n')
    .map((part) => `<w:t xml:space="preserve">${esc(part)}</w:t>`)
    .join('<w:br/>');
  const run = `<w:r>${rPr}${body}</w:r>`;

  return href ? `<w:hyperlink r:id="${links.id(href)}">${run}</w:hyperlink>` : run;
}

// --- Text -----------------------------------------------------------------

/**
 * Whether XML 1.0 refuses to carry this code point.
 *
 * Written as numbers rather than as a regular expression of escapes, so the
 * source stays free of the very control characters it is here to remove — a
 * file with a real NUL in it reads as binary to git and to every diff tool.
 */
function illegalInXml(code: number): boolean {
  // Tab, newline and carriage return are the three control characters allowed.
  if (code < 0x20) {
    return code !== 0x09 && code !== 0x0a && code !== 0x0d;
  }
  // DEL and the two permanently-unassigned code points at the end of the plane.
  if (code === 0x7f || code === 0xfffe || code === 0xffff) {
    return true;
  }
  // A surrogate reaching here alone is half a character: iterating by code
  // point yields a matched pair as one value above 0xFFFF, so anything left in
  // this range is unpaired and cannot be represented at all.
  return code >= 0xd800 && code <= 0xdfff;
}

/** Drops what XML cannot carry, before anything tries to escape it. */
function clean(text: string): string {
  let out = '';
  // Iterated by code point, so an emoji is seen once as a whole rather than
  // twice as two halves that each look unpaired.
  for (const character of text) {
    if (!illegalInXml(character.codePointAt(0) ?? 0)) {
      out += character;
    }
  }
  return out;
}

function esc(text: string): string {
  return clean(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
