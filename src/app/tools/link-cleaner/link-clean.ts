/**
 * Strips tracking parameters from links and unwraps redirect wrappers, without
 * ever requesting anything: every answer comes from the text of the link.
 *
 * The query string is edited as text rather than rebuilt through URL and
 * URLSearchParams, because those re-encode what they keep (a + becomes %20,
 * a bare origin gains a slash). A cleaned link should differ from the pasted
 * one only by what was removed.
 */
import { buildLink, escapeHtml } from '../hyperlink-generator/hyperlink';
import { REDIRECT_WRAPPERS, TRACKING_RULES, type TrackingRule } from './tracking-params';

export interface RemovedParam {
  name: string;
  value: string;
  /** Who adds it, from tracking-params.ts. */
  source: string;
}

export interface CleanedLink {
  original: string;
  cleaned: string;
  removed: RemovedParam[];
  /** The wrappers peeled off, outermost first, e.g. ["Google", "Outlook Safe Links"]. */
  unwrapped: string[];
  /** Names of the parameters left in place, so the visitor can see what was kept. */
  kept: string[];
}

export interface CleanResult {
  /** The input with every link replaced by its cleaned form. */
  text: string;
  links: CleanedLink[];
}

/** Wrappers can nest (Outlook around Google around the page); a few levels is plenty. */
const MAX_UNWRAP = 5;

/** Does `host` belong to `domain`? `name.*` means that name under any country domain. */
export function onHost(host: string, domain: string): boolean {
  if (domain.endsWith('.*')) {
    const label = domain.slice(0, -2).replace(/\./g, '\\.');
    return new RegExp(`(^|\\.)${label}\\.(?:[a-z]{2,3}|co\\.[a-z]{2}|com\\.[a-z]{2})$`).test(host);
  }
  return host === domain || host.endsWith(`.${domain}`);
}

function ruleFor(name: string, host: string): TrackingRule | undefined {
  const lower = name.toLowerCase();
  return TRACKING_RULES.find(
    (rule) =>
      (rule.names?.includes(lower) || (rule.prefix !== undefined && lower.startsWith(rule.prefix))) &&
      (!rule.hosts || rule.hosts.some((domain) => onHost(host, domain))),
  );
}

function parseHttp(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** The destination a redirect wrapper points at, or null when `url` is not one. */
export function unwrapOnce(url: URL): { name: string; target: string } | null {
  const path = url.pathname.replace(/\/$/, '');
  for (const wrapper of REDIRECT_WRAPPERS) {
    if (!wrapper.hosts.some((domain) => onHost(url.hostname, domain))) continue;
    if (wrapper.path !== undefined && wrapper.path.replace(/\/$/, '') !== path) continue;
    for (const param of wrapper.params) {
      const value = url.searchParams.get(param)?.trim();
      // Only a real web address counts, so a wrapper can never hand back a
      // javascript: link, and google.com/url?q=cats stays a search.
      if (value && parseHttp(value)) return { name: wrapper.name, target: value };
    }
  }
  return null;
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
}

/**
 * Cleans one link. Returns null for anything that is not an http or https
 * URL, which is left exactly as it was.
 */
export function cleanUrl(raw: string): CleanedLink | null {
  let current = raw;
  let url = parseHttp(current);
  if (!url) return null;

  const unwrapped: string[] = [];
  for (let depth = 0; depth < MAX_UNWRAP; depth++) {
    const next = unwrapOnce(url);
    if (!next) break;
    unwrapped.push(next.name);
    current = next.target;
    url = parseHttp(current)!;
  }

  const hashAt = current.indexOf('#');
  const beforeHash = hashAt < 0 ? current : current.slice(0, hashAt);
  const hash = hashAt < 0 ? '' : current.slice(hashAt);
  const queryAt = beforeHash.indexOf('?');
  if (queryAt < 0) {
    return { original: raw, cleaned: current, removed: [], unwrapped, kept: [] };
  }

  const base = beforeHash.slice(0, queryAt);
  const host = url.hostname;
  const removed: RemovedParam[] = [];
  const keptPairs: string[] = [];
  const kept: string[] = [];
  for (const pair of beforeHash.slice(queryAt + 1).split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const name = safeDecode(eq < 0 ? pair : pair.slice(0, eq));
    const rule = ruleFor(name, host);
    if (rule) {
      removed.push({ name, value: eq < 0 ? '' : safeDecode(pair.slice(eq + 1)), source: rule.source });
    } else {
      keptPairs.push(pair);
      kept.push(name);
    }
  }

  const cleaned = removed.length
    ? `${base}${keptPairs.length ? `?${keptPairs.join('&')}` : ''}${hash}`
    : current;
  return { original: raw, cleaned, removed, unwrapped, kept };
}

/** Links in running text: an http(s) URL up to the next space, quote or angle bracket. */
const LINK = /https?:\/\/[^\s<>"'`]+/gi;

/**
 * Trims what is almost certainly punctuation after a link rather than part of
 * it: "see https://example.com/a." or "(https://example.com/a)". A closing
 * bracket stays when the link opened one, as Wikipedia's links do.
 */
export function trimTrailing(link: string): string {
  let end = link.length;
  const count = (text: string, char: string) => text.split(char).length - 1;
  while (end > 0) {
    const last = link[end - 1];
    const body = link.slice(0, end);
    if ('.,;:!?*'.includes(last)) {
      end--;
    } else if (last === ')' && count(body, ')') > count(body, '(')) {
      end--;
    } else if (last === ']' && count(body, ']') > count(body, '[')) {
      end--;
    } else {
      break;
    }
  }
  return link.slice(0, end);
}

/** Finds every link in `text`, cleans each one, and puts the clean form back in place. */
export function cleanText(text: string): CleanResult {
  const links: CleanedLink[] = [];
  const out = text.replace(LINK, (match) => {
    const link = trimTrailing(match);
    const result = cleanUrl(link);
    if (!result) return match;
    links.push(result);
    return result.cleaned + match.slice(link.length);
  });
  return { text: out, links };
}

/** A segment of cleaned text: plain words, or a link to make clickable. */
export type Segment = { kind: 'text'; text: string } | { kind: 'link'; href: string };

/**
 * Splits the cleaned text into words and links, so it can be copied as rich
 * text with every link clickable.
 */
export function segments(text: string): Segment[] {
  const parts: Segment[] = [];
  let at = 0;
  for (const match of text.matchAll(LINK)) {
    const link = trimTrailing(match[0]);
    if (!parseHttp(link)) continue;
    if (match.index > at) parts.push({ kind: 'text', text: text.slice(at, match.index) });
    parts.push({ kind: 'link', href: link });
    at = match.index + link.length;
  }
  if (at < text.length) parts.push({ kind: 'text', text: text.slice(at) });
  return parts;
}

/**
 * The cleaned text as HTML with every link an anchor, for "copy as clickable
 * links". Each link shows its site and path as its words, built by the
 * Hyperlink Generator's own buildLink so both tools escape identically.
 */
export function richHtml(text: string): string {
  return segments(text)
    .map((part) => {
      if (part.kind === 'text') return escapeHtml(part.text).replace(/\r?\n/g, '<br>');
      const link = buildLink(part.href, '');
      return link.ok ? link.html : escapeHtml(part.href);
    })
    .join('');
}
