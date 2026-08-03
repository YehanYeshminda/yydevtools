/**
 * Turning form fields into the text a QR code should actually carry.
 *
 * A QR code only ever encodes a string; what makes one "a Wi-Fi code" or "a
 * contact card" is a convention about how that string is written, and phone
 * cameras recognise those conventions and offer to act on them. Getting the
 * conventions exactly right — down to which characters have to be escaped — is
 * the whole job, so it lives here as pure functions with tests rather than
 * inside the component.
 */

export type QrKind = 'text' | 'url' | 'wifi' | 'vcard' | 'email' | 'sms' | 'tel' | 'geo' | 'event';

export interface WifiFields {
  ssid: string;
  password: string;
  security: 'WPA' | 'WEP' | 'nopass';
  hidden: boolean;
}

export interface VCardFields {
  firstName: string;
  lastName: string;
  organisation: string;
  title: string;
  phone: string;
  email: string;
  url: string;
  address: string;
  note: string;
}

export interface EmailFields {
  to: string;
  subject: string;
  body: string;
}

export interface SmsFields {
  number: string;
  message: string;
}

export interface GeoFields {
  latitude: string;
  longitude: string;
}

export interface EventFields {
  title: string;
  location: string;
  /** `datetime-local` values, e.g. `2026-08-03T14:30`. */
  start: string;
  end: string;
  description: string;
}

export interface QrFields {
  text: string;
  url: string;
  wifi: WifiFields;
  vcard: VCardFields;
  email: EmailFields;
  sms: SmsFields;
  tel: string;
  geo: GeoFields;
  event: EventFields;
}

export const EMPTY_FIELDS: QrFields = {
  text: '',
  url: 'https://yydevtools.com',
  wifi: { ssid: '', password: '', security: 'WPA', hidden: false },
  vcard: {
    firstName: '',
    lastName: '',
    organisation: '',
    title: '',
    phone: '',
    email: '',
    url: '',
    address: '',
    note: '',
  },
  email: { to: '', subject: '', body: '' },
  sms: { number: '', message: '' },
  tel: '',
  geo: { latitude: '', longitude: '' },
  event: { title: '', location: '', start: '', end: '', description: '' },
};

/** The payload for `kind`, or an empty string when the required fields are blank. */
export function buildPayload(kind: QrKind, fields: QrFields): string {
  switch (kind) {
    case 'text':
      return fields.text.trim();
    case 'url':
      return buildUrl(fields.url);
    case 'wifi':
      return buildWifi(fields.wifi);
    case 'vcard':
      return buildVCard(fields.vcard);
    case 'email':
      return buildEmail(fields.email);
    case 'sms':
      return buildSms(fields.sms);
    case 'tel':
      return buildTel(fields.tel);
    case 'geo':
      return buildGeo(fields.geo);
    case 'event':
      return buildEvent(fields.event);
  }
}

/**
 * A bare domain is what people type, but a scanner shown `example.com` treats
 * it as plain text and offers nothing useful. Assuming https makes it a link.
 */
function buildUrl(raw: string): string {
  const value = raw.trim();
  if (value === '') {
    return '';
  }
  return /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
}

/**
 * `WIFI:T:WPA;S:name;P:secret;H:true;;`
 *
 * Backslash, semicolon, comma, colon and double quote all terminate or delimit
 * something in this grammar, so each has to be escaped — an SSID containing a
 * semicolon would otherwise silently truncate the rest of the payload. The
 * trailing double semicolon is required by the format.
 */
function buildWifi(wifi: WifiFields): string {
  const ssid = wifi.ssid.trim();
  if (ssid === '') {
    return '';
  }
  const parts = [`T:${wifi.security}`, `S:${escapeWifi(ssid)}`];
  if (wifi.security !== 'nopass' && wifi.password !== '') {
    parts.push(`P:${escapeWifi(wifi.password)}`);
  }
  if (wifi.hidden) {
    parts.push('H:true');
  }
  return `WIFI:${parts.join(';')};;`;
}

function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

/**
 * vCard 3.0 — the version phone cameras handle most consistently.
 *
 * Lines are joined with CRLF because the specification says so, and readers
 * that are strict about it exist.
 */
