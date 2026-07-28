/**
 * Just enough PDF reading to check a file is a PDF and count its pages.
 *
 * The tools that hand a document to a hosted service only ever needed two facts
 * about it — is this really a PDF, and how many pages does it have — and a full
 * PDF library costs ~163 kB gzipped to answer them. This does it with no
 * dependencies by reading the page tree directly.
 *
 * It is deliberately not a parser. When the page tree cannot be read with
 * confidence the count comes back as `null` and the caller shows no page count,
 * rather than guessing at a number that might be wrong.
 */

/** The `%PDF-` header is allowed to sit behind some junk, but not much. */
const HEADER_SEARCH_BYTES = 1024;

/** Object streams are metadata, so a big one means we found something else. */
const MAX_OBJECT_STREAM_BYTES = 8 * 1024 * 1024;

/** Enough to cover the page tree of any real document. */
const MAX_OBJECT_STREAMS = 32;

/** How far either side of a `/Type /Pages` we will look for its dictionary. */
const MAX_DICT_BYTES = 1024 * 1024;

/** `%PDF-` */
const HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d];

/**
 * True when the bytes start with a PDF header. This is the fast rejection for
 * "you picked a .docx" — a file that passes here can still be damaged in ways
 * only the service will discover.
 */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, HEADER_SEARCH_BYTES + HEADER.length);
  outer: for (let start = 0; start + HEADER.length <= limit; start++) {
    for (let offset = 0; offset < HEADER.length; offset++) {
      if (bytes[start + offset] !== HEADER[offset]) {
        continue outer;
      }
    }
    return true;
  }
  return false;
}

/**
 * Reads the document's page count, or returns null when the page tree could not
 * be found. Not a validity check — call {@link looksLikePdf} first.
 */
export async function readPageCount(bytes: Uint8Array): Promise<number | null> {
  // Latin-1 maps every byte to one character, so string offsets stay byte
  // offsets and the binary stretches pass through without throwing.
  const text = new TextDecoder('latin1').decode(bytes);

  const direct = countInPageTree(text);
  if (direct !== null) {
    return direct;
  }

  // PDF 1.5+ can pack the page tree into a compressed object stream, where a
  // plain scan sees only deflate output. Inflate those and look again.
  let best: number | null = null;
  for (const chunk of await inflateObjectStreams(bytes, text)) {
    const count = countInPageTree(chunk);
    if (count !== null && (best === null || count > best)) {
      best = count;
    }
  }
  return best;
}

/**
 * The `/Count` of the root node of the page tree.
 *
 * A document has one `/Type /Pages` node per level of its page tree, each
 * carrying the number of pages beneath it, so the largest is the root's total.
 * `/Count` also appears on outline dictionaries with an unrelated meaning, so
 * each value is read from inside the `/Type /Pages` dictionary itself rather
 * than from the surrounding text.
 */
function countInPageTree(text: string): number | null {
  let best: number | null = null;

  for (const match of text.matchAll(/\/Type\s*\/Pages(?![a-zA-Z])/g)) {
    const dict = enclosingDict(text, match.index);
    if (!dict) {
      continue;
    }
    const count = directCount(text.slice(dict.start, dict.end));
    if (count !== null && (best === null || count > best)) {
      best = count;
    }
  }

  return best;
}

/**
 * The bounds of the dictionary containing `index`, found by balancing `<<` and
 * `>>` outwards from it.
 */
function enclosingDict(text: string, index: number): { start: number; end: number } | null {
  // A page tree node is small; scanning further than this means the file is not
  // shaped the way we assumed, and we would rather give up than walk the file.
  const floor = Math.max(1, index - MAX_DICT_BYTES);
  const ceiling = Math.min(text.length, index + MAX_DICT_BYTES);

  let depth = 0;
  let start = -1;
  for (let at = index; at >= floor; at--) {
    if (text[at] === '>' && text[at - 1] === '>') {
      depth++;
      at--;
    } else if (text[at] === '<' && text[at - 1] === '<') {
      if (depth === 0) {
        start = at - 1;
        break;
      }
      depth--;
      at--;
    }
  }
  if (start === -1) {
    return null;
  }

  depth = 0;
  for (let at = start; at + 1 < ceiling; at++) {
    if (text[at] === '<' && text[at + 1] === '<') {
      depth++;
      at++;
    } else if (text[at] === '>' && text[at + 1] === '>') {
      depth--;
      at++;
      if (depth === 0) {
        return { start, end: at + 1 };
      }
    }
  }
  return null;
}

/** The `/Count` belonging to this dictionary, ignoring any in nested ones. */
function directCount(dict: string): number | null {
  let depth = 0;
  for (let at = 0; at + 1 < dict.length; at++) {
    if (dict[at] === '<' && dict[at + 1] === '<') {
      depth++;
      at++;
      continue;
    }
    if (dict[at] === '>' && dict[at + 1] === '>') {
      depth--;
      at++;
      continue;
    }
    if (depth !== 1 || dict[at] !== '/') {
      continue;
    }
    const match = /^\/Count[\s]+(\d+)/.exec(dict.slice(at));
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
}

/**
 * Inflates every `/Type /ObjStm` stream in the file.
 *
 * Only object streams are touched — matching on the type keeps us away from the
 * image and font streams, which are the large ones and never hold a page tree.
 * Anything that fails to inflate is skipped: this is a best effort that either
 * improves the answer or leaves it alone.
 */
async function inflateObjectStreams(bytes: Uint8Array, text: string): Promise<string[]> {
  if (typeof DecompressionStream === 'undefined') {
    return [];
  }

  const chunks: string[] = [];
  for (const match of text.matchAll(/\/Type\s*\/ObjStm(?![a-zA-Z])/g)) {
    if (chunks.length >= MAX_OBJECT_STREAMS) {
      break;
    }
    const body = streamBodyAfter(text, match.index);
    if (!body) {
      continue;
    }
    const inflated = await inflate(bytes.subarray(body.start, body.end));
    if (inflated) {
      chunks.push(inflated);
    }
  }
  return chunks;
}

/** The byte range of the stream body following `index`, excluding the keywords. */
function streamBodyAfter(text: string, index: number): { start: number; end: number } | null {
  const keyword = text.indexOf('stream', index);
  if (keyword === -1) {
    return null;
  }
  // "stream" is followed by CRLF or LF, and nothing else.
  let start = keyword + 'stream'.length;
  if (text[start] === '\r') {
    start++;
  }
  if (text[start] === '\n') {
    start++;
  }

  // The declared /Length is often an indirect reference we cannot resolve
  // without the cross-reference table, so find the terminator instead.
  const end = text.indexOf('endstream', start);
  if (end === -1 || end - start > MAX_OBJECT_STREAM_BYTES) {
    return null;
  }
  return { start, end };
}

/** Zlib-inflates a block, trying a raw deflate stream if it has no header. */
async function inflate(block: Uint8Array): Promise<string | null> {
  for (const format of ['deflate', 'deflate-raw'] as const) {
    try {
      const stream = new Blob([block.slice()])
        .stream()
        .pipeThrough(new DecompressionStream(format));
      return new TextDecoder('latin1').decode(await new Response(stream).arrayBuffer());
    } catch {
      // Wrong format, or the block is not deflate at all — try the next one.
    }
  }
  return null;
}
