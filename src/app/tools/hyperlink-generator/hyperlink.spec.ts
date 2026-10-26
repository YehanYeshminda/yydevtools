import { describe, expect, it } from 'vitest';

import { buildLink, defaultLabel, normaliseUrl } from './hyperlink';

describe('normaliseUrl', () => {
  it('adds https:// when there is no scheme', () => {
    expect(normaliseUrl('example.com/invoice')).toEqual({ href: 'https://example.com/invoice' });
  });

  it('treats a port as a port, not a scheme', () => {
    expect(normaliseUrl('example.com:8080/x')).toEqual({ href: 'https://example.com:8080/x' });
    expect(normaliseUrl('localhost:3000')).toEqual({ href: 'https://localhost:3000/' });
  });

  it('completes a protocol-relative link', () => {
    expect(normaliseUrl('//example.com')).toEqual({ href: 'https://example.com/' });
  });

  it('keeps http, mailto and tel as typed', () => {
    expect(normaliseUrl('http://example.com')).toEqual({ href: 'http://example.com/' });
    expect(normaliseUrl('mailto:ada@example.com')).toEqual({ href: 'mailto:ada@example.com' });
    expect(normaliseUrl('tel:+441234567890')).toEqual({ href: 'tel:+441234567890' });
  });

  it('refuses script and data schemes', () => {
    for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<b>x', 'vbscript:x', 'file:///etc/passwd']) {
      expect(normaliseUrl(bad), bad).toHaveProperty('error');
    }
  });

  it('refuses empty input, spaces in the host, and a bare word', () => {
    expect(normaliseUrl('   ')).toHaveProperty('error');
    expect(normaliseUrl('not a link')).toHaveProperty('error');
    expect(normaliseUrl('invoice')).toHaveProperty('error');
  });

  it('accepts a bare word when the scheme was typed', () => {
    expect(normaliseUrl('http://intranet/wiki')).toEqual({ href: 'http://intranet/wiki' });
  });
});

describe('defaultLabel', () => {
  it('is host plus path, decoded, without a lone slash', () => {
    expect(defaultLabel('https://example.com/')).toBe('example.com');
    expect(defaultLabel('https://example.com/caf%C3%A9/menu?x=1')).toBe('example.com/café/menu');
  });

  it('is the address for mailto', () => {
    expect(defaultLabel('mailto:ada@example.com')).toBe('ada@example.com');
  });
});

describe('buildLink', () => {
  it('builds every format from a URL and a label', () => {
    const link = buildLink('example.com/inv/42', "Here's the invoice");
    expect(link).toEqual({
      ok: true,
      href: 'https://example.com/inv/42',
      label: "Here's the invoice",
      html: '<a href="https://example.com/inv/42">Here&#39;s the invoice</a>',
      markdown: "[Here's the invoice](https://example.com/inv/42)",
      plain: "Here's the invoice: https://example.com/inv/42",
    });
  });

  it('uses host and path as the label, and the bare URL as the plain message, when no label is given', () => {
    const link = buildLink('https://example.com/docs', '  ');
    expect(link).toMatchObject({ label: 'example.com/docs', plain: 'https://example.com/docs' });
  });

  it('escapes markup in the label and quotes in the URL', () => {
    const link = buildLink('https://example.com/?q="><script>', '<img src=x onerror=alert(1)>');
    if (!link.ok) throw new Error(link.error);
    expect(link.html).not.toContain('<img');
    expect(link.html).not.toContain('<script');
    expect(link.html).toBe(
      '<a href="https://example.com/?q=%22%3E%3Cscript%3E">&lt;img src=x onerror=alert(1)&gt;</a>',
    );
  });

  it('escapes Markdown brackets in the label and parentheses in the URL', () => {
    const link = buildLink('https://en.wikipedia.org/wiki/Link_(disambiguation)', 'a [b] c');
    expect(link).toMatchObject({
      markdown: '[a \\[b\\] c](https://en.wikipedia.org/wiki/Link_%28disambiguation%29)',
    });
  });

  it('folds line breaks in the label into spaces', () => {
    expect(buildLink('example.com', 'one\ntwo')).toMatchObject({ label: 'one two' });
  });

  it('reports an invalid URL instead of building anything', () => {
    expect(buildLink('javascript:alert(1)', 'x')).toMatchObject({ ok: false });
  });
});
