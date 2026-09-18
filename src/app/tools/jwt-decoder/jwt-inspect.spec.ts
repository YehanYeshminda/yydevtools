import { describe, expect, it } from 'vitest';

import { buildClaims, extractToken, inspect, relativeTime, type Finding } from './jwt-inspect';

const NOW = 1_700_000_000;
const DAY = 86_400;

/** The ids of everything `inspect` reported, which is what the tests assert on. */
function ids(findings: Finding[]): string[] {
  return findings.map((finding) => finding.id);
}

function check(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'HS256' },
  key = '',
  token = 'a.b.c',
): Finding[] {
  return inspect({ header, payload, token, key, nowSeconds: NOW });
}

/** A payload with nothing to complain about, to isolate one check at a time. */
const SOUND = { iss: 'https://issuer.example', aud: 'api', iat: NOW, exp: NOW + 3600 };

describe('finding the token in what was pasted', () => {
  const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln-x_9';

  it('takes a bare token as it is', () => {
    expect(extractToken(token)).toBe(token);
    expect(extractToken(`  ${token}\n`)).toBe(token);
  });

  it('pulls one out of the header it was copied from', () => {
    expect(extractToken(`Authorization: Bearer ${token}`)).toBe(token);
    expect(extractToken(`Bearer ${token}`)).toBe(token);
  });

  it('pulls one out of a quoted string, a JSON body and a curl command', () => {
    expect(extractToken(`"${token}"`)).toBe(token);
    expect(extractToken(`{"access_token":"${token}","token_type":"Bearer"}`)).toBe(token);
    expect(extractToken(`curl -H 'Authorization: Bearer ${token}' https://api.example`)).toBe(
      token,
    );
    expect(extractToken(`session=${token}; Path=/; HttpOnly`)).toBe(token);
  });

  it('puts one back together after a terminal wrapped it', () => {
    const wrapped = `${token.slice(0, 20)}\n${token.slice(20, 35)}\n  ${token.slice(35)}`;
    expect(extractToken(wrapped)).toBe(token);
  });

  it('keeps all five parts of an encrypted token', () => {
    const jwe = 'eyJhbGciOiJSU0EtT0FFUCIsImVuYyI6IkEyNTZHQ00ifQ.aaa.bbb.ccc.ddd';
    expect(extractToken(jwe)).toBe(jwe);
  });

  it('hands back anything it cannot find a token in, so the decoder can complain', () => {
    expect(extractToken('not a token at all')).toBe('not a token at all');
    expect(extractToken('   ')).toBe('');
  });

  it('is not fooled by ordinary dotted words', () => {
    expect(extractToken('see https://example.com.au/docs for details')).toBe(
      'see https://example.com.au/docs for details',
    );
  });
});

describe('listing the claims', () => {
  it('puts the registered ones first and keeps everything else', () => {
    const claims = buildClaims(
      { scope: 'read:all', iss: 'acme', exp: NOW + 60, sub: '42' },
      NOW,
      true,
    );
    expect(claims.map((claim) => claim.key)).toEqual(['exp', 'iss', 'sub', 'scope']);
    expect(claims.at(-1)).toMatchObject({ key: 'scope', value: 'read:all', custom: true });
  });

  it('shows the custom claims a real token is mostly made of', () => {
    const claims = buildClaims(
      { azp: 'web-app', roles: ['admin', 'billing'], email_verified: true, meta: { plan: 'pro' } },
      NOW,
      true,
    );
    expect(claims.map((claim) => [claim.key, claim.label, claim.value])).toEqual([
      ['azp', 'Authorized party', 'web-app'],
      ['roles', 'Roles', 'admin, billing'],
      ['email_verified', 'Email verified', 'true'],
      // No friendlier name than its own key, so the table shows just the key.
      ['meta', '', '{"plan":"pro"}'],
    ]);
  });

  it('dates a time claim and says how far away it is', () => {
    const [exp] = buildClaims({ exp: NOW + 2 * DAY }, NOW, true);
    expect(exp.detail).toBe('2023-11-16 22:13:20 UTC');
    expect(exp.relative).toBe(relativeTime(NOW + 2 * DAY, NOW));
    expect(exp.state).toBeUndefined();
  });

  it('marks the claim that makes the token unusable right now', () => {
    const expired = buildClaims({ exp: NOW - DAY }, NOW, true);
    expect(expired[0].state).toBe('warn');
    const early = buildClaims({ nbf: NOW + DAY }, NOW, true);
    expect(early[0].state).toBe('warn');
    // nbf in the past is simply how most tokens look.
    expect(buildClaims({ nbf: NOW - DAY }, NOW, true)[0].state).toBeUndefined();
  });

  it('dates the custom claims that are also timestamps', () => {
    const [authTime] = buildClaims({ auth_time: NOW - DAY }, NOW, true);
    expect(authTime).toMatchObject({
      label: 'Authenticated at',
      detail: '2023-11-13 22:13:20 UTC',
    });
    // A custom claim that merely holds a number is left as a number.
    expect(buildClaims({ version: 3 }, NOW, true)[0].detail).toBeUndefined();
  });

  it('ignores a registered claim of the wrong type rather than dating a string', () => {
    const claims = buildClaims({ exp: 'soon' }, NOW, true);
    expect(claims).toEqual([{ key: 'exp', label: '', value: 'soon', custom: true }]);
  });
});

