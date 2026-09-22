import { describe, expect, it } from 'vitest';

import { parseDraft } from './draft';
import { LOOKS, esc, preheaderText, renderEmail, safeHref, type Look } from './email-html';

const draft = (text: string) => parseDraft(text, { infer: true });

function render(text: string, look: Look = 'plain', accent = '#2563eb'): string {
  const parsed = draft(text);
  return renderEmail(parsed, { look, accent, subject: parsed.subject });
}

const LETTER = 'Hi Ada,\n\nThe report is attached.\n\nThanks,\nGrace';

describe('renderEmail — the client rules', () => {
  it('marks every layout table as presentational', () => {
    // Without this a screen reader announces "table, 1 row, 1 column" for each
    // layer of the scaffolding before reaching a single word of the message.
    for (const look of LOOKS) {
      const html = render(LETTER, look);
      const tables = html.match(/<table\b/g) ?? [];
      const presentational = html.match(/<table role="presentation"/g) ?? [];
      expect(tables.length, look).toBeGreaterThan(0);
      expect(presentational.length, look).toBe(tables.length);
    }
  });

  it('states the column width twice, once for Outlook', () => {
    const html = render(LETTER);
    expect(html).toContain('max-width:600px');
    // Outlook ignores the CSS, so it gets a ghost table at a fixed width.
    expect(html).toContain('<!--[if mso]><table role="presentation" width="600"');
    expect(html).toContain('<!--[if mso]></td></tr></table><![endif]-->');
  });

  it('carries no stylesheet, because Gmail strips one on forward', () => {
    const html = render(LETTER, 'newsletter');
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/\sclass="/);
  });

  it('repeats the font on every text element', () => {
    // Outlook does not inherit font-family reliably; where it loses it, it
    // reverts to Times New Roman rather than continuing down the stack.
    // The greeting keeps the heading out of the subject, so it stays in the body.
    const html = render('Hi there,\n\n## Heading\n\nA paragraph.\n\n- an item');
    for (const tag of ['h2', 'p', 'li']) {
      const open = new RegExp(`<${tag}\\b[^>]*>`).exec(html);
      expect(open, tag).not.toBeNull();
      expect(open![0], tag).toContain('font-family:');
    }
    // And the one heading a shell writes itself.
    const band = render('Subject: Hello\n\nBody.', 'announcement');
    expect(/<h1\b[^>]*>/.exec(band)![0]).toContain('font-family:');
  });

  it('kills the gutters Outlook adds around tables', () => {
    expect(render(LETTER)).toContain('mso-table-lspace:0pt;mso-table-rspace:0pt');
  });

  it('pins the DPI so stated widths survive a scaled display', () => {
    expect(render(LETTER)).toContain('<o:PixelsPerInch>96</o:PixelsPerInch>');
  });

  it('declares a language and both colour schemes', () => {
    const html = render(LETTER);
    expect(html).toMatch(/<html[^>]+lang="en"/);
    expect(html).toContain('<meta name="color-scheme" content="light dark" />');
    expect(html.startsWith('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"')).toBe(
      true,
    );
  });

  it('lets a long link wrap instead of widening the column', () => {
    const html = render(`See https://example.com/${'a'.repeat(200)}`);
    expect(html).toContain('overflow-wrap:anywhere');
  });
});

describe('renderEmail — the looks differ', () => {
  it('puts the subject in a coloured band only in the announcement', () => {
    const text = 'Subject: Release 4.2\n\nIt ships today.';
    expect(render(text, 'announcement')).toContain('background:#2563eb;border-radius:10px 10px 0 0');
    // A plain letter shows no title: the client already displays the subject,
    // and repeating it in the body is what marketing mail does, not a person.
    expect(render(text, 'plain')).not.toContain('<h1');
    expect(render(text, 'plain')).toContain('<title>Release 4.2</title>');
  });

  it('gives only the newsletter an unsubscribe placeholder', () => {
    expect(render(LETTER, 'newsletter')).toContain('{{unsubscribe_url}}');
    expect(render(LETTER, 'announcement')).not.toContain('unsubscribe');
    expect(render(LETTER, 'plain')).not.toContain('unsubscribe');
  });

  it('makes a lone link a button everywhere except the plain look', () => {
    const text = 'Hi,\n\n[Read the report](https://example.com/r)\n\nThanks';
    // VML is what makes the button a button in Outlook, which will not paint a
    // background on an anchor.
    expect(render(text, 'announcement')).toContain('<v:roundrect');
    expect(render(text, 'announcement')).toContain('<w:anchorlock/>');
    const plain = render(text, 'plain');
    expect(plain).not.toContain('<v:roundrect');
    expect(plain).toContain('href="https://example.com/r"');
    expect(plain).toContain('Read the report');
  });
});

