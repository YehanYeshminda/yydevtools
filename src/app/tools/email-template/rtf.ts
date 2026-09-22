/**
 * Writing the draft as Rich Text.
 *
 * RTF is the format every word processor still opens — Word, Pages, LibreOffice,
 * WordPad, TextEdit — without any of them having to agree on anything newer. It
 * is plain ASCII with backslash control words, which makes it easy to write and
 * easy to write subtly wrong. The three traps:
 *
 *  - **Escaping.** A backslash or a brace in the text is structure unless it is
 *    escaped, so an unescaped one silently swallows the rest of the paragraph.
 *  - **Unicode.** Anything above ASCII goes out as `\uN?` where N is a *signed*
 *    16-bit integer. Emit 233 for é and readers cope; emit 65533 for a high
 *    character instead of −3 and they do not. Characters outside the basic
 *    plane — emoji — need both halves of the surrogate pair, each signed.
 *  - **Delimiters.** A control word runs until a space or a non-letter, and
 *    that delimiting space is consumed rather than printed.
 */
import type { Block, Draft, Span } from './draft';
import { safeHref } from './email-html';

/** Body text size, in half-points: 22 is 11pt. */
const BODY = 22;
/** Heading sizes by level, also half-points. */
const HEADING = [32, 26, 24];
/** Space after a paragraph, in twips. */
const AFTER = 160;
/** A list's indent and the hanging amount for its marker, in twips. */
const INDENT = 720;
const HANGING = 360;

/** The draft as an RTF document. */
export function renderRtf(draft: Draft): string {
  const body: string[] = [];

  const subject = draft.subject?.trim();
  if (subject) {
    body.push(heading([{ text: subject }], 1));
  }
  for (const block of draft.blocks) {
    body.push(...blockToRtf(block));
  }

  return (
    // \ansicpg1252 names the code page for the ASCII half; \uc1 says each \u
    // is followed by exactly one fallback character.
    '{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1' +
    '{\\fonttbl{\\f0\\fswiss\\fcharset0 Calibri;}{\\f1\\fmodern\\fcharset0 Consolas;}}' +
    // Entry 0 is the default; \cf1 is the link blue.
    '{\\colortbl ;\\red5\\green99\\blue193;}' +
    `\\viewkind4\\f0\\fs${BODY}\n` +
    body.join('\n') +
    '\n}'
  );
}

function blockToRtf(block: Block): string[] {
  switch (block.kind) {
    case 'heading':
      return [heading(block.spans, block.level)];
    case 'paragraph':
      return [`${reset()}${spansToRtf(block.spans)}\\par`];
    case 'list':
      return block.items.map((item, index) => {
        // ponytail: markers are literal rather than a \listtable, so Word will
        // not renumber them if you insert a row. A real list table is ~60 lines
        // of definitions for a fallback format; add one if anyone asks.
        const marker = block.ordered ? `${index + 1}.` : '\\bullet';
        return (
          `\\pard\\sa${AFTER}\\fi-${HANGING}\\li${INDENT}\\f0\\fs${BODY} ` +
          `${marker}\\tab ${spansToRtf(item)}\\par`
        );
      });
    case 'button':
      return [`${reset()}${spansToRtf([{ text: block.text, href: block.href, bold: true }])}\\par`];
    case 'rule':
      // A paragraph carrying a bottom border, which is how a word processor
      // draws a rule. \brdrs is a single line, \brdrw10 its width in twips.
      return ['\\pard\\brdrb\\brdrs\\brdrw10\\brsp20\\sa160\\par'];
  }
}

function heading(spans: readonly Span[], level: 1 | 2 | 3): string {
  const size = HEADING[level - 1];
  return `\\pard\\sb240\\sa120\\f0\\fs${size}\\b ${spansToRtf(spans)}\\b0\\fs${BODY}\\par`;
}

/** Paragraph defaults, reasserted so the previous block cannot leak into this one. */
function reset(): string {
  return `\\pard\\sa${AFTER}\\f0\\fs${BODY} `;
}

function spansToRtf(spans: readonly Span[]): string {
  return spans.map(spanToRtf).join('');
}

function spanToRtf(span: Span): string {
  let text = escapeRtf(span.text);

  if (span.code) {
    text = `{\\f1 ${text}}`;
  }
  if (span.bold) {
    text = `{\\b ${text}}`;
  }
  if (span.italic) {
    text = `{\\i ${text}}`;
  }

  const href = span.href ? safeHref(span.href) : null;
  if (!href) {
    return text;
  }
  // A hyperlink is a field: the instruction half carries the URL, the result
  // half is what is drawn. Quotes inside the URL would end the instruction
  // early, so the URL is escaped like any other text.
  return (
    '{\\field{\\*\\fldinst{HYPERLINK "' +
    escapeRtf(href) +
    '"}}{\\fldrslt{\\cf1\\ul ' +
    text +
    '}}}'
  );
}

/**
 * Text as RTF-safe characters.
 *
 * Iterated by code point rather than by index, so an emoji is seen once as a
 * whole rather than twice as two halves that each look like an unpaired
 * surrogate.
 */
export function escapeRtf(text: string): string {
  let out = '';
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (character === '\\' || character === '{' || character === '}') {
      out += `\\${character}`;
    } else if (character === '\n') {
      // The trailing space delimits the control word and is not printed.
      out += '\\line ';
    } else if (character === '\r' || character === '\t') {
      out += character === '\t' ? '\\tab ' : '';
    } else if (code < 0x80) {
      out += character;
    } else if (code <= 0xffff) {
      out += `\\u${signed(code)}?`;
    } else {
      // Outside the basic plane: both halves of the surrogate pair, each
      // signed, because RTF's \u parameter is a 16-bit value.
      const offset = code - 0x10000;
      out += `\\u${signed(0xd800 + (offset >> 10))}?`;
      out += `\\u${signed(0xdc00 + (offset & 0x3ff))}?`;
    }
  }
  return out;
}

/** RTF's \u takes a signed 16-bit integer, so anything above 32767 wraps. */
function signed(code: number): number {
  return code > 32767 ? code - 65536 : code;
}