describe('saying how long ago', () => {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  it('picks the largest unit that fits', () => {
    expect(relativeTime(NOW + 2 * DAY, NOW)).toBe(rtf.format(2, 'day'));
    expect(relativeTime(NOW - 90 * DAY, NOW)).toBe(rtf.format(-3, 'month'));
    expect(relativeTime(NOW + 800 * DAY, NOW)).toBe(rtf.format(2, 'year'));
    expect(relativeTime(NOW - 7200, NOW)).toBe(rtf.format(-2, 'hour'));
    expect(relativeTime(NOW + 30, NOW)).toBe(rtf.format(30, 'second'));
  });
});

describe('inspecting a token', () => {
  it('says nothing about a token with nothing wrong with it', () => {
    expect(check(SOUND)).toEqual([]);
  });

  it('calls out a token that is not signed', () => {
    expect(ids(check(SOUND, { alg: 'none' }))).toContain('alg-none');
    expect(ids(check(SOUND, { alg: 'NONE' }))).toContain('alg-none');
  });

  it('calls out a header that chooses its own verification key', () => {
    expect(ids(check(SOUND, { alg: 'RS256', jku: 'https://evil.example/keys' }))).toContain(
      'header-jku',
    );
    expect(ids(check(SOUND, { alg: 'RS256', x5u: 'https://evil.example/cert' }))).toContain(
      'header-x5u',
    );
  });

  it('calls out an HMAC token being checked against a public key', () => {
    const pem = '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----';
    expect(ids(check(SOUND, { alg: 'HS256' }, pem))).toContain('key-confusion');
    // The same key against an RSA token is simply correct usage.
    expect(ids(check(SOUND, { alg: 'RS256' }, pem))).not.toContain('key-confusion');
    // And an ordinary secret is not a public key.
    expect(ids(check(SOUND, { alg: 'HS256' }, 'hunter2'))).not.toContain('key-confusion');
  });

  it('calls out secrets hidden anywhere in the payload', () => {
    expect(ids(check({ ...SOUND, password: 'hunter2' }))).toContain('sensitive-claims');
    expect(ids(check({ ...SOUND, user: { profile: { api_key: 'sk-1' } } }))).toContain(
      'sensitive-claims',
    );
    expect(check({ ...SOUND, password: 'a', ssn: 'b' })[0].title).toBe(
      'The payload carries password, ssn',
    );
    // A short, specific list on purpose: this must not cry wolf.
    expect(ids(check({ ...SOUND, token_type: 'Bearer', scope: 'read' }))).toEqual([]);
  });

  it('calls out a token with no expiry, and one with far too much', () => {
    const { exp: _drop, ...noExp } = SOUND;
    expect(ids(check(noExp))).toContain('no-expiry');

    const long = check({ ...SOUND, exp: NOW + 800 * DAY });
    expect(ids(long)).toContain('long-lived');
    expect(long.find((finding) => finding.id === 'long-lived')?.title).toBe('Valid for 2 years');
    // A token that lives an hour is exactly what a token should do.
    expect(ids(check(SOUND))).not.toContain('long-lived');
  });

  it('measures the life from iat, not from now', () => {
    // Issued two years ago and expiring in an hour. Measured from now this
    // looks like an hour-long token; what it really is, is one that has been
    // usable for two years and is about to run out.
    const old = check({ ...SOUND, iat: NOW - 730 * DAY, exp: NOW + 3600 });
    expect(old.find((finding) => finding.id === 'long-lived')?.title).toBe('Valid for 2 years');
  });

  it('calls out a clock that disagrees, but tolerates a small one', () => {
    expect(ids(check({ ...SOUND, iat: NOW + 600 }))).toContain('issued-ahead');
    expect(ids(check({ ...SOUND, iat: NOW + 30 }))).not.toContain('issued-ahead');
  });

  it('mentions a missing audience without making it an alarm', () => {
    const { aud: _drop, ...noAud } = SOUND;
    const finding = check(noAud).find((item) => item.id === 'no-audience');
    expect(finding?.level).toBe('info');
  });

  it('says when a token has outgrown a cookie, and when it has outgrown a header', () => {
    const big = `a.b.${'x'.repeat(5000)}`;
    expect(ids(check(SOUND, { alg: 'HS256' }, '', big))).toContain('large');
    const huge = `a.b.${'x'.repeat(9000)}`;
    const found = ids(check(SOUND, { alg: 'HS256' }, '', huge));
    expect(found).toContain('oversized');
    // One size complaint, not two.
    expect(found).not.toContain('large');
  });

  it('puts the dangerous findings first', () => {
    const { exp: _drop, aud: _also, ...bare } = SOUND;
    const levels = check(bare, { alg: 'none' }).map((finding) => finding.level);
    expect(levels).toEqual(['danger', 'warn', 'info']);
  });
});
