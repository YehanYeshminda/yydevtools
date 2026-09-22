/**
 * Rendering a draft as HTML that survives a real mail client.
 *
 * This is the part that is not a markdown-to-HTML converter. Email HTML is a
 * separate, much older dialect, and the reason is one program: Outlook on
 * Windows renders mail with Word's layout engine, not a browser's. It has no
 * flexbox, no grid, no `max-width` on a div, and it inserts its own spacing
 * around tables. Gmail, for its part, strips `<style>` blocks when a message is
 * forwarded. So the rules here are:
 *
 *  - Layout is nested tables, every one `role="presentation"` so a screen
 *    reader skips the scaffolding instead of announcing a data table.
 *  - Every style is inline. There is no stylesheet to strip.
 *  - `font-family` is repeated on each text element, because Outlook does not
 *    inherit it reliably and falls back to Times New Roman when it loses it.
 *  - The 600px column is stated twice: once as CSS for everyone, once inside an
 *    `<!--[if mso]>` ghost table for Outlook, which ignores the CSS.
 *  - `mso-table-lspace`/`rspace` kill the gutters Outlook adds on its own.
 *
 * Links and colours coming from the draft are treated as untrusted: an href is
 * dropped unless its scheme is one of http, https, mailto or tel, and the
 * accent is parsed as a colour or replaced. This file's output is downloaded as
 * a `.html` and an `.eml` and opened in someone's mail client, which is not a
 * place to forward markup that arrived as text.
 */
import { parseColor, toHex, type Rgb } from '../color-converter/color';
import { readableOn } from '../palette-extractor/palette';
import { flatten, type Block, type Draft, type Span } from './draft';

export const LOOKS = ['plain', 'announcement', 'newsletter'] as const;
export type Look = (typeof LOOKS)[number];

export interface LookOption {
  id: Look;
  label: string;
  hint: string;
}

export const LOOK_OPTIONS: readonly LookOption[] = [
  {
    id: 'plain',
    label: 'Plain',
    hint: 'Looks like a letter someone typed. Best for anything a person is meant to reply to.',
  },
  {
    id: 'announcement',
    label: 'Announcement',
    hint: 'A coloured header band carrying the subject, over a white card.',
  },
  {
    id: 'newsletter',
    label: 'Newsletter',
    hint: 'A card with a footer and an unsubscribe placeholder, for mail sent in bulk.',
  },
];

export interface EmailOptions {
  look: Look;
  /** Any CSS colour; anything unreadable falls back to the default blue. */
  accent: string;
  subject: string | null;
}

/** The canonical email column, in pixels. Every client has agreed on it for years. */
const WIDTH = 600;

/**
 * Arial and Helvetica are in the stack for Outlook's benefit: given a family it
 * does not recognise it does not continue down the list, it reverts to Times.
 */
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

export const DEFAULT_ACCENT = '#2563eb';
const FALLBACK_ACCENT: Rgb = { r: 0x25, g: 0x63, b: 0xeb, a: 1 };
const TEXT = '#1f2933';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const CARD = '#ffffff';
const PAGE = '#f4f5f7';

