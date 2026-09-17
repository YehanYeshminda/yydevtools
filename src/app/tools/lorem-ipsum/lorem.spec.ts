import { MAX_COUNT, clampCount, generate, measure, render, type LoremOptions } from './lorem';

function options(overrides: Partial<LoremOptions> = {}): LoremOptions {
  return { unit: 'paragraphs', count: 3, format: 'text', classic: true, seed: 1, ...overrides };
}

describe('lorem', () => {
  it('returns one block per paragraph', () => {
    expect(generate(options({ count: 5 })).length).toBe(5);
  });

  it('returns one block per list item', () => {
    expect(generate(options({ unit: 'list', count: 7 })).length).toBe(7);
  });

  it('returns exactly the number of words asked for', () => {
    const [text] = generate(options({ unit: 'words', count: 42 }));
    expect(text.split(' ').length).toBe(42);
  });

  it('returns exactly the number of sentences asked for', () => {
    const [text] = generate(options({ unit: 'sentences', count: 9 }));
    expect(text.split('. ').length).toBe(9);
  });

  it('opens with the traditional phrase when asked', () => {
    const [first] = generate(options({ classic: true }));
    expect(first.startsWith('Lorem ipsum dolor sit amet, consectetur adipiscing elit')).toBe(true);
  });

  it('opens somewhere else when not', () => {
    const [first] = generate(options({ classic: false }));
    expect(first.startsWith('Lorem ipsum dolor')).toBe(false);
  });

  // The classic opener is the one phrase a reader knows by heart, so the
  // sentence builder must not drop a second comma into it.
  it('puts no extra comma in the opening sentence', () => {
    const [first] = generate(options({ unit: 'sentences', count: 1, classic: true }));
    expect(first.split(',').length - 1).toBe(1);
  });

  it('truncates the opener rather than overrunning a short word count', () => {
    const [text] = generate(options({ unit: 'words', count: 3, classic: true }));
    expect(text).toBe('lorem ipsum dolor');
  });

  // The whole point of the seed: the component regenerates on every control
  // change, and without this the passage would rewrite itself as you type.
  it('gives the same text for the same seed', () => {
    expect(generate(options({ seed: 7 }))).toEqual(generate(options({ seed: 7 })));
  });

  it('gives different text for a different seed', () => {
    expect(generate(options({ seed: 7 }))).not.toEqual(generate(options({ seed: 8 })));
  });

  it('ends every paragraph with a full stop', () => {
    for (const block of generate(options({ count: 4 }))) {
      expect(block.endsWith('.')).toBe(true);
    }
  });

  it('leaves the full stop off a list item', () => {
    for (const item of generate(options({ unit: 'list', count: 4 }))) {
      expect(item.endsWith('.')).toBe(false);
    }
  });

  describe('clampCount', () => {
    it('keeps a sensible count', () => {
      expect(clampCount('paragraphs', 12)).toBe(12);
    });

    it('floors at one', () => {
      expect(clampCount('paragraphs', 0)).toBe(1);
      expect(clampCount('paragraphs', -5)).toBe(1);
    });

    it('caps at the per-unit maximum', () => {
      expect(clampCount('words', 99999)).toBe(MAX_COUNT.words);
      expect(clampCount('paragraphs', 99999)).toBe(MAX_COUNT.paragraphs);
    });

    // An emptied number field reads as NaN, which would otherwise propagate
    // into the loop bound and hang the tab.
    it('treats a blank field as one', () => {
      expect(clampCount('paragraphs', Number.NaN)).toBe(1);
    });
  });

  describe('render', () => {
    it('separates plain paragraphs with a blank line', () => {
      expect(render(['one.', 'two.'], 'paragraphs', 'text')).toBe('one.\n\ntwo.');
    });

    it('wraps paragraphs in p tags', () => {
      expect(render(['one.', 'two.'], 'paragraphs', 'html')).toBe('<p>one.</p>\n<p>two.</p>');
    });

    it('wraps list items in a ul', () => {
      expect(render(['one', 'two'], 'list', 'html')).toBe(
        '<ul>\n  <li>one</li>\n  <li>two</li>\n</ul>',
      );
    });

    it('writes markdown list items as dashes', () => {
      expect(render(['one', 'two'], 'list', 'markdown')).toBe('- one\n- two');
    });

    it('escapes markup on its way into HTML', () => {
      expect(render(['a <b> & c'], 'paragraphs', 'html')).toBe('<p>a &lt;b&gt; &amp; c</p>');
    });
  });

  describe('measure', () => {
    it('counts words and characters', () => {
      expect(measure('one two three')).toEqual({ words: 3, characters: 13 });
    });

    it('counts nothing in an empty string', () => {
      expect(measure('')).toEqual({ words: 0, characters: 0 });
    });
  });
});
