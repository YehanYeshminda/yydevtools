import { describe, expect, it } from 'vitest';

import { EMPTY_FIELDS, buildPayload, type QrFields, type QrKind } from '../qr-generator/qr-payload';
import { describeContent, type QrContent } from './qr-content';

/** What the QR Generator writes for `kind`, read back. */
function roundTrip(kind: QrKind, patch: Partial<QrFields>): QrContent {
  return describeContent(buildPayload(kind, { ...EMPTY_FIELDS, ...patch }));
}

const field = (content: QrContent, label: string) =>
  content.fields.find((item) => item.label === label)?.value;

describe('describeContent reads what the generator writes', () => {
  it('a link, with its host on its own line', () => {
    const content = roundTrip('url', { url: 'example.com/pay?x=1' });
    expect(content.kind).toBe('url');
    expect(field(content, 'Site')).toBe('example.com');
    expect(content.href).toBe('https://example.com/pay?x=1');
  });

  it('Wi-Fi, including the characters that have to be escaped', () => {
    const content = roundTrip('wifi', {
      wifi: { ssid: 'Cafe;Bar: 2', password: 'a\\b,c"d', security: 'WPA', hidden: true },
    });
    expect(content.fields).toEqual([
      { label: 'Network', value: 'Cafe;Bar: 2' },
      { label: 'Security', value: 'WPA' },
      { label: 'Password', value: 'a\\b,c"d' },
      { label: 'Hidden', value: 'Yes' },
    ]);
    expect(content.href).toBeUndefined();
  });

  it('an open Wi-Fi network', () => {
    const content = roundTrip('wifi', {
      wifi: { ssid: 'Free', password: '', security: 'nopass', hidden: false },
    });
    expect(field(content, 'Security')).toBe('None');
    expect(field(content, 'Password')).toBeUndefined();
  });

  it('a contact card', () => {
    const content = roundTrip('vcard', {
      vcard: {
        ...EMPTY_FIELDS.vcard,
        firstName: 'Ada',
        lastName: 'Lovelace',
        organisation: 'Engines, Ltd',
        phone: '+44 20 7946 0958',
        email: 'ada@example.com',
        address: '12 St James; London',
        note: 'Line one\nLine two',
      },
    });
    expect(content.kind).toBe('contact');
    expect(field(content, 'Name')).toBe('Ada Lovelace');
    expect(field(content, 'Organisation')).toBe('Engines, Ltd');
    expect(field(content, 'Phone')).toBe('+44 20 7946 0958');
    expect(field(content, 'Address')).toBe('12 St James; London');
    expect(field(content, 'Note')).toBe('Line one\nLine two');
  });

  it('an email', () => {
    const content = roundTrip('email', {
      email: { to: 'hi@example.com', subject: 'Order 42', body: 'Two lines\nhere' },
    });
    expect(content.fields).toEqual([
      { label: 'To', value: 'hi@example.com' },
      { label: 'Subject', value: 'Order 42' },
      { label: 'Message', value: 'Two lines\nhere' },
    ]);
    expect(content.href).toMatch(/^mailto:hi@example\.com\?/);
  });

  it('a text message, with a colon in it', () => {
    const content = roundTrip('sms', { sms: { number: '+94 77 123 4567', message: 'Meet at 5:30' } });
    expect(field(content, 'Number')).toBe('+94771234567');
    expect(field(content, 'Message')).toBe('Meet at 5:30');
    expect(content.href).toBe('sms:+94771234567?body=Meet%20at%205%3A30');
  });

  it('a phone number, a location and an event', () => {
    expect(roundTrip('tel', { tel: '+94 11 234 5678' }).href).toBe('tel:+94112345678');

    const place = roundTrip('geo', { geo: { latitude: '6.9271', longitude: '79.8612' } });
    expect(place.fields.map((item) => item.value)).toEqual(['6.9271', '79.8612']);
    expect(place.href).toContain('openstreetmap.org/?mlat=6.9271&mlon=79.8612');

    const event = roundTrip('event', {
      event: {
        title: 'Launch, v2',
        location: 'Colombo',
        start: '2026-10-01T18:30',
        end: '',
        description: '',
      },
    });
    expect(event.fields).toEqual([
      { label: 'Event', value: 'Launch, v2' },
      { label: 'Starts', value: '2026-10-01 18:30' },
      { label: 'Location', value: 'Colombo' },
    ]);
  });
});

describe('describeContent keeps anything else safe and plain', () => {
  it('never offers a script or data URL as a link', () => {
    for (const payload of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd']) {
      const content = describeContent(payload);
      expect(content.kind).toBe('text');
      expect(content.href).toBeUndefined();
    }
  });

  it('treats ordinary text as text', () => {
    expect(describeContent('Table 12 — two lattes').kind).toBe('text');
  });
});