/** Schemes a mail client should be asked to open. */
const SAFE_SCHEME = /^(?:https?:|mailto:|tel:)/i;
/** A bare domain, which a hand-written link often is. */
const BARE_DOMAIN = /^[\w-]+(?:\.[\w-]+)+(?:[/?#]|$)/;
/**
 * Whether the string hides a control character.
 *
 * Checked by code point rather than with a regular expression of escapes, so
 * this file never has to contain the characters it exists to reject: a source
 * file with a real NUL in it reads as binary to git and to every diff tool.
 */
function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/** Longest preheader worth writing; clients show roughly this much. */
const MAX_PREHEADER = 110;

/** What every shell and block needs to know, resolved once. */
interface Theme {
  accent: string;
  onAccent: string;
  /**
   * Whether a link alone on its line becomes a call-to-action button.
   *
   * Off for the plain look, where a big coloured button in the middle of what
   * is meant to read as a typed letter looks like marketing. The parser marks
   * the block either way; the design decides what to do with it.
   */
  buttons: boolean;
}

export function renderEmail(draft: Draft, options: EmailOptions): string {
  // Forced opaque: a translucent accent comes back from toHex as eight-digit
  // hex, which Outlook's bgcolor attribute and VML fillcolor cannot read.
  const rgb: Rgb = { ...(parseColor(options.accent) ?? FALLBACK_ACCENT), a: 1 };
  const theme: Theme = {
    accent: toHex(rgb),
    onAccent: readableOn(rgb),
    buttons: options.look !== 'plain',
  };
  const subject = options.subject?.trim() ?? '';

  const shell = SHELLS[options.look]({
    subject,
    body: blocksToHtml(draft.blocks, theme),
    // The subject is already beside the preview line in the inbox, so the
    // preview is spent on the first real sentence instead. It only falls back
    // to the subject when there is no body to draw from.
    preheader: preheaderText(draft) || subject,
    ...theme,
  });

  return [
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="en">',
    '<head>',
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<meta http-equiv="X-UA-Compatible" content="IE=edge" />',
    // Tells Apple Mail and Outlook.com the message has been designed for both
    // schemes, which stops them force-inverting the colours themselves.
    '<meta name="color-scheme" content="light dark" />',
    '<meta name="supported-color-schemes" content="light dark" />',
    `<title>${esc(subject || 'Message')}</title>`,
    // Without this Outlook renders at 120 DPI on a scaled display and every
    // stated pixel width comes out a quarter too large.
    '<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->',
    '</head>',
    shell,
    '</html>',
    '',
  ].join('\n');
}

interface ShellParts extends Theme {
  subject: string;
  body: string;
  preheader: string;
}

const TABLE_RESET = 'border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;';

/** A layout table. Written through one helper so `role` cannot be forgotten. */
function table(attrs: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ${attrs}>`;
}

/**
 * The page scaffolding every look shares: a full-width table to centre on, an
 * Outlook-only ghost table at the fixed width, and the real column inside it.
 */
function page(parts: ShellParts, pageBg: string, inner: string): string {
  return [
    `<body style="margin:0;padding:0;background:${pageBg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">`,
    preheaderDiv(parts.preheader),
    table(`width="100%" style="${TABLE_RESET}background:${pageBg};"`),
    '<tr>',
    '<td align="center" style="padding:24px 12px;">',
    `<!--[if mso]><table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->`,
    table(
      `width="${WIDTH}" style="${TABLE_RESET}width:100%;max-width:${WIDTH}px;background:${CARD};border-radius:10px;"`,
    ),
    inner,
    '</table>',
    '<!--[if mso]></td></tr></table><![endif]-->',
    '</td>',
    '</tr>',
    '</table>',
    '</body>',
  ].join('\n');
}

/**
 * The line the inbox shows beside the subject.
 *
 * Hidden, then padded with zero-width characters — otherwise the client keeps
 * reading into the body and appends the opening of the message to whatever this
 * says, which is how "Hi Ada,Hi Ada, the report is" happens.
 */
function preheaderDiv(text: string): string {
  if (text === '') {
    return '';
  }
  return (
    '<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">' +
    esc(text) +
    '&#847;&zwnj;&nbsp;'.repeat(30) +
    '</div>'
  );
}

const SHELLS: Record<Look, (parts: ShellParts) => string> = {
  /** A letter. No chrome, because a person is supposed to reply to it. */
  plain: (parts) =>
    page(parts, CARD, `<tr><td style="padding:8px 8px 24px;">${parts.body}</td></tr>`),

  announcement: (parts) =>
    page(
      parts,
      PAGE,
      [
        parts.subject
          ? `<tr><td style="padding:28px 32px;background:${parts.accent};border-radius:10px 10px 0 0;">` +
            `<h1 style="margin:0;font-family:${FONT};font-size:24px;line-height:32px;mso-line-height-rule:exactly;font-weight:700;color:${parts.onAccent};">` +
            esc(parts.subject) +
            '</h1></td></tr>'
          : `<tr><td style="padding:0;background:${parts.accent};border-radius:10px 10px 0 0;font-size:0;line-height:0;height:6px;">&nbsp;</td></tr>`,
        `<tr><td style="padding:28px 32px;">${parts.body}</td></tr>`,
      ].join('\n'),
    ),

  newsletter: (parts) =>
    page(
      parts,
      PAGE,
      [
        `<tr><td style="padding:0;background:${parts.accent};border-radius:10px 10px 0 0;font-size:0;line-height:0;height:5px;">&nbsp;</td></tr>`,
        parts.subject
          ? '<tr><td style="padding:28px 32px 0;">' +
            `<h1 style="margin:0 0 4px;font-family:${FONT};font-size:23px;line-height:31px;mso-line-height-rule:exactly;font-weight:700;color:${TEXT};">` +
            esc(parts.subject) +
            '</h1></td></tr>'
          : '',
        `<tr><td style="padding:24px 32px;">${parts.body}</td></tr>`,
        `<tr><td style="padding:20px 32px 28px;border-top:1px solid ${BORDER};">` +
          `<p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:${MUTED};">` +
          'You are receiving this because you subscribed.&nbsp;' +
          `<a href="{{unsubscribe_url}}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>.` +
          '</p></td></tr>',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
};

// --- Blocks ---------------------------------------------------------------

function blocksToHtml(blocks: readonly Block[], theme: Theme): string {
  return blocks
    .map((block) => blockToHtml(block, theme))
    .filter((part) => part !== '')
    .join('\n');
}

function blockToHtml(block: Block, theme: Theme): string {
  switch (block.kind) {
    case 'heading': {
      const size = [24, 20, 17][block.level - 1];
      const lead = [32, 28, 24][block.level - 1];
      return (
        `<h${block.level} style="margin:0 0 12px;font-family:${FONT};font-size:${size}px;` +
        `line-height:${lead}px;mso-line-height-rule:exactly;font-weight:700;color:${TEXT};">` +
        spansToHtml(block.spans, theme) +
        `</h${block.level}>`
      );
    }
    case 'paragraph': {
      // A sign-off gets air above it rather than a different colour: it is the
      // writer's own name, and greying it out reads as an apology.
      const top = block.role === 'signoff' ? 24 : 0;
      const bottom = block.role === 'greeting' ? 18 : 16;
      return (
        `<p style="margin:${top}px 0 ${bottom}px;font-family:${FONT};font-size:16px;line-height:24px;` +
        `mso-line-height-rule:exactly;color:${TEXT};overflow-wrap:anywhere;word-break:break-word;">` +
        spansToHtml(block.spans, theme) +
        '</p>'
      );
    }
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const items = block.items
        .map(
          (item) =>
            `<li style="margin:0 0 8px;font-family:${FONT};font-size:16px;line-height:24px;` +
            `mso-line-height-rule:exactly;color:${TEXT};overflow-wrap:anywhere;">` +
            spansToHtml(item, theme) +
            '</li>',
        )
        .join('\n');
      return `<${tag} style="margin:0 0 16px;padding:0 0 0 22px;">\n${items}\n</${tag}>`;
    }
    case 'button':
      return button(block.text, block.href, theme);
    case 'rule':
      // A table rather than an <hr>, which Outlook draws in its own colour at
      // its own width regardless of what the CSS says.
      return (
        table(`width="100%" style="${TABLE_RESET}margin:0 0 20px;"`) +
        `<tr><td style="border-top:1px solid ${BORDER};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`
      );
  }
}

/**
 * A button that is still a button in Outlook.
 *
 * Outlook will not paint a background or a radius on an anchor, so it gets a
 * VML rounded rectangle instead and the real anchor is hidden from it. Every
 * other client sees only the anchor. `<w:anchorlock/>` is what stops Outlook
 * letting the label be selected and dragged out of the shape.
 */
function button(text: string, rawHref: string, theme: Theme): string {
  const href = safeHref(rawHref);
  const label = esc(text);
  // Either the link was dropped, or this look does not do buttons. The words
  // stay either way, still linked when there is a link left to keep.
  if (!href || !theme.buttons) {
    const inner = href
      ? `<a href="${esc(href)}" style="color:${theme.accent};text-decoration:underline;">${label}</a>`
      : label;
    return (
      `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:24px;` +
      `mso-line-height-rule:exactly;color:${TEXT};overflow-wrap:anywhere;">` +
      inner +
      '</p>'
    );
  }
  return [
    table(`style="${TABLE_RESET}margin:4px 0 20px;"`),
    '<tr>',
    `<td align="center" bgcolor="${theme.accent}" style="border-radius:6px;">`,
    `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(href)}" style="height:44px;v-text-anchor:middle;width:260px;" arcsize="14%" stroke="f" fillcolor="${theme.accent}"><w:anchorlock/><center style="color:${theme.onAccent};font-family:${FONT};font-size:16px;font-weight:700;">${label}</center></v:roundrect><![endif]-->`,
    '<!--[if !mso]><!-- -->',
    `<a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:16px;line-height:18px;font-weight:700;color:${theme.onAccent};text-decoration:none;border-radius:6px;background:${theme.accent};">${label}</a>`,
    '<!--<![endif]-->',
    '</td>',
    '</tr>',
    '</table>',
  ].join('');
}

function spansToHtml(spans: readonly Span[], theme: Theme): string {
  return spans.map((span) => spanToHtml(span, theme)).join('');
}

function spanToHtml(span: Span, theme: Theme): string {
  // A line break inside a paragraph, from a hard-wrapped draft.
  let html = esc(span.text).replace(/\n/g, '<br />');
  if (span.code) {
    html = `<code style="font-family:${MONO};font-size:14px;background:#f3f4f6;padding:1px 4px;border-radius:3px;">${html}</code>`;
  }
  if (span.bold) {
    html = `<strong>${html}</strong>`;
  }
  if (span.italic) {
    html = `<em>${html}</em>`;
  }
  const href = span.href ? safeHref(span.href) : null;
  if (href) {
    // The colour and the underline are stated because Apple Mail otherwise
    // decides for itself, and turns dates and phone numbers blue on its own.
    html = `<a href="${esc(href)}" style="color:${theme.accent};text-decoration:underline;">${html}</a>`;
  }
  return html;
}

// --- Trust boundary -------------------------------------------------------

/** `&` first, or the entities this adds get escaped again. */
export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A link a mail client should be willing to open, or null.
 *
 * Allow-list rather than deny-list: `javascript:` is the obvious one to reject,
 * but so are `data:`, `vbscript:`, `file:` and whatever the next one turns out
 * to be. A bare domain is promoted to https because a hand-typed
 * `[docs](example.com/x)` is a relative path to a mail client, which resolves
 * to nothing at all.
 */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (href === '' || hasControlCharacter(href)) {
    return null;
  }
  if (SAFE_SCHEME.test(href)) {
    return href;
  }
  return BARE_DOMAIN.test(href) ? `https://${href}` : null;
}

/**
 * The first sentence worth showing in an inbox preview.
 *
 * The greeting is deliberately skipped: "Hi Ada," tells the reader nothing they
 * cannot see from the sender, and it is the line most drafts open with.
 */
export function preheaderText(draft: Draft): string {
  const body = draft.blocks.find(
    (block) => block.kind === 'paragraph' && block.role !== 'greeting',
  );
  const text = body?.kind === 'paragraph' ? flatten(body.spans) : '';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_PREHEADER ? `${clean.slice(0, MAX_PREHEADER - 1)}…` : clean;
}