function buildVCard(card: VCardFields): string {
  const first = card.firstName.trim();
  const last = card.lastName.trim();
  const full = [first, last].filter(Boolean).join(' ');
  if (full === '' && card.organisation.trim() === '') {
    return '';
  }

  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push(`N:${escapeVCard(last)};${escapeVCard(first)};;;`);
  lines.push(`FN:${escapeVCard(full || card.organisation.trim())}`);
  addIf(lines, 'ORG', card.organisation);
  addIf(lines, 'TITLE', card.title);
  if (card.phone.trim()) {
    lines.push(`TEL;TYPE=CELL:${escapeVCard(card.phone.trim())}`);
  }
  if (card.email.trim()) {
    lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(card.email.trim())}`);
  }
  addIf(lines, 'URL', card.url);
  if (card.address.trim()) {
    // ADR is seven semicolon-separated components; a single free-text address
    // belongs in the third (street) with the rest left empty.
    lines.push(`ADR;TYPE=HOME:;;${escapeVCard(card.address.trim())};;;;`);
  }
  addIf(lines, 'NOTE', card.note);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

function addIf(lines: string[], property: string, value: string): void {
  if (value.trim() !== '') {
    lines.push(`${property}:${escapeVCard(value.trim())}`);
  }
}

function escapeVCard(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([;,])/g, '\\$1')
    .replace(/\r?\n/g, '\\n');
}

/** `mailto:` — understood by every phone, unlike the older MATMSG form. */
function buildEmail(email: EmailFields): string {
  const to = email.to.trim();
  if (to === '') {
    return '';
  }
  const query = new URLSearchParams();
  if (email.subject.trim()) {
    query.set('subject', email.subject.trim());
  }
  if (email.body.trim()) {
    query.set('body', email.body.trim());
  }
  const search = query.toString();
  // URLSearchParams renders spaces as "+", which is right for a form body but
  // wrong in a mailto — mail clients show the plus signs verbatim.
  return search ? `mailto:${to}?${search.replace(/\+/g, '%20')}` : `mailto:${to}`;
}

/** `SMSTO:` is the form Android and iOS both act on. */
function buildSms(sms: SmsFields): string {
  const number = cleanNumber(sms.number);
  if (number === '') {
    return '';
  }
  return sms.message.trim() ? `SMSTO:${number}:${sms.message.trim()}` : `SMSTO:${number}`;
}

function buildTel(raw: string): string {
  const number = cleanNumber(raw);
  return number === '' ? '' : `tel:${number}`;
}

/**
 * Keeps digits, a leading plus and the separators diallers understand.
 *
 * The parentheses rule is not arbitrary. Written internationally,
 * `+44 (0)20 7946 0958` uses `(0)` for the national trunk prefix — the digit
 * you dial domestically and must *omit* when dialling in from abroad — so
 * keeping it produces a number that does not connect. Written domestically,
 * `(020) 7946 0958` puts the area code in the same brackets and those digits
 * are required. The leading `+` is what distinguishes the two.
 */
function cleanNumber(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return '';
  }
  const international = trimmed.startsWith('+');
  const body = international ? trimmed.replace(/\([^)]*\)/g, '') : trimmed;
  return (international ? '+' : '') + body.replace(/[^\d,;*#]/g, '');
}

function buildGeo(geo: GeoFields): string {
  const latitude = Number(geo.latitude);
  const longitude = Number(geo.longitude);
  if (geo.latitude.trim() === '' || geo.longitude.trim() === '') {
    return '';
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return '';
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return '';
  }
  return `geo:${latitude},${longitude}`;
}

/**
 * A bare VEVENT, which is what calendar apps expect from a QR code — the
 * surrounding VCALENDAR wrapper is not used here and readers do not want it.
 *
 * Times are written without a zone, which iCalendar calls "floating": 14:30
 * means 14:30 wherever the person scanning it happens to be. That is almost
 * always what someone printing a poster intends.
 */
function buildEvent(event: EventFields): string {
  const title = event.title.trim();
  if (title === '') {
    return '';
  }
  const lines = ['BEGIN:VEVENT', `SUMMARY:${escapeVCard(title)}`];
  const start = toICalDate(event.start);
  const end = toICalDate(event.end);
  if (start) {
    lines.push(`DTSTART:${start}`);
  }
  if (end) {
    lines.push(`DTEND:${end}`);
  }
  addIf(lines, 'LOCATION', event.location);
  addIf(lines, 'DESCRIPTION', event.description);
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

/** `2026-08-03T14:30` → `20260803T143000`. Anything unparseable is dropped. */
export function toICalDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second] = match;
  return `${year}${month}${day}T${hour}${minute}${second ?? '00'}`;
}
