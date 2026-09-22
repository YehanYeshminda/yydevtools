import { describe, expect, it } from 'vitest';

import { draftToText, flatten, parseDraft, type Block } from './draft';

const rich = (text: string) => parseDraft(text, { infer: true });
const plain = (text: string) => parseDraft(text, { infer: false });

/** The blocks of one kind, so a test can say what it means. */
function only<K extends Block['kind']>(blocks: Block[], kind: K) {
  return blocks.filter((block): block is Extract<Block, { kind: K }> => block.kind === kind);
}

describe('parseDraft — structure', () => {
  it('splits paragraphs on blank lines', () => {
    const { blocks } = rich('First thought.\n\nSecond thought.');
    expect(blocks).toHaveLength(2);
    expect(flatten(only(blocks, 'paragraph')[1].spans)).toBe('Second thought.');
  });

  it('keeps a hard-wrapped paragraph as one block', () => {
    // breaks: true — a single newline is a line break inside the paragraph,
    // not the start of a new one. People hard-wrap emails constantly.
    const { blocks } = rich('Thanks,\nAda Lovelace');
    expect(blocks).toHaveLength(1);
    expect(flatten(only(blocks, 'paragraph')[0].spans)).toBe('Thanks,\nAda Lovelace');
  });

  it('reads bullets and numbers as lists', () => {
    const bullets = rich('- one\n- two').blocks;
    expect(only(bullets, 'list')[0]).toMatchObject({ ordered: false });
    expect(only(bullets, 'list')[0].items.map(flatten)).toEqual(['one', 'two']);

    const numbers = rich('1. first\n2. second').blocks;
    expect(only(numbers, 'list')[0].ordered).toBe(true);
  });

  it('carries bold, italic and links through as marks', () => {
    const { blocks } = rich('A **bold** word, an *italic* one, and a [link](https://example.com).');
    const spans = only(blocks, 'paragraph')[0].spans;
    expect(spans.find((span) => span.text === 'bold')?.bold).toBe(true);
    expect(spans.find((span) => span.text === 'italic')?.italic).toBe(true);
    expect(spans.find((span) => span.text === 'link')?.href).toBe('https://example.com');
  });

  it('caps heading depth at three', () => {
    // There is no h4 in any of the four output formats, and silently dropping
    // the text would be worse than promoting it.
    const { blocks } = rich('###### deep');
    expect(only(blocks, 'heading')[0].level).toBe(3);
  });

  it('turns a link alone on its line into a button', () => {
    const { blocks } = rich('Hi there,\n\n[Read the report](https://example.com/r)\n\nThanks');
    expect(only(blocks, 'button')[0]).toMatchObject({
      text: 'Read the report',
      href: 'https://example.com/r',
    });
  });

  it('leaves a link with words around it as a paragraph', () => {
    const { blocks } = rich('Please [read this](https://example.com) today.');
    expect(only(blocks, 'button')).toHaveLength(0);
    expect(only(blocks, 'paragraph')).toHaveLength(1);
  });
});

describe('parseDraft — the subject', () => {
  it('takes an explicit Subject: line and removes it from the body', () => {
    const { subject, blocks } = rich('Subject: Quarterly update\n\nHi team,\n\nAll is well.');
    expect(subject).toBe('Quarterly update');
    expect(blocks.some((block) => flatten((block as never)['spans'] ?? []).includes('Subject')))
      .toBe(false);
  });

  it('honours Subject: even with inference switched off', () => {
    // Someone who typed the word meant it, whatever else they turned off.
    expect(plain('Subject: Still works\n\nBody text.').subject).toBe('Still works');
  });

  it('lifts a leading heading into the subject', () => {
    const { subject, blocks } = rich('# Release 4.2 is out\n\nIt ships today.');
    expect(subject).toBe('Release 4.2 is out');
    expect(only(blocks, 'heading')).toHaveLength(0);
  });

  it('lifts a short bare first line', () => {
    expect(rich('Lunch on Friday\n\nAre you free at one?').subject).toBe('Lunch on Friday');
  });

  it('leaves a first line that reads as a sentence alone', () => {
    const { subject, blocks } = rich('We should meet about this soon.\n\nDoes Friday work?');
    expect(subject).toBeNull();
    expect(blocks).toHaveLength(2);
  });

  it('never eats the only block', () => {
    // The guard that matters most: without it the shortest possible input
    // becomes a subject with an empty body.
    const { subject, blocks } = rich('Running late');
    expect(subject).toBeNull();
    expect(blocks).toHaveLength(1);
  });

  it('does not mistake a greeting for a subject', () => {
    const { subject, blocks } = rich('Hi Ada\n\nHope you are well.');
    expect(subject).toBeNull();
    expect(only(blocks, 'paragraph')[0].role).toBe('greeting');
  });
});

describe('parseDraft — email anatomy', () => {
  it('tags the greeting and the sign-off', () => {
    const { blocks } = rich('Hi Ada,\n\nThe report is attached.\n\nKind regards,\nGrace');
    const paragraphs = only(blocks, 'paragraph');
    expect(paragraphs[0].role).toBe('greeting');
    expect(paragraphs[paragraphs.length - 1].role).toBe('signoff');
    expect(paragraphs[1].role).toBeUndefined();
  });

  it('does not tag one paragraph as both ends of the email', () => {
    const { blocks } = rich('Hi Ada,');
    expect(only(blocks, 'paragraph')[0].role).toBe('greeting');
  });

  it('tags nothing when inference is off', () => {
    const { blocks } = plain('Hi Ada,\n\nBody.\n\nThanks,\nGrace');
    expect(only(blocks, 'paragraph').every((p) => p.role === undefined)).toBe(true);
  });
});

describe('parseDraft — plain mode', () => {
  it('interprets not one character', () => {
    const { blocks } = plain('# not a heading\n\n- not a bullet\n\n**not bold**');
    expect(blocks).toHaveLength(3);
    expect(only(blocks, 'heading')).toHaveLength(0);
    expect(only(blocks, 'list')).toHaveLength(0);
    expect(flatten(only(blocks, 'paragraph')[2].spans)).toBe('**not bold**');
  });

  it('drops blank input', () => {
    expect(plain('   \n\n  \t ').blocks).toEqual([]);
    expect(rich('').blocks).toEqual([]);
  });
});

describe('parseDraft — raw HTML is text, not markup', () => {
  it('keeps a tag as the characters that were typed', () => {
    // A trust boundary: the preview is sandboxed, but the .html and .eml this
    // produces are opened in a mail client. Markup someone pasted is content.
    const { blocks } = rich('<script>alert(1)</script>');
    expect(flatten(only(blocks, 'paragraph')[0].spans)).toContain('<script>');
  });

  it('keeps an inline tag inline', () => {
    const { blocks } = rich('Before <b>middle</b> after');
    expect(flatten(only(blocks, 'paragraph')[0].spans)).toBe('Before <b>middle</b> after');
  });
});

describe('draftToText', () => {
  it('writes the readable half of the email', () => {
    const text = draftToText(rich('Hi Ada,\n\n- one\n- two\n\n[Open](https://example.com/x)'));
    expect(text).toContain('Hi Ada,');
    expect(text).toContain('* one');
    // A plain-text part cannot hide a URL behind words, so it shows both.
    expect(text).toContain('Open: https://example.com/x');
  });

  it('numbers an ordered list', () => {
    expect(draftToText(rich('1. first\n2. second'))).toContain('2. second');
  });
});
