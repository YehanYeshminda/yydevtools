import { describe, expect, it } from 'vitest';

import { cleanText, cleanUrl, onHost, richHtml, segments, trimTrailing } from './link-clean';
import { REDIRECT_WRAPPERS, TRACKING_RULES } from './tracking-params';

describe('cleanUrl', () => {
  it('removes campaign tags and click IDs and keeps the rest exactly as typed', () => {
    const result = cleanUrl(
      'https://shop.example.com/p/42?colour=red+blue&utm_source=news&utm_medium=email&fbclid=IwAR0x&gclid=Cj0K&size=M#reviews',
    );
    expect(result?.cleaned).toBe('https://shop.example.com/p/42?colour=red+blue&size=M#reviews');
    expect(result?.removed.map((p) => p.name)).toEqual(['utm_source', 'utm_medium', 'fbclid', 'gclid']);
    expect(result?.kept).toEqual(['colour', 'size']);
    expect(result?.removed[2]).toEqual({
      name: 'fbclid',
      value: 'IwAR0x',
      source: 'Meta (Facebook, Instagram) click ID',
    });
  });

  it('drops the ? when every parameter was tracking, without adding a slash', () => {
    expect(cleanUrl('https://example.com?utm_source=x&mc_eid=1')?.cleaned).toBe('https://example.com');
  });

  it('leaves a link with nothing to remove byte for byte alone', () => {
    const raw = 'https://example.com/search?q=a%20b&&x=1';
    expect(cleanUrl(raw)).toEqual({ original: raw, cleaned: raw, removed: [], unwrapped: [], kept: ['q', 'x'] });
  });

  it('matches names regardless of case', () => {
    expect(cleanUrl('https://example.com/?UTM_Source=x&ScCid=1&hsCtaTracking=2')?.cleaned).toBe(
      'https://example.com/',
    );
  });

  it('keeps what a page needs: YouTube v and t, a search q, an id, GitHub ref', () => {
    expect(cleanUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42&si=AbCd&pp=ygU')?.cleaned).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42',
    );
    expect(cleanUrl('https://youtu.be/dQw4w9WgXcQ?si=AbCd')?.cleaned).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(cleanUrl('https://www.google.com/search?q=cats&sca_esv=1&ei=2&oq=ca')?.cleaned).toBe(
      'https://www.google.com/search?q=cats',
    );
    expect(cleanUrl('https://example.com/item?id=7&utm_campaign=x')?.cleaned).toBe('https://example.com/item?id=7');
    expect(cleanUrl('https://github.com/o/r/blob/x.md?ref=main')?.cleaned).toBe('https://github.com/o/r/blob/x.md?ref=main');
  });

  it('scopes a name to the sites that use it for tracking', () => {
    // si and t are tracking on YouTube, Spotify and x.com, but mean something elsewhere.
    expect(cleanUrl('https://open.spotify.com/track/1?si=abc')?.cleaned).toBe('https://open.spotify.com/track/1');
    expect(cleanUrl('https://x.com/user/status/1?s=20&t=Zx')?.cleaned).toBe('https://x.com/user/status/1');
    expect(cleanUrl('https://example.com/map?si=3&t=5&s=2')?.cleaned).toBe('https://example.com/map?si=3&t=5&s=2');
    expect(cleanUrl('https://www.amazon.co.uk/dp/B0?th=1&psc=1&pd_rd_w=x&pf_rd_p=y&qid=3&tag=me-21')?.cleaned).toBe(
      'https://www.amazon.co.uk/dp/B0?th=1&psc=1&tag=me-21',
    );
  });

  it('unwraps a Google redirect and cleans the destination', () => {
    const result = cleanUrl(
      'https://www.google.com/url?sa=t&q=https%3A%2F%2Fexample.com%2Fa%3Fid%3D1%26utm_source%3Dg&ved=2ah',
    );
    expect(result).toMatchObject({
      cleaned: 'https://example.com/a?id=1',
      unwrapped: ['Google'],
      kept: ['id'],
    });
  });

  it('unwraps Facebook, Outlook Safe Links and DuckDuckGo, and nested wrappers', () => {
    expect(cleanUrl('https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2F%3Ffbclid%3Dz&h=AT0')?.cleaned).toBe(
      'https://example.com/',
    );
    expect(
      cleanUrl('https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.com%2Fdoc&data=05%7C01&reserved=0')
        ?.cleaned,
    ).toBe('https://example.com/doc');
    expect(cleanUrl('https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fz&rut=abc')?.cleaned).toBe(
      'https://example.com/z',
    );
    const inner = encodeURIComponent('https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fdeep');
    expect(cleanUrl(`https://nam12.safelinks.protection.outlook.com/?url=${inner}`)).toMatchObject({
      cleaned: 'https://example.com/deep',
      unwrapped: ['Outlook Safe Links', 'Google'],
    });
  });

  it('never unwraps into a non-web link, and leaves a plain search alone', () => {
    const script = 'https://www.google.com/url?q=javascript:alert(1)';
    expect(cleanUrl(script)?.cleaned).toBe(script);
    expect(cleanUrl('https://www.google.com/url?q=cats')?.unwrapped).toEqual([]);
    // Only on the wrapper's own host and path.
    expect(cleanUrl('https://example.com/url?q=https%3A%2F%2Fevil.test')?.unwrapped).toEqual([]);
  });

  it('ignores anything that is not an http or https URL', () => {
    expect(cleanUrl('ftp://example.com/?utm_source=x')).toBeNull();
    expect(cleanUrl('not a link')).toBeNull();
  });
});

