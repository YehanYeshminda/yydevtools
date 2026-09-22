/**
 * Writing the draft as a `.eml` file — a message you can double-click.
 *
 * The header that makes this a *template* rather than a transcript is
 * `X-Unsent: 1`. With it, Outlook opens the file as a new message you can
 * address and send; without it the same file opens read-only, as something that
 * already arrived. It is one line, it is not in any RFC, and it is the whole
 * difference between a useful download and a curiosity.
 *
 * The rest is RFC 5322 and 2045, where the traps are:
 *
 *  - **Every line ends CRLF.** Not the newline JavaScript gives you. A bare LF
 *    is the classic hand-rolled-`.eml` bug: some clients cope, some show the
 *    headers as body text, and which do is not worth finding out.
 *  - **The subject is ASCII or it is encoded.** A non-ASCII subject has to go
 *    out as RFC 2047 encoded words of at most 75 characters each, split on
 *    character boundaries so no multi-byte character is cut in half.
 *  - **Both bodies, not one.** `multipart/alternative` carries a plain-text
 *    part and an HTML one; a client that will not render HTML, or a reader
 *    using a screen reader on a text-only client, gets the plain part. Sending
 *    HTML alone is what makes mail arrive blank.
 *
 * Base64 for both parts rather than quoted-printable: it sidesteps soft line
 * breaks, trailing-whitespace rules and the 998-character line limit in one go,
 * and the size difference on an email does not matter.
 */
import { encodeTextToBase64, formatBase64 } from '../base64/base64-codec';

export interface EmlOptions {
  subject: string | null;
  /** The HTML part. */
  html: string;
  /** The plain-text part, for clients and readers that do not want HTML. */
  text: string;
  /** Defaults to now. Passed in so the output can be compared in a test. */
  date?: Date;
  /** Defaults to a random one. Passed in for the same reason. */
  boundary?: string;
}

/** Media type for the download, and what a mail client registers itself for. */
export const EML_MEDIA_TYPE = 'message/rfc822';

const CRLF = '\r\n';

/**
 * Longest an RFC 2047 encoded word may be, including its `=?UTF-8?B?` and `?=`.
 * Twelve of those characters are the wrapper, and base64 comes in fours, so 60
 * characters of payload — 45 bytes of UTF-8 — is the most that fits.
 */
const MAX_ENCODED_BYTES = 45;

export function renderEml(options: EmlOptions): string {
  const boundary = options.boundary ?? newBoundary();
  const date = options.date ?? new Date();

  const lines = [
    'MIME-Version: 1.0',
    `Date: ${rfc5322Date(date)}`,
    `Subject: ${encodeSubject(options.subject?.trim() ?? '')}`,
    // Outlook opens this as a new, editable message rather than as mail that
    // has already been received. No sender or recipient is written: this is a
    // template, and the person sending it fills those in.
    'X-Unsent: 1',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    // Shown by anything too old to understand multipart. It never reaches a
    // client that does.
    'This is a message in MIME format.',
    '',
    ...part(boundary, 'text/plain', options.text),
    ...part(boundary, 'text/html', options.html),
    `--${boundary}--`,
    '',
  ];

  return lines.join(CRLF);
}

function part(boundary: string, mime: string, body: string): string[] {
  return [
    `--${boundary}`,
    `Content-Type: ${mime}; charset=utf-8`,
    'Content-Transfer-Encoding: base64',
    '',
    // Already wrapped at 76 columns with CRLF inside, which is what the join
    // around it produces anyway.
    formatBase64(encodeTextToBase64(body), { urlSafe: false, noPadding: false, mime: true }),
  ];
}

/**
 * A separator that cannot occur in either body.
 *
 * The leading dashes are the guarantee rather than the random tail: a boundary
 * is only recognised at the start of a line beginning `--`, and a base64 line
 * can only begin with a base64 character. The tail is there so two messages
 * pasted together cannot share one.
 */
function newBoundary(): string {
  return `----=_yydevtools_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * The date in RFC 5322 form.
 *
 * `toUTCString` is specified to produce exactly this shape, in English, on
 * every engine and in every locale — which a hand-rolled month table would
 * have to be careful to match. Only the zone needs changing: the spec's `GMT`
 * is the obsolete spelling of `+0000`.
 */
function rfc5322Date(date: Date): string {
  return date.toUTCString().replace(/GMT$/, '+0000');
}

/**
 * A subject a mail client will read correctly.
 *
 * Printable ASCII goes out as it is. Anything else is base64 encoded words,
 * split on character boundaries and folded, because a single word over 75
 * characters is invalid and a word cut through the middle of a multi-byte
 * character decodes to a replacement character in the inbox.
 */
export function encodeSubject(subject: string): string {
  if (subject === '') {
    return '';
  }
  // Printable ASCII only — a newline would end the header early, so it counts
  // as needing encoding rather than being passed through.
  if (!/[^\x20-\x7e]/.test(subject)) {
    return subject;
  }
  return chunk(subject)
    .map((piece) => `=?UTF-8?B?${encodeTextToBase64(piece)}?=`)
    .join(`${CRLF} `);
}

/** Split into pieces of at most MAX_ENCODED_BYTES UTF-8 bytes, never mid-character. */
function chunk(text: string): string[] {
  const encoder = new TextEncoder();
  const pieces: string[] = [];
  let current = '';
  let size = 0;
  // Iterating the string yields whole code points, so an emoji is measured and
  // placed as one unit rather than as two halves.
  for (const character of text) {
    const width = encoder.encode(character).length;
    if (size + width > MAX_ENCODED_BYTES && current !== '') {
      pieces.push(current);
      current = '';
      size = 0;
    }
    current += character;
    size += width;
  }
  if (current !== '') {
    pieces.push(current);
  }
  return pieces;
}