describe('renderEmail — untrusted input', () => {
  it('escapes markup that arrived as text', () => {
    const html = render('A <script>alert(1)</script> and an & ampersand');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&amp; ampersand');
  });

  it('drops a link whose scheme a mail client should not open', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x', 'vbscript:msgbox', '//evil.example']) {
      expect(safeHref(bad), bad).toBeNull();
    }
    const html = render('[Click me](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    // The words survive; only the link is refused.
    expect(html).toContain('Click me');
  });

  it('rejects a scheme hidden behind a control character', () => {
    expect(safeHref(`java${String.fromCharCode(9)}script:alert(1)`)).toBeNull();
    expect(safeHref(`java${String.fromCharCode(0)}script:alert(1)`)).toBeNull();
  });

  it('keeps the schemes an email legitimately uses', () => {
    expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeHref('mailto:ada@example.com')).toBe('mailto:ada@example.com');
    expect(safeHref('tel:+441234567890')).toBe('tel:+441234567890');
  });

  it('promotes a bare domain, which is a dead relative path in a mail client', () => {
    expect(safeHref('example.com/docs')).toBe('https://example.com/docs');
    expect(safeHref('sub.example.co.uk')).toBe('https://sub.example.co.uk');
  });

  it('falls back when the accent is not a colour', () => {
    const html = render(LETTER, 'announcement', 'not a colour');
    expect(html).toContain('#2563eb');
  });

  it('never emits eight-digit hex, which Outlook cannot read', () => {
    // bgcolor and VML fillcolor take #rrggbb only; a translucent accent would
    // otherwise arrive as #rrggbbaa and be ignored, leaving an unpainted band.
    const html = render(LETTER, 'announcement', 'rgba(37, 99, 235, 0.4)');
    expect(html).toMatch(/bgcolor="#[0-9a-f]{6}"|background:#[0-9a-f]{6};/);
    expect(html).not.toMatch(/#[0-9a-f]{8}\b/);
  });

  it('picks a header colour that can be read on the band', () => {
    const light = render('Subject: Hello\n\nBody.', 'announcement', '#ffee00');
    expect(light).toContain('color:#000000');
    const dark = render('Subject: Hello\n\nBody.', 'announcement', '#101820');
    expect(dark).toContain('color:#ffffff');
  });

  it('escapes the characters that would break out of an attribute', () => {
    expect(esc(`<&">'`)).toBe('&lt;&amp;&quot;&gt;&#39;');
    // The ampersand has to go first, or every entity above is escaped twice.
    expect(esc('&lt;')).toBe('&amp;lt;');
  });
});

describe('preheaderText', () => {
  it('skips the greeting, which is a wasted preview line', () => {
    expect(preheaderText(draft(LETTER))).toBe('The report is attached.');
  });

  it('falls back to the subject when there is no body', () => {
    // Rendered rather than unit-checked: the fallback lives in renderEmail.
    const html = render('Subject: Only a subject\n\n');
    expect(html).toContain('Only a subject');
  });

  it('truncates rather than spilling the whole first paragraph', () => {
    const long = preheaderText(draft(`Hi,\n\n${'word '.repeat(80)}`));
    expect(long.length).toBeLessThanOrEqual(110);
    expect(long.endsWith('…')).toBe(true);
  });

  it('pads so the client cannot read on into the body', () => {
    expect(render(LETTER)).toContain('&#847;&zwnj;&nbsp;&#847;');
  });
});
