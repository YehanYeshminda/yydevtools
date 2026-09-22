import { describe, expect, it } from 'vitest';

import { decodeBase64ToText } from '../base64/base64-codec';
import { encodeSubject, renderEml } from './eml';

const FIXED = new Date(Date.UTC(2026, 8, 22, 12, 0, 0));
const BOUNDARY = '----=_yydevtools_test';

const build = (over: Partial<Parameters<typeof renderEml>[0]> = {}) =>
  renderEml({
    subject: 'Quarterly update',
    html: '<html><body><p>Hello</p></body></html>',
    text: 'Hello',
    date: FIXED,
    boundary: BOUNDARY,
    ...over,
  });

/** The decoded body of the part declaring `mime`. */
function partBody(eml: string, mime: string): string {
  const section = eml.split(`--${BOUNDARY}`).find((chunk) => chunk.includes(mime));
  const body = section!.split('\r\n\r\n')[1];
  return decodeBase64ToText(body.replace(/\r\n/g, ''));
}

describe('renderEml — line endings', () => {
  it('ends every line CRLF and never bare', () => {
    // The classic hand-rolled-.eml bug: some clients cope with a bare LF and
    // some show the headers as body text.
    const eml = build();
    expect(eml).toContain('\r\n');
    expect(/[^\r]\n/.test(eml)).toBe(false);
  });
});

describe('renderEml — headers', () => {
  it('says it is an unsent message, which is what makes it a template', () => {
    // Without this Outlook opens the file read-only, as mail that arrived.
    expect(build()).toContain('\r\nX-Unsent: 1\r\n');
  });

  it('writes the date in RFC 5322 form with a numeric zone', () => {
    expect(build()).toContain('Date: Tue, 22 Sep 2026 12:00:00 +0000');
  });

  it('names no sender or recipient, because this is a template', () => {
    const eml = build();
    expect(eml).not.toMatch(/^From:/m);
    expect(eml).not.toMatch(/^To:/m);
  });

  it('declares the multipart boundary it then uses', () => {
    const eml = build();
    expect(eml).toContain(`Content-Type: multipart/alternative; boundary="${BOUNDARY}"`);
    expect(eml).toContain(`--${BOUNDARY}--`);
  });
});

describe('renderEml — the two bodies', () => {
  it('carries a plain-text part and an HTML one', () => {
    const eml = build();
    expect(eml).toContain('Content-Type: text/plain; charset=utf-8');
    expect(eml).toContain('Content-Type: text/html; charset=utf-8');
    expect(partBody(eml, 'text/plain')).toBe('Hello');
    expect(partBody(eml, 'text/html')).toContain('<p>Hello</p>');
  });

  it('round-trips text a mail client would otherwise mangle', () => {
    const text = 'Café — naïve “quotes” and an emoji \u{1f600}';
    expect(partBody(build({ text }), 'text/plain')).toBe(text);
  });

  it('wraps base64 at 76 columns, as RFC 2045 requires', () => {
    const eml = build({ text: 'x'.repeat(500) });
    const body = eml.split(`--${BOUNDARY}`)[1].split('\r\n\r\n')[1];
    const lines = body.split('\r\n').filter((line) => line !== '');
    expect(lines.length).toBeGreaterThan(1);
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(76);
  });

  it('never lets the boundary appear inside a body', () => {
    // A base64 line cannot begin with a dash, which is the real guarantee —
    // but a content-derived separator is worth checking rather than assuming.
    const eml = build({ text: `--${BOUNDARY}\nand more`, html: `<p>--${BOUNDARY}</p>` });
    const separators = eml.split('\r\n').filter((line) => line.startsWith(`--${BOUNDARY}`));
    expect(separators).toHaveLength(3);
  });
});

describe('encodeSubject', () => {
  it('leaves printable ASCII as it is', () => {
    expect(encodeSubject('Quarterly update 2026')).toBe('Quarterly update 2026');
  });

  it('encodes anything else as an RFC 2047 word', () => {
    const encoded = encodeSubject('Café update');
    expect(encoded.startsWith('=?UTF-8?B?')).toBe(true);
    expect(encoded.endsWith('?=')).toBe(true);
    expect(decodeBase64ToText(encoded.slice(10, -2))).toBe('Café update');
  });

  it('encodes a subject carrying a newline rather than ending the header', () => {
    expect(encodeSubject('one\r\nInjected: header')).toContain('=?UTF-8?B?');
  });

  it('keeps every word within the 75-character limit', () => {
    const encoded = encodeSubject('Ünicode '.repeat(20));
    for (const word of encoded.split('\r\n ')) {
      expect(word.length).toBeLessThanOrEqual(75);
    }
  });

  it('folds long subjects with CRLF and a space', () => {
    const encoded = encodeSubject('Ünicode '.repeat(20));
    expect(encoded).toContain('\r\n ');
    expect(encoded.split('\r\n ').every((word) => word.startsWith('=?UTF-8?B?'))).toBe(true);
  });

  it('never splits a character between two words', () => {
    const subject = '\u{1f600}'.repeat(30);
    const decoded = encodeSubject(subject)
      .split('\r\n ')
      .map((word) => decodeBase64ToText(word.slice(10, -2)))
      .join('');
    expect(decoded).toBe(subject);
  });

  it('says nothing for an empty subject', () => {
    expect(encodeSubject('')).toBe('');
  });
});
