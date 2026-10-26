/**
 * Turns a URL and an optional label into a clickable link in every format a
 * message can carry: a rich HTML anchor for the clipboard, Markdown, an HTML
 * snippet, and a plain "label: url" line for apps that have no hyperlinks.
 *
 * Everything that ends up inside HTML is escaped here, because the anchor is
 * pasted straight into someone's email or document.
 */

/** Schemes worth pasting into a message. Anything else (javascript:, data:, file:) is refused. */
const ALLOWED = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export type LinkResult =
  | { ok: true; href: string; label: string; html: string; markdown: string; plain: string }
  | { ok: false; error: string };

/**
 * Validates `raw` as a link, adding https:// when it has no scheme.
 * Returns the normalised href, or an error worth showing.
 */
export function normaliseUrl(raw: string): { href: string } | { error: string } {
  let value = raw.trim();
  if (!value) return { error: 'Enter a link.' };

  // "scheme:" counts as a scheme only when what follows is not a port number,
  // so example.com:8080 and localhost:3000 still get https:// in front.
  const scheme = /^([a-z][a-z0-9+.-]*):(?!\d)/i.exec(value);
  let added = false;
  if (value.startsWith('//')) {
    value = `https:${value}`;
    added = true;
  } else if (!scheme) {
    value = `https://${value}`;
    added = true;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: 'That does not look like a link. Check it for spaces or typos.' };
  }
  // Chromium accepts "https://not a link" and keeps the host as not%20a%20link,
  // where Node throws; a space or escape in a host name is never a real site.
  if (/[\s%]/.test(url.hostname)) {
    return { error: 'That does not look like a link. Check it for spaces or typos.' };
  }
  if (!ALLOWED.has(url.protocol)) {
    return { error: 'Only http, https, mailto and tel links can be made clickable.' };
  }
  if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.hostname) {
    return { error: 'That link has no website in it.' };
  }
  // We guessed the scheme, so a bare word ("invoice") is far likelier a slip
  // than an intranet host. Typed with a scheme, it is taken at its word.
  if (added && !url.hostname.includes('.') && url.hostname !== 'localhost' && !url.hostname.startsWith('[')) {
    return { error: 'Add the full domain, for example example.com.' };
  }
  return { href: url.href };
}

/** The label used when none is given: the host and path, readable rather than percent-encoded. */
export function defaultLabel(href: string): string {
  const url = new URL(href);
  if (url.protocol === 'mailto:' || url.protocol === 'tel:') return safeDecode(url.pathname);
  const path = url.pathname === '/' ? '' : safeDecode(url.pathname);
  return url.host + path;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Markdown link text escapes its brackets and backslashes; the URL escapes its parentheses. */
function markdownLink(label: string, href: string): string {
  const text = label.replace(/[\\[\]]/g, (c) => `\\${c}`);
  const url = href.replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `[${text}](${url})`;
}

export function buildLink(rawUrl: string, rawLabel: string): LinkResult {
  const normalised = normaliseUrl(rawUrl);
  if ('error' in normalised) return { ok: false, error: normalised.error };

  const { href } = normalised;
  // Line breaks would turn one link into several lines of text in most editors.
  const given = rawLabel.replace(/\s+/g, ' ').trim();
  const label = given || defaultLabel(href);
  return {
    ok: true,
    href,
    label,
    html: `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`,
    markdown: markdownLink(label, href),
    // Without a label of their own, "example.com/x: https://example.com/x" says it twice.
    plain: given ? `${given}: ${href}` : href,
  };
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
