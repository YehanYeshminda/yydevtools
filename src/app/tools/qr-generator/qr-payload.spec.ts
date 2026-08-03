import { describe, expect, it } from 'vitest';

import { EMPTY_FIELDS, buildPayload, toICalDate, type QrFields } from './qr-payload';

/** A copy of the defaults with one section replaced. */
function fields(patch: Partial<QrFields>): QrFields {
  return { ...EMPTY_FIELDS, ...patch };
}

describe('text and url', () => {
  it('trims plain text', () => {
    expect(buildPayload('text', fields({ text: '  hello  ' }))).toBe('hello');
  });

  it('assumes https for a bare domain', () => {
    expect(buildPayload('url', fields({ url: 'example.com' }))).toBe('https://example.com');
  });

  it('leaves an explicit scheme alone', () => {
    expect(buildPayload('url', fields({ url: 'http://example.com' }))).toBe('http://example.com');
    expect(buildPayload('url', fields({ url: 'ftp://files.example.com' }))).toBe(
      'ftp://files.example.com',
    );
  });

  it('is empty for a blank url', () => {
    expect(buildPayload('url', fields({ url: '   ' }))).toBe('');
  });
});

describe('wifi', () => {
  it('builds a WPA payload', () => {
    const payload = buildPayload(
      'wifi',
      fields({ wifi: { ssid: 'Cafe', password: 'latte123', security: 'WPA', hidden: false } }),
    );
    expect(payload).toBe('WIFI:T:WPA;S:Cafe;P:latte123;;');
  });

  it('omits the password for an open network', () => {
    const payload = buildPayload(
      'wifi',
      fields({ wifi: { ssid: 'Free', password: 'ignored', security: 'nopass', hidden: false } }),
    );
    expect(payload).toBe('WIFI:T:nopass;S:Free;;');
  });

  it('marks a hidden network', () => {
    const payload = buildPayload(
      'wifi',
      fields({ wifi: { ssid: 'Secret', password: 'p', security: 'WPA', hidden: true } }),
    );
    expect(payload).toBe('WIFI:T:WPA;S:Secret;P:p;H:true;;');
  });

  it('escapes the characters that would otherwise truncate the payload', () => {
    const payload = buildPayload(
      'wifi',
      fields({
        wifi: { ssid: 'My;Net', password: 'a:b,c"d\\e', security: 'WPA', hidden: false },
      }),
    );
    expect(payload).toBe('WIFI:T:WPA;S:My\\;Net;P:a\\:b\\,c\\"d\\\\e;;');
  });

  it('is empty without an SSID', () => {
    expect(buildPayload('wifi', EMPTY_FIELDS)).toBe('');
  });
});

describe('vcard', () => {
  it('builds a card with the structured and display names', () => {
    const payload = buildPayload(
      'vcard',
      fields({
        vcard: {
          ...EMPTY_FIELDS.vcard,
          firstName: 'Ada',
          lastName: 'Lovelace',
          phone: '+44 20 7946 0958',
          email: 'ada@example.com',
        },
      }),
    );
    const lines = payload.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCARD');
    expect(lines[1]).toBe('VERSION:3.0');
    expect(lines).toContain('N:Lovelace;Ada;;;');
    expect(lines).toContain('FN:Ada Lovelace');
    expect(lines).toContain('TEL;TYPE=CELL:+44 20 7946 0958');
    expect(lines).toContain('EMAIL;TYPE=INTERNET:ada@example.com');
    expect(lines[lines.length - 1]).toBe('END:VCARD');
  });

  it('uses CRLF line endings', () => {
    const payload = buildPayload(
      'vcard',
      fields({ vcard: { ...EMPTY_FIELDS.vcard, firstName: 'Ada' } }),
    );
    expect(payload).toContain('\r\n');
    expect(payload.split('\r\n').every((line) => !line.includes('\n'))).toBe(true);
  });

  it('escapes commas, semicolons and newlines', () => {
    const payload = buildPayload(
      'vcard',
      fields({
        vcard: { ...EMPTY_FIELDS.vcard, firstName: 'A', note: 'one, two; three\nfour' },
      }),
    );
    expect(payload).toContain('NOTE:one\\, two\\; three\\nfour');
  });

  it('puts a free-text address in the street component', () => {
    const payload = buildPayload(
      'vcard',
      fields({ vcard: { ...EMPTY_FIELDS.vcard, firstName: 'A', address: '1 High St' } }),
    );
    expect(payload).toContain('ADR;TYPE=HOME:;;1 High St;;;;');
  });

  it('falls back to the organisation when there is no person', () => {
    const payload = buildPayload(
      'vcard',
      fields({ vcard: { ...EMPTY_FIELDS.vcard, organisation: 'Acme Ltd' } }),
    );
    expect(payload).toContain('FN:Acme Ltd');
  });

  it('is empty with neither a name nor an organisation', () => {
    expect(buildPayload('vcard', EMPTY_FIELDS)).toBe('');
  });
});

