import { describe, expect, it } from 'vitest';

import { convert } from './toml-convert';

const CARGO = `[package]
name = "demo"
version = "0.1.0"
released = 1979-05-27

[dependencies]
serde = { version = "1.0", features = ["derive"] }

[[bin]]
name = "cli"
`;

describe('convert', () => {
  it('turns TOML into JSON and back without losing a field', () => {
    const json = convert(CARGO, 'toml', 'json');
    expect(json.problem).toBeNull();
    expect(JSON.parse(json.output)).toEqual({
      package: { name: 'demo', version: '0.1.0', released: '1979-05-27' },
      dependencies: { serde: { version: '1.0', features: ['derive'] } },
      bin: [{ name: 'cli' }],
    });
    const back = convert(json.output, 'json', 'toml');
    expect(back.output).toContain('[[bin]]');
    expect(back.output).toContain('features = [ "derive" ]');
  });

  it('keeps an integer past 2^53 exactly', () => {
    const json = convert('id = 9007199254740993', 'toml', 'json');
    expect(json.output).toContain('9007199254740993');
    expect(convert('id = 9007199254740993', 'toml', 'yaml').output).toBe('id: 9007199254740993\n');
  });

  it('names the keys TOML has to drop, instead of dropping them silently', () => {
    const result = convert('{"a": 1, "b": null, "c": {"d": null}}', 'json', 'toml');
    expect(result.output).toBe('a = 1\n\n[c]\n');
    expect(result.warnings).toEqual(['TOML has no null, so "b", "c.d" were left out.']);
  });

  it('refuses a null TOML cannot write, and a document with no top-level table', () => {
    expect(convert('{"list": [1, null]}', 'json', 'toml').problem?.message).toBe(
      'TOML arrays cannot hold null, and list[1] is null.',
    );
    expect(convert('[1, 2]', 'json', 'toml').problem?.message).toMatch(/table at the top level/);
  });

  it('warns when inf or nan become null in JSON', () => {
    const result = convert('a = inf\nb = nan\nc = 1', 'toml', 'json');
    expect(JSON.parse(result.output)).toEqual({ a: null, b: null, c: 1 });
    expect(result.warnings).toEqual(['JSON has no inf or nan, so 2 values were written as null.']);
  });

  it('says where each format is broken', () => {
    expect(convert('a = 1\nb = \n', 'toml', 'json').problem).toEqual({
      message: 'Invalid value',
      line: 2,
      column: 5,
    });
    expect(convert('a: 1\na: 2\n', 'yaml', 'json').problem).toEqual({
      message: 'Map keys must be unique',
      line: 2,
      column: 1,
    });
    expect(convert('{\n  "a": 1,\n}', 'json', 'toml').problem?.line).toBe(3);
  });

  it('YAML to TOML', () => {
    expect(convert('server:\n  port: 8080\n', 'yaml', 'toml').output).toBe('[server]\nport = 8080\n');
  });
});
