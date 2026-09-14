import { describe, expect, it } from 'vitest';

import { convert, detect, type Options } from './json-csv-codec';

const options: Options = { delimiter: ',', typed: true };

describe('detect', () => {
  it('reads a leading bracket or brace as JSON', () => {
    expect(detect('  [1]')).toBe('to-csv');
    expect(detect('{"a":1}')).toBe('to-csv');
    expect(detect('a,b\n1,2')).toBe('to-json');
  });
});

describe('JSON to CSV', () => {
  it('flattens nested objects into dot columns, in first-seen order', () => {
    const json = '[{"name":"Ada","address":{"city":"London"}},{"name":"Bob","age":41}]';
    const { output, rows, columns, error } = convert(json, 'auto', options);
    expect(error).toBeNull();
    expect(output).toBe('name,address.city,age\nAda,London,\nBob,,41');
    expect([rows, columns]).toEqual([2, 3]);
  });

  it('quotes what needs quoting and keeps arrays as JSON in the cell', () => {
    const json = '[{"note":"a, \\"quoted\\" one","tags":["x","y"]}]';
    expect(convert(json, 'to-csv', options).output).toBe(
      'note,tags\n"a, ""quoted"" one","[""x"",""y""]"',
    );
  });

  it('takes one object as one row, and a list of scalars as a value column', () => {
    expect(convert('{"a":1}', 'to-csv', options).output).toBe('a\n1');
    expect(convert('[1,2]', 'to-csv', options).output).toBe('value\n1\n2');
  });

  it('writes an array of arrays as-is with the chosen delimiter', () => {
    expect(convert('[[1,2],[3,4]]', 'to-csv', { ...options, delimiter: ';' }).output).toBe(
      '1;2\n3;4',
    );
  });

  it('reports bad JSON instead of guessing', () => {
    expect(convert('{"a":1,}', 'to-csv', options).error).toMatch(/Not valid JSON/);
  });
});

describe('CSV to JSON', () => {
  it('types values, folds dot columns back into objects and sniffs the delimiter', () => {
    const csv = 'name;age;address.city;active\nAda;36;London;true\nBob;41;;false';
    const { output, rows, columns } = convert(csv, 'auto', options);
    expect(JSON.parse(output)).toEqual([
      { name: 'Ada', age: 36, address: { city: 'London' }, active: true },
      { name: 'Bob', age: 41, address: { city: '' }, active: false },
    ]);
    expect([rows, columns]).toEqual([2, 4]);
  });

  it('keeps everything as strings when typing is off', () => {
    const { output } = convert('id,ok\n7,true', 'to-json', { ...options, typed: false });
    expect(JSON.parse(output)).toEqual([{ id: '7', ok: 'true' }]);
  });

  it('fills blank and duplicate headers rather than losing columns', () => {
    const { output } = convert('a,,a\n1,2,3', 'to-json', options);
    expect(JSON.parse(output)).toEqual([{ a: 1, B: 2, 'a (2)': 3 }]);
  });
});
