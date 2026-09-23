/**
 * What a scanned code means — the reverse of qr-generator/qr-payload.ts.
 *
 * A QR code only carries a string; a phone offers "Join network" or "Add
 * contact" because the string follows a convention. This reads the same
 * conventions the generator writes, so everything the generator makes is shown
 * here as fields rather than as a wall of `WIFI:T:WPA;S:…`.
 */

export type QrContentKind =
  | 'url'
  | 'wifi'
  | 'contact'
  | 'email'
  | 'sms'
  | 'tel'
  | 'geo'
  | 'event'
  | 'text';

export interface QrField {
  label: string;
  value: string;
}

export interface QrContent {
  kind: QrContentKind;
  /** "Link", "Wi-Fi network"… */
  label: string;
  fields: QrField[];
  /**
   * Somewhere to go, when there is one. Only http(s), mailto, tel and sms ever
   * land here: a `javascript:` or `data:` payload is shown as text, never
   * offered as a link.
   */
  href?: string;
  /** The button text for `href`. */
  action?: string;
}

export function describeContent(raw: string): QrContent {
  const text = raw.trim();
  return (
    readUrl(text) ??
    readWifi(text) ??
    readVCard(text) ??
    readEmail(text) ??
    readSms(text) ??
    readTel(text) ??
    readGeo(text) ??
    readEvent(text) ?? { kind: 'text', label: 'Text', fields: [] }
  );
}

function readUrl(text: string): QrContent | null {
  if (!/^https?:\/\/\S+$/i.test(text) || !URL.canParse(text)) {
    return null;
  }
  const url = new URL(text);
  // The host on its own line, because that is what decides where the link
  // really goes — a lookalike domain hides best inside a long address.
  return {
    kind: 'url',
    label: 'Link',
    fields: [
      { label: 'Site', value: url.host },
      { label: 'Address', value: url.href },
    ],
    href: url.href,
    action: 'Open link',
  };
}

function readWifi(text: string): QrContent | null {
  if (!/^WIFI:/i.test(text)) {
    return null;
  }
  const values = new Map<string, string>();
  for (const part of splitUnescaped(text.slice(5), ';')) {
    const colon = part.indexOf(':');
    if (colon > 0) {
      values.set(part.slice(0, colon).toUpperCase(), part.slice(colon + 1).replace(/\\(.)/g, '$1'));
    }
  }
  const ssid = values.get('S');
  if (!ssid) {
    return null;
  }
  const security = values.get('T') ?? '';
  const fields = [
    { label: 'Network', value: ssid },
    { label: 'Security', value: /^nopass$/i.test(security) || !security ? 'None' : security },
  ];
  const password = values.get('P');
  if (password) {
    fields.push({ label: 'Password', value: password });
  }
  if (values.get('H')?.toLowerCase() === 'true') {
    fields.push({ label: 'Hidden', value: 'Yes' });
  }
  return { kind: 'wifi', label: 'Wi-Fi network', fields };
}

const VCARD_FIELDS: Record<string, string> = {
  FN: 'Name',
  ORG: 'Organisation',
  TITLE: 'Title',
  TEL: 'Phone',
  EMAIL: 'Email',
  URL: 'Website',
  ADR: 'Address',
  NOTE: 'Note',
};

function readVCard(text: string): QrContent | null {
  if (!/^BEGIN:VCARD/i.test(text)) {
    return null;
  }
  const fields: QrField[] = [];
  for (const [name, value] of properties(text)) {
    const label = VCARD_FIELDS[name];
    if (!label) {
      continue;
    }
    // ADR is seven ;-separated parts, most of them usually empty.
    const shown =
      name === 'ADR'
        ? splitUnescaped(value, ';').map(unescapeText).filter(Boolean).join(', ')
        : unescapeText(value);
    if (shown) {
      fields.push({ label, value: shown });
    }
  }
  return { kind: 'contact', label: 'Contact', fields };
}

