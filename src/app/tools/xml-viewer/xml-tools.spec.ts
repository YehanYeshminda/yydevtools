import { describe, expect, it } from 'vitest';

import {
  extractErrorLocation,
  findParseError,
  flatten,
  matches,
  statsFor,
  toNode,
  type XmlNode,
} from './xml-tools';

/** Parses with the DOM parser jsdom provides, the same API the browser uses. */
function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function tree(xml: string): XmlNode | null {
  const doc = parse(xml);
  return doc.documentElement ? toNode(doc.documentElement) : null;
}

describe('extractErrorLocation', () => {
  it('reads the Chrome wording', () => {
    const result = extractErrorLocation(
      'error on line 4 at column 9: Opening and ending tag mismatch: a line 3 and b',
    );
    expect(result).toEqual({
      message: 'Opening and ending tag mismatch: a line 3 and b',
      line: 4,
      column: 9,
    });
  });

  it('reads the libxml prefix form', () => {
    expect(extractErrorLocation('3:12: FATAL: Premature end of data in tag note')).toEqual({
      message: 'Premature end of data in tag note',
      line: 3,
      column: 12,
    });
  });

  it('keeps the message when only a line is mentioned', () => {
    const result = extractErrorLocation('not well-formed (invalid token) at line 7');
    expect(result.line).toBe(7);
    expect(result.column).toBeNull();
    expect(result.message).toContain('not well-formed');
  });

  it('keeps an unrecognised message rather than discarding it', () => {
    const result = extractErrorLocation('Something went wrong');
    expect(result).toEqual({ message: 'Something went wrong', line: null, column: null });
  });

  it('collapses the whitespace browsers pad the message with', () => {
    const result = extractErrorLocation('\n  error on line 2 at column 3:   Bad thing  \n');
    expect(result.message).toBe('Bad thing');
    expect(result.line).toBe(2);
  });

  it('strips the browser boilerplate wrapped around the real message', () => {
    // Chrome's parsererror carries a heading before the message and a sentence
    // after it, both meant for its own error page.
    const result = extractErrorLocation(
      'This page contains the following errors:\n' +
        'error on line 3 at column 5: Opening and ending tag mismatch: b line 2 and a\n' +
        'Below is a rendering of the page up to the first error.',
    );
    expect(result).toEqual({
      message: 'Opening and ending tag mismatch: b line 2 and a',
      line: 3,
      column: 5,
    });
  });

  it('falls back to a sentence when the parser gives only a location', () => {
    expect(extractErrorLocation('error on line 1 at column 1:').message).toBe(
      'The document is not well-formed.',
    );
  });
});

describe('findParseError', () => {
  it('returns null for a well-formed document', () => {
    expect(findParseError(parse('<a><b/></a>'))).toBeNull();
  });

  it('finds the error a mismatched tag produces', () => {
    // DOMParser does not throw — it hands back a document containing
    // <parsererror>, which is exactly the trap this guards against.
    const error = findParseError(parse('<a><b></a>'));
    expect(error).not.toBeNull();
    expect(error?.message.length).toBeGreaterThan(0);
  });
});

describe('toNode', () => {
  it('maps elements, attributes and nesting', () => {
    const root = tree('<catalog kind="books"><book id="1"><title>Dune</title></book></catalog>');

    expect(root?.name).toBe('catalog');
    expect(root?.attributes).toEqual([{ name: 'kind', value: 'books' }]);
    expect(root?.children).toHaveLength(1);

    const book = root?.children[0];
    expect(book?.name).toBe('book');
    expect(book?.attributes).toEqual([{ name: 'id', value: '1' }]);
    expect(book?.depth).toBe(1);
  });

  it('collapses an element whose only child is text', () => {
    const root = tree('<title>Dune</title>');
    expect(root?.value).toBe('Dune');
    expect(root?.children).toHaveLength(0);
  });

  it('drops whitespace-only text between elements', () => {
    // Indentation would otherwise appear as text nodes and bury the structure.
    const root = tree('<a>\n  <b/>\n  <c/>\n</a>');
    expect(root?.children.map((child) => child.name)).toEqual(['b', 'c']);
  });

  it('keeps comments and CDATA, which carry real content', () => {
    const root = tree('<a><!-- note --><![CDATA[raw < text]]></a>');
    const kinds = root?.children.map((child) => child.kind);
    expect(kinds).toContain('comment');
    expect(kinds).toContain('cdata');
    expect(root?.children.find((c) => c.kind === 'cdata')?.value).toBe('raw < text');
  });

  it('records depth so the template can indent without recursing', () => {
    const root = tree('<a><b><c><d/></c></b></a>');
    const depths = flatten(root).map((node) => node.depth);
    expect(depths).toEqual([0, 1, 2, 3]);
  });
});

describe('statsFor', () => {
  it('counts elements, attributes, depth and distinct names', () => {
    const stats = statsFor(
      tree('<a x="1"><b y="2"/><b y="3"><c/></b></a>'),
    );
    expect(stats).toEqual({ elements: 4, attributes: 3, maxDepth: 2, distinctNames: 3 });
  });

  it('returns zeroes for nothing', () => {
    expect(statsFor(null)).toEqual({
      elements: 0,
      attributes: 0,
      maxDepth: 0,
      distinctNames: 0,
    });
  });
});

describe('matches', () => {
  const node = tree('<book isbn="978-0441013593">Dune</book>') as XmlNode;

  it('matches on the tag name', () => {
    expect(matches(node, 'boo')).toBe(true);
  });

  it('matches on an attribute name and on its value', () => {
    expect(matches(node, 'isbn')).toBe(true);
    expect(matches(node, '0441')).toBe(true);
  });

  it('matches on text content', () => {
    expect(matches(node, 'dune')).toBe(true);
  });

  it('is case-insensitive and ignores surrounding spaces', () => {
    expect(matches(node, '  DUNE ')).toBe(true);
  });

  it('matches everything on an empty query', () => {
    expect(matches(node, '   ')).toBe(true);
  });

  it('rejects what is genuinely absent', () => {
    expect(matches(node, 'zzz')).toBe(false);
  });
});
