import { describe, expect, it } from 'vitest';

import { latin1, parseContentStream, spliceStream, toHexString } from './content-stream';

/**
 * The parser's job is to find operator boundaries exactly, because an edit is a
 * splice of the bytes between them. Getting a value slightly wrong shows up as
 * a box in the wrong place; getting a boundary wrong corrupts the page.
 */
function parse(source: string) {
  return parseContentStream(Uint8Array.from(source, (char) => char.charCodeAt(0) & 0xff));
}

function bytes(source: string): Uint8Array {
  return Uint8Array.from(source, (char) => char.charCodeAt(0) & 0xff);
}

describe('parseContentStream', () => {
  it('reads operands and the operator that closes them', () => {
    const ops = parse('1 0 0 1 60 760 Tm');
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('Tm');
    expect(ops[0].operands.map((o) => (o.kind === 'num' ? o.value : null))).toEqual([
      1, 0, 0, 1, 60, 760,
    ]);
  });

  it('points at the bytes the whole operation occupies', () => {
    const source = 'BT\n/F1 12 Tf\n(hi) Tj\nET';
    const ops = parse(source);
    const show = ops.find((op) => op.op === 'Tj');
    expect(source.slice(show!.start, show!.end)).toBe('(hi) Tj');
  });

  it('decodes the escapes a literal string may carry', () => {
    const ops = parse(String.raw`(a\)b\n\101\\ c) Tj`);
    const operand = ops[0].operands[0];
    expect(operand.kind).toBe('string');
    expect(operand.kind === 'string' ? latin1(operand.bytes) : '').toBe('a)b\nA\\ c');
  });

  it('keeps a nested parenthesis inside one string', () => {
    const ops = parse('((inner) still one) Tj');
    expect(ops).toHaveLength(1);
    const operand = ops[0].operands[0];
    expect(operand.kind === 'string' ? latin1(operand.bytes) : '').toBe('(inner) still one');
  });

  it('joins a string broken across lines with a backslash', () => {
    const ops = parse('(one\\\ntwo) Tj');
    const operand = ops[0].operands[0];
    expect(operand.kind === 'string' ? latin1(operand.bytes) : '').toBe('onetwo');
  });

  it('reads a hex string, padding a lone last digit with zero', () => {
    const ops = parse('<48690a> Tj <7> Tj');
    const first = ops[0].operands[0];
    const second = ops[1].operands[0];
    expect(first.kind === 'string' ? [...first.bytes] : []).toEqual([0x48, 0x69, 0x0a]);
    expect(second.kind === 'string' ? [...second.bytes] : []).toEqual([0x70]);
  });

  it('reads a TJ array of strings and kerning numbers', () => {
    const ops = parse('[(A) -250 (B)] TJ');
    const array = ops[0].operands[0];
    expect(array.kind).toBe('array');
    expect(array.kind === 'array' ? array.items.map((i) => i.kind) : []).toEqual([
      'string',
      'num',
      'string',
    ]);
  });

  it('skips a dictionary operand whole rather than reading into it', () => {
    const ops = parse('<</Type /Mask /S (Tj)>> gs 1 0 0 RG');
    expect(ops.map((op) => op.op)).toEqual(['gs', 'RG']);
  });

  it('does not mistake image data for operators', () => {
    // The bytes between ID and EI say "Tj" and open a parenthesis: both would
    // wreck the parse if they were tokenised.
    const ops = parse('q BI /W 2 /H 2 ID  Tj ( garbage EI Q');
    expect(ops.map((op) => op.op)).toEqual(['q', 'BI', 'Q']);
  });

  it('treats a name with an escape as the name it stands for', () => {
    const ops = parse('/A#20B Do');
    const name = ops[0].operands[0];
    expect(name.kind === 'name' ? name.value : '').toBe('A B');
  });

  it('ignores a comment to the end of the line', () => {
    const ops = parse('% (unclosed comment Tj\n1 g');
    expect(ops.map((op) => op.op)).toEqual(['g']);
  });

  it('ends rather than spins on a string nobody closed', () => {
    expect(parse('(never closed').length).toBe(0);
  });
});

describe('spliceStream', () => {
  it('leaves a stream that nothing edits byte for byte the same', () => {
    const source = bytes('BT /F1 12 Tf (hi) Tj ET');
    expect([...spliceStream(source, [])]).toEqual([...source]);
  });

  it('replaces exactly the range it is given', () => {
    const source = 'BT (old) Tj ET';
    const ops = parse(source);
    const show = ops.find((op) => op.op === 'Tj')!;
    const out = spliceStream(bytes(source), [
      { start: show.start, end: show.end, text: '[<6E6577>] TJ' },
    ]);
    expect(latin1(out)).toBe('BT [<6E6577>] TJ ET');
  });

  it('applies several edits without earlier ones shifting later ones', () => {
    const source = '(a) Tj (b) Tj (c) Tj';
    const shows = parse(source).filter((op) => op.op === 'Tj');
    const out = spliceStream(
      bytes(source),
      // Deliberately out of order: the splice has to sort them itself.
      [shows[2], shows[0]].map((op) => ({ start: op.start, end: op.end, text: '<> TJ' })),
    );
    expect(latin1(out)).toBe('<> TJ (b) Tj <> TJ');
  });

  it('refuses two edits that cover the same bytes', () => {
    expect(() =>
      spliceStream(bytes('(a) Tj'), [
        { start: 0, end: 6, text: 'x' },
        { start: 3, end: 6, text: 'y' },
      ]),
    ).toThrow(/same part/);
  });
});

describe('toHexString', () => {
  it('writes every byte as two digits, so none needs escaping', () => {
    expect(toHexString(Uint8Array.of(0, 0x28, 0x5c, 0xff))).toBe('<00285cff>');
  });
});
