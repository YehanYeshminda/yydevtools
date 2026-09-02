/**
 * The logic behind the XML viewer.
 *
 * There is deliberately no XML library here. Every browser ships a conforming
 * XML parser in `DOMParser` and an XPath engine in `document.evaluate`, both of
 * them faster and better tested than anything that could be added to the bundle.
 * What is missing from those APIs is the awkward part — turning a parse failure
 * into a message with a line number, and a Document into something a template
 * can render — and that is what lives here.
 *
 * The functions that touch a Document take one as an argument rather than
 * reaching for a global, so the parts worth testing can be tested and the page
 * can still be prerendered on a server that has no DOM at all.
 */

/** Where a parse failed, as far as the browser was willing to say. */
export interface XmlError {
  /** The parser's description, with the location prefix removed when found. */
  message: string;
  line: number | null;
  column: number | null;
}

export type XmlNodeKind = 'element' | 'text' | 'comment' | 'cdata' | 'processing';

export interface XmlAttribute {
  name: string;
  value: string;
}

/** A node in the tree the template renders. */
export interface XmlNode {
  kind: XmlNodeKind;
  /** Tag name for elements; a short label for everything else. */
  name: string;
  attributes: XmlAttribute[];
  children: XmlNode[];
  /** Text content, for leaf kinds and for elements whose only child is text. */
  value: string | null;
  /** Depth from the root, so the template can indent without recursion. */
  depth: number;
}

export interface XmlStats {
  elements: number;
  attributes: number;
  maxDepth: number;
  /** Distinct element names, which is a quick sense of how varied a document is. */
  distinctNames: number;
}

/**
 * Pull a line and column out of a parser's error text.
 *
 * Every engine words this differently and none of it is specified, so this
 * recognises the common shapes rather than assuming one:
 *   Chrome    "error on line 4 at column 9: Opening and ending tag mismatch"
 *   Firefox   "…not well-formed…" plus a separate line/column in the document
 *   libxml    "3:12: FATAL: …"
 * When nothing matches, the message is returned intact with no location, which
 * is still more useful than discarding it.
 */
export function extractErrorLocation(raw: string): XmlError {
  // Browsers wrap the real message in boilerplate meant for their own error
  // page — a heading before it and, in Chrome, a sentence after it about
  // rendering the document up to the failure. Both would otherwise end up in
  // the middle of our status line.
  const text = raw
    .replace(/\s+/g, ' ')
    .replace(/^This page contains the following errors:\s*/i, '')
    .replace(/\s*Below is a rendering of the page up to the first error\.?\s*$/i, '')
    .trim();

  const onLine = text.match(/(?:error )?on line (\d+) at column (\d+):?\s*(.*)$/i);
  if (onLine) {
    return {
      message: onLine[3] || 'The document is not well-formed.',
      line: Number(onLine[1]),
      column: Number(onLine[2]),
    };
  }

  const prefixed = text.match(/^(\d+):(\d+):\s*(?:FATAL:\s*)?(.*)$/i);
  if (prefixed) {
    return {
      message: prefixed[3] || 'The document is not well-formed.',
      line: Number(prefixed[1]),
      column: Number(prefixed[2]),
    };
  }

  const lineOnly = text.match(/line (\d+)/i);
  return {
    message: text || 'The document is not well-formed.',
    line: lineOnly ? Number(lineOnly[1]) : null,
    column: null,
  };
}

/**
 * The parse error in a parsed Document, or null when it parsed cleanly.
 *
 * `DOMParser` never throws for XML. It returns a document whose root is a
 * `parsererror` element instead, which is easy to miss and is why malformed XML
 * so often appears to "work" right up until something reads the wrong node.
 */
export function findParseError(doc: Document): XmlError | null {
  const error = doc.getElementsByTagName('parsererror')[0];
  if (!error) {
    return null;
  }
  return extractErrorLocation(error.textContent ?? '');
}

const KINDS: Record<number, XmlNodeKind> = {
  1: 'element',
  3: 'text',
  4: 'cdata',
  7: 'processing',
  8: 'comment',
};

/** True for a text node that is only layout whitespace between elements. */
function isIgnorableText(node: Node): boolean {
  return node.nodeType === 3 && (node.nodeValue ?? '').trim() === '';
}

/**
 * Convert a DOM node into the flattened shape the template renders.
 *
 * Whitespace-only text between elements is dropped: it exists because the
 * document was indented, and showing it would bury the structure the viewer is
 * meant to reveal. An element whose only child is text collapses into a single
 * row — `<title>Hello</title>` reads better on one line than as a parent with a
 * mysterious child.
 */
export function toNode(node: Node, depth = 0): XmlNode | null {
  const kind = KINDS[node.nodeType];
  if (!kind || isIgnorableText(node)) {
    return null;
  }

  if (kind !== 'element') {
    return {
      kind,
      name: kind === 'comment' ? 'comment' : kind === 'cdata' ? 'CDATA' : node.nodeName,
      attributes: [],
      children: [],
      value: (node.nodeValue ?? '').trim(),
      depth,
    };
  }

  const element = node as Element;
  const attributes: XmlAttribute[] = Array.from(element.attributes ?? []).map((attr) => ({
    name: attr.name,
    value: attr.value,
  }));

  const children = Array.from(element.childNodes)
    .map((child) => toNode(child, depth + 1))
    .filter((child): child is XmlNode => child !== null);

  const onlyText = children.length === 1 && children[0].kind === 'text';

  return {
    kind: 'element',
    name: element.tagName,
    attributes,
    children: onlyText ? [] : children,
    value: onlyText ? children[0].value : null,
    depth,
  };
}

/** Counts for the summary line, walked once over the tree. */
export function statsFor(root: XmlNode | null): XmlStats {
  const stats: XmlStats = { elements: 0, attributes: 0, maxDepth: 0, distinctNames: 0 };
  if (!root) {
    return stats;
  }
  const names = new Set<string>();
  const walk = (node: XmlNode) => {
    if (node.kind === 'element') {
      stats.elements++;
      stats.attributes += node.attributes.length;
      names.add(node.name);
    }
    stats.maxDepth = Math.max(stats.maxDepth, node.depth);
    node.children.forEach(walk);
  };
  walk(root);
  stats.distinctNames = names.size;
  return stats;
}

/** Every element in the tree, flattened — the search index for the filter box. */
export function flatten(root: XmlNode | null): XmlNode[] {
  if (!root) {
    return [];
  }
  const out: XmlNode[] = [];
  const walk = (node: XmlNode) => {
    out.push(node);
    node.children.forEach(walk);
  };
  walk(root);
  return out;
}

/**
 * Does this node match a plain-text filter? Tag name, attribute names and
 * values, and text content all count, because a reader looking for "price" may
 * mean an element, an attribute or a value and should not have to say which.
 */
export function matches(node: XmlNode, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return true;
  }
  if (node.name.toLowerCase().includes(needle)) {
    return true;
  }
  if ((node.value ?? '').toLowerCase().includes(needle)) {
    return true;
  }
  return node.attributes.some(
    (attr) =>
      attr.name.toLowerCase().includes(needle) || attr.value.toLowerCase().includes(needle),
  );
}
