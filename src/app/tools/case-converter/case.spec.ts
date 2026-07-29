import { describe, expect, it } from 'vitest';

import { convert, words } from './case';

describe('words', () => {
  it('splits camelCase', () => {
    expect(words('helloWorldFoo')).toEqual(['hello', 'world', 'foo']);
  });

  it('splits PascalCase and acronyms', () => {
    expect(words('HTTPServerError')).toEqual(['http', 'server', 'error']);
  });

  it('splits snake, kebab and spaces uniformly', () => {
    expect(words('hello_world')).toEqual(['hello', 'world']);
    expect(words('hello-world')).toEqual(['hello', 'world']);
    expect(words('  hello   world  ')).toEqual(['hello', 'world']);
  });

  it('separates letters from digits', () => {
    expect(words('version2Point0')).toEqual(['version', '2', 'point', '0']);
  });

  it('returns an empty array for punctuation-only input', () => {
    expect(words('---')).toEqual([]);
  });
});

describe('convert', () => {
  const sample = 'Hello world example';

  it.each([
    ['camel', 'helloWorldExample'],
    ['pascal', 'HelloWorldExample'],
    ['snake', 'hello_world_example'],
    ['constant', 'HELLO_WORLD_EXAMPLE'],
    ['kebab', 'hello-world-example'],
    ['title', 'Hello World Example'],
    ['sentence', 'Hello world example'],
    ['lower', 'hello world example'],
    ['upper', 'HELLO WORLD EXAMPLE'],
    ['slug', 'hello-world-example'],
  ] as const)('converts to %s', (kind, expected) => {
    expect(convert(sample, kind)).toBe(expected);
  });

  it('round-trips a messy identifier into every case', () => {
    expect(convert('getUserByID', 'kebab')).toBe('get-user-by-id');
    expect(convert('user_profile_v2', 'camel')).toBe('userProfileV2');
  });

  it('produces an empty string for empty input', () => {
    expect(convert('', 'camel')).toBe('');
  });
});
