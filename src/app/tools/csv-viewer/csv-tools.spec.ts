import { describe, expect, it } from 'vitest';

import {
  columnLabel,
  describeDelimiter,
  filterRows,
  findRagged,
  normaliseHeaders,
  summarise,
  summariseColumn,
  toObjects,
} from './csv-tools';

describe('describeDelimiter', () => {
  it('names the delimiters people actually meet', () => {
    expect(describeDelimiter(',')).toBe('comma');
    expect(describeDelimiter(';')).toBe('semicolon');
    expect(describeDelimiter('\t')).toBe('tab');
    expect(describeDelimiter('|')).toBe('pipe');
  });

  it('reports when nothing was detected', () => {
    expect(describeDelimiter('')).toBe('none detected');
  });

  it('quotes anything unexpected rather than hiding it', () => {
    expect(describeDelimiter('^')).toBe('"^"');
  });
});

describe('summariseColumn', () => {
  it('calls a column of numbers a number column', () => {
    expect(summariseColumn('price', ['1', '2.5', '-3', '1e4']).type).toBe('number');
  });

  it('accepts thousands separators as numeric', () => {
    expect(summariseColumn('total', ['1,234', '9,999.50']).type).toBe('number');
  });

  it('recognises ISO and written dates', () => {
    expect(summariseColumn('when', ['2026-08-31', '2026-01-01']).type).toBe('date');
    expect(summariseColumn('when', ['31/08/2026', '1/1/26']).type).toBe('date');
  });

  it('recognises booleans in their usual spellings', () => {
    expect(summariseColumn('active', ['true', 'FALSE', 'yes', 'n']).type).toBe('boolean');
  });

  it('falls back to text when a single value does not fit', () => {
    // One "N/A" in a price column makes it text, which is the honest answer and
    // usually the thing worth knowing.
    expect(summariseColumn('price', ['1', '2', 'N/A']).type).toBe('text');
  });

  it('ignores blanks when deciding the type, but counts them', () => {
    const summary = summariseColumn('price', ['1', '', '  ', '3']);
    expect(summary.type).toBe('number');
    expect(summary.blanks).toBe(2);
  });

  it('calls an entirely blank column empty', () => {
    expect(summariseColumn('unused', ['', '   ', '']).type).toBe('empty');
  });

  it('counts distinct values, which is how an id column stands out', () => {
    expect(summariseColumn('id', ['a', 'b', 'c', 'a']).distinct).toBe(3);
  });
});

describe('summarise', () => {
  it('describes every column of a table', () => {
    const result = summarise(
      ['id', 'name', 'price'],
      [
        ['1', 'Widget', '9.99'],
        ['2', 'Gadget', '19.50'],
      ],
    );
    expect(result.map((c) => c.type)).toEqual(['number', 'text', 'number']);
  });

  it('handles rows shorter than the header, which real files contain', () => {
    const result = summarise(['a', 'b', 'c'], [['1', '2']]);
    expect(result[2].blanks).toBe(1);
    expect(result[2].type).toBe('empty');
  });
});

describe('filterRows', () => {
  const rows = [
    ['1', 'Widget', 'in stock'],
    ['2', 'Gadget', 'sold out'],
    ['3', 'Doohickey', 'in stock'],
  ];

  it('matches on any cell, not just the first', () => {
    expect(filterRows(rows, 'sold')).toHaveLength(1);
  });

  it('is case-insensitive', () => {
    expect(filterRows(rows, 'WIDGET')).toHaveLength(1);
  });

  it('returns everything for an empty query', () => {
    expect(filterRows(rows, '   ')).toHaveLength(3);
  });

  it('returns nothing when there is no match', () => {
    expect(filterRows(rows, 'zzz')).toHaveLength(0);
  });

  it('survives ragged rows with missing cells', () => {
    expect(() => filterRows([['a'], []] as string[][], 'a')).not.toThrow();
    expect(filterRows([['a'], []] as string[][], 'a')).toHaveLength(1);
  });
});

describe('findRagged', () => {
  it('finds a row with too many cells', () => {
    // The classic corruption: an unquoted delimiter inside a value.
    const ragged = findRagged([['1', '2', '3'], ['4', '5', '6', '7']], 3);
    expect(ragged).toEqual([{ row: 3, cells: 4 }]);
  });

  it('finds a row with too few cells', () => {
    expect(findRagged([['1', '2', '3'], ['4']], 3)).toEqual([{ row: 3, cells: 1 }]);
  });

  it('returns nothing for a regular file', () => {
    expect(findRagged([['1', '2'], ['3', '4']], 2)).toEqual([]);
  });

  it('numbers rows as a person reading the file would', () => {
    // offset 1 accounts for the header line, so the first data row is line 2.
    expect(findRagged([['a']], 2, 1)[0].row).toBe(2);
    // Without a header row, the first row is line 1.
    expect(findRagged([['a']], 2, 0)[0].row).toBe(1);
  });

  it('stops after the limit rather than listing thousands', () => {
    const rows = Array.from({ length: 50 }, () => ['1']);
    expect(findRagged(rows, 3)).toHaveLength(5);
  });
});

describe('columnLabel', () => {
  it('uses spreadsheet lettering so it matches Excel', () => {
    expect(columnLabel(0)).toBe('A');
    expect(columnLabel(25)).toBe('Z');
    expect(columnLabel(26)).toBe('AA');
    expect(columnLabel(27)).toBe('AB');
    expect(columnLabel(51)).toBe('AZ');
    expect(columnLabel(52)).toBe('BA');
  });
});

describe('normaliseHeaders', () => {
  it('leaves good headers alone', () => {
    expect(normaliseHeaders(['id', 'name'])).toEqual(['id', 'name']);
  });

  it('names blank columns by their spreadsheet letter', () => {
    expect(normaliseHeaders(['id', '', 'name'])).toEqual(['id', 'B', 'name']);
  });

  it('disambiguates duplicates rather than letting one overwrite the other', () => {
    expect(normaliseHeaders(['name', 'name', 'name'])).toEqual([
      'name',
      'name (2)',
      'name (3)',
    ]);
  });

  it('trims surrounding whitespace', () => {
    expect(normaliseHeaders(['  id  '])).toEqual(['id']);
  });
});

describe('toObjects', () => {
  it('zips headers and rows into objects', () => {
    expect(toObjects(['a', 'b'], [['1', '2']])).toEqual([{ a: '1', b: '2' }]);
  });

  it('fills missing cells with empty strings', () => {
    expect(toObjects(['a', 'b', 'c'], [['1']])).toEqual([{ a: '1', b: '', c: '' }]);
  });
});