describe('email, sms, tel and geo', () => {
  it('builds a mailto with encoded parameters', () => {
    const payload = buildPayload(
      'email',
      fields({ email: { to: 'a@b.com', subject: 'Hello there', body: 'Line one' } }),
    );
    expect(payload).toBe('mailto:a@b.com?subject=Hello%20there&body=Line%20one');
  });

  it('omits the query when there is nothing to put in it', () => {
    expect(buildPayload('email', fields({ email: { to: 'a@b.com', subject: '', body: '' } }))).toBe(
      'mailto:a@b.com',
    );
  });

  it('builds an SMSTO payload', () => {
    expect(
      buildPayload('sms', fields({ sms: { number: '+1 555 0100', message: 'Hi' } })),
    ).toBe('SMSTO:+15550100:Hi');
  });

  it('strips formatting from a phone number but keeps the plus', () => {
    expect(buildPayload('tel', fields({ tel: '+1 555-0100' }))).toBe('tel:+15550100');
  });

  it('drops a trunk prefix in brackets after an international code', () => {
    expect(buildPayload('tel', fields({ tel: '+44 (0)20 7946 0958' }))).toBe('tel:+442079460958');
  });

  it('keeps a bracketed area code on a domestic number', () => {
    expect(buildPayload('tel', fields({ tel: '(020) 7946 0958' }))).toBe('tel:02079460958');
  });

  it('builds a geo URI', () => {
    expect(
      buildPayload('geo', fields({ geo: { latitude: '51.5072', longitude: '-0.1276' } })),
    ).toBe('geo:51.5072,-0.1276');
  });

  it('rejects out-of-range and non-numeric coordinates', () => {
    expect(buildPayload('geo', fields({ geo: { latitude: '95', longitude: '0' } }))).toBe('');
    expect(buildPayload('geo', fields({ geo: { latitude: 'north', longitude: '0' } }))).toBe('');
    expect(buildPayload('geo', fields({ geo: { latitude: '', longitude: '0' } }))).toBe('');
  });
});

describe('event', () => {
  it('builds a bare VEVENT', () => {
    const payload = buildPayload(
      'event',
      fields({
        event: {
          title: 'Launch',
          location: 'HQ',
          start: '2026-08-03T14:30',
          end: '2026-08-03T16:00',
          description: '',
        },
      }),
    );
    expect(payload.split('\r\n')).toEqual([
      'BEGIN:VEVENT',
      'SUMMARY:Launch',
      'DTSTART:20260803T143000',
      'DTEND:20260803T160000',
      'LOCATION:HQ',
      'END:VEVENT',
    ]);
  });

  it('omits dates that cannot be read', () => {
    const payload = buildPayload(
      'event',
      fields({ event: { ...EMPTY_FIELDS.event, title: 'X', start: 'tomorrow' } }),
    );
    expect(payload).not.toContain('DTSTART');
  });

  it('is empty without a title', () => {
    expect(buildPayload('event', EMPTY_FIELDS)).toBe('');
  });
});

describe('toICalDate', () => {
  it('converts a datetime-local value', () => {
    expect(toICalDate('2026-08-03T14:30')).toBe('20260803T143000');
  });

  it('keeps seconds when the browser supplies them', () => {
    expect(toICalDate('2026-08-03T14:30:45')).toBe('20260803T143045');
  });

  it('returns null for anything else', () => {
    expect(toICalDate('')).toBeNull();
    expect(toICalDate('2026-08-03')).toBeNull();
  });
});