describe('onHost', () => {
  it('matches a domain and its subdomains only', () => {
    expect(onHost('youtube.com', 'youtube.com')).toBe(true);
    expect(onHost('m.youtube.com', 'youtube.com')).toBe(true);
    expect(onHost('notyoutube.com', 'youtube.com')).toBe(false);
  });

  it('treats name.* as any country domain', () => {
    for (const host of ['google.com', 'www.google.co.uk', 'google.de', 'www.google.com.au']) {
      expect(onHost(host, 'google.*'), host).toBe(true);
    }
    expect(onHost('google.example.com', 'google.*')).toBe(false);
    expect(onHost('mygoogle.com', 'google.*')).toBe(false);
  });
});

describe('trimTrailing', () => {
  it('drops sentence punctuation but keeps a bracket the link opened', () => {
    expect(trimTrailing('https://example.com/a.')).toBe('https://example.com/a');
    expect(trimTrailing('https://example.com/a),')).toBe('https://example.com/a');
    expect(trimTrailing('https://en.wikipedia.org/wiki/Mercury_(planet)')).toBe(
      'https://en.wikipedia.org/wiki/Mercury_(planet)',
    );
  });
});

describe('cleanText', () => {
  it('cleans every link in running text and leaves the words alone', () => {
    const text =
      'Read this (https://example.com/a?utm_source=x) and https://youtu.be/v1?si=s.\nAlso https://example.com/ok?id=2';
    const result = cleanText(text);
    expect(result.text).toBe(
      'Read this (https://example.com/a) and https://youtu.be/v1.\nAlso https://example.com/ok?id=2',
    );
    expect(result.links.map((l) => l.removed.length)).toEqual([1, 1, 0]);
  });

  it('handles one link per line', () => {
    const result = cleanText('https://a.example/?fbclid=1\r\nhttps://b.example/?gclid=2');
    expect(result.text).toBe('https://a.example/\r\nhttps://b.example/');
  });
});

describe('segments and richHtml', () => {
  it('splits text into words and links', () => {
    expect(segments('see https://example.com/a. ok')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', href: 'https://example.com/a' },
      { kind: 'text', text: '. ok' },
    ]);
  });

  it('turns every link into an anchor, escaping the words around it', () => {
    expect(richHtml('A <b> & https://example.com/docs?id=1\nnext')).toBe(
      'A &lt;b&gt; &amp; <a href="https://example.com/docs?id=1">example.com/docs</a><br>next',
    );
  });
});

describe('the tracking list', () => {
  it('is lower-case and says who adds every entry', () => {
    for (const rule of TRACKING_RULES) {
      expect(rule.source.length).toBeGreaterThan(5);
      expect(rule.names !== undefined || rule.prefix !== undefined).toBe(true);
      for (const name of rule.names ?? []) expect(name).toBe(name.toLowerCase());
      expect(rule.prefix ?? '').toBe((rule.prefix ?? '').toLowerCase());
    }
    expect(REDIRECT_WRAPPERS.every((w) => w.params.length > 0)).toBe(true);
  });
});
