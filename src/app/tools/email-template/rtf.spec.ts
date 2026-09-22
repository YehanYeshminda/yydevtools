import { describe, expect, it } from 'vitest';

import { parseDraft } from './draft';
import { escapeRtf, renderRtf } from './rtf';

const render = (text: string) => renderRtf(parseDraft(text, { infer: true }));

describe('renderRtf — the document', () => {
  it('opens and closes as one group', () => {
    const rtf = render('Hello.');
    expect(rtf.startsWith('{\\rtf1\\ansi')).toBe(true);
    expect(rtf.endsWith('}')).toBe(true);
    // Braces have to balance or the reader shows nothing at all.
    expect((rtf.match(/(?<!\\)\{/g) ?? []).length).toBe((rtf.match(/(?<!\\)\}/g) ?? []).length);
  });

  it('declares the fonts and the link colour it goes on to use', () => {
    const rtf = render('a [link](https://example.com)');
    expect(rtf).toContain('\\fonttbl');
    expect(rtf).toContain('\\colortbl');
    // \cf1 refers to the second colour-table entry, which must exist.
    expect(rtf).toContain('\\cf1');
  });

  it('ends every paragraph', () => {
    // A control word runs until a non-letter, so \par and \pard are different
    // words — and every paragraph emits one of each.
    const rtf = render('One.\n\nTwo.\n\nThree.');
    expect(rtf.match(/\\par(?![a-z])/g)).toHaveLength(3);
    expect(rtf.match(/\\pard\b/g)).toHaveLength(3);
  });

  it('makes the subject a heading', () => {
    expect(render('Subject: Quarterly\n\nBody text.')).toContain('\\fs32\\b Quarterly');
  });

  it('writes a hyperlink as a field', () => {
    const rtf = render('[docs](https://example.com/a)');
    expect(rtf).toContain('{\\field{\\*\\fldinst{HYPERLINK "https://example.com/a"}}');
    expect(rtf).toContain('{\\fldrslt{\\cf1\\ul ');
  });

  it('drops a link a reader should not follow', () => {
    const rtf = render('[Click me](javascript:alert(1))');
    expect(rtf).not.toContain('HYPERLINK');
    expect(rtf).toContain('Click me');
  });

  it('marks bullets and numbers differently', () => {
    expect(render('- one\n- two')).toContain('\\bullet\\tab ');
    const ordered = render('1. one\n2. two');
    expect(ordered).toContain('1.\\tab ');
    expect(ordered).toContain('2.\\tab ');
  });
});

describe('escapeRtf', () => {
  it('escapes the three characters that are structure', () => {
    // An unescaped brace swallows the rest of the paragraph silently.
    expect(escapeRtf('a\\b')).toBe('a\\\\b');
    expect(escapeRtf('{x}')).toBe('\\{x\\}');
  });

  it('leaves printable ASCII alone', () => {
    expect(escapeRtf('Hello, world! 42')).toBe('Hello, world! 42');
  });

  it('writes a line break as a control word with its delimiter', () => {
    // The trailing space delimits \line and is consumed, not printed.
    expect(escapeRtf('a\nb')).toBe('a\\line b');
  });

  it('encodes an accented character by its code point', () => {
    expect(escapeRtf('café')).toBe('caf\\u233?');
  });

  it('encodes a high character as a negative number', () => {
    // RTF's \u takes a signed 16-bit integer. Emitting 65533 rather than -3 is
    // the bug that makes a document full of question marks.
    expect(escapeRtf('�')).toBe('\\u-3?');
  });

  it('encodes an emoji as both halves of its surrogate pair', () => {
    // U+1F600 is D83D DE00, and both halves are above 32767, so both wrap.
    expect(escapeRtf('\u{1f600}')).toBe('\\u-10179?\\u-8704?');
  });

  it('sees an emoji once, not as two stray halves', () => {
    const out = escapeRtf('a\u{1f600}b');
    expect(out.match(/\\u/g)).toHaveLength(2);
    expect(out.startsWith('a')).toBe(true);
    expect(out.endsWith('b')).toBe(true);
  });
});