function readEmail(text: string): QrContent | null {
  if (!/^mailto:/i.test(text) || !URL.canParse(text)) {
    return null;
  }
  const url = new URL(text);
  const fields = [{ label: 'To', value: decodeURIComponent(url.pathname) }];
  for (const [key, label] of [
    ['subject', 'Subject'],
    ['body', 'Message'],
  ]) {
    const value = url.searchParams.get(key);
    if (value) {
      fields.push({ label, value });
    }
  }
  return { kind: 'email', label: 'Email', fields, href: text, action: 'Write email' };
}

/** `SMSTO:number:message`, the form the generator writes, or an `sms:` URI. */
function readSms(text: string): QrContent | null {
  const match = /^(?:SMSTO:([^:]*)(?::([\s\S]*))?|sms:([^?]*)(?:\?body=(.*))?)$/i.exec(text);
  if (!match) {
    return null;
  }
  const number = match[1] ?? match[3] ?? '';
  const message = match[2] ?? (match[4] ? decodeURIComponent(match[4]) : '');
  const fields = [{ label: 'Number', value: number }];
  if (message) {
    fields.push({ label: 'Message', value: message });
  }
  const href = `sms:${number}${message ? `?body=${encodeURIComponent(message)}` : ''}`;
  return { kind: 'sms', label: 'Text message', fields, href, action: 'Send message' };
}

function readTel(text: string): QrContent | null {
  const match = /^tel:([+\d\s().,;*#-]+)$/i.exec(text);
  return match
    ? {
        kind: 'tel',
        label: 'Phone number',
        fields: [{ label: 'Number', value: match[1] }],
        href: text,
        action: 'Call',
      }
    : null;
}

function readGeo(text: string): QrContent | null {
  const match = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i.exec(text);
  if (!match) {
    return null;
  }
  const [, lat, lon] = match;
  return {
    kind: 'geo',
    label: 'Location',
    fields: [
      { label: 'Latitude', value: lat },
      { label: 'Longitude', value: lon },
    ],
    href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`,
    action: 'Show on map',
  };
}

const EVENT_FIELDS: Record<string, string> = {
  SUMMARY: 'Event',
  DTSTART: 'Starts',
  DTEND: 'Ends',
  LOCATION: 'Location',
  DESCRIPTION: 'Details',
};

function readEvent(text: string): QrContent | null {
  if (!/^BEGIN:(VEVENT|VCALENDAR)/i.test(text)) {
    return null;
  }
  const fields: QrField[] = [];
  for (const [name, value] of properties(text)) {
    const label = EVENT_FIELDS[name];
    if (label) {
      fields.push({ label, value: name.startsWith('DT') ? readDate(value) : unescapeText(value) });
    }
  }
  return { kind: 'event', label: 'Calendar event', fields };
}

/** `20260803T143000` → `2026-08-03 14:30`; anything else as it came. */
function readDate(value: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(value);
  if (!match) {
    return value;
  }
  const [, year, month, day, hour, minute] = match;
  return `${year}-${month}-${day}${hour ? ` ${hour}:${minute}` : ''}`;
}

/**
 * The `NAME;PARAMS:value` lines of a vCard or iCalendar block, with folded
 * lines (continued by a leading space) joined back up and parameters dropped.
 */
function properties(text: string): [string, string][] {
  return text
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n/)
    .flatMap((line): [string, string][] => {
      const colon = line.indexOf(':');
      if (colon < 1) {
        return [];
      }
      return [[line.slice(0, colon).split(';')[0].toUpperCase(), line.slice(colon + 1)]];
    });
}

/** vCard and iCalendar text escapes: `\n`, `\,`, `\;`, `\\`. */
function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, char: string) =>
    char.toLowerCase() === 'n' ? '\n' : char,
  );
}

/** Splits on `separator` where it is not backslash-escaped; escapes are kept. */
function splitUnescaped(text: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && i + 1 < text.length) {
      current += text[i] + text[++i];
    } else if (text[i] === separator) {
      parts.push(current);
      current = '';
    } else {
      current += text[i];
    }
  }
  parts.push(current);
  return parts.filter(Boolean);
}
