import { describe, expect, it } from 'vitest';

import { Language, generate } from './type-generator';

/**
 * The three inference passes are shared across every language, so these tests
 * focus on the emit step: given a representative JSON value, does each language
 * produce source with the right types, optionality and nullability?
 */

const SAMPLE = {
  id: 128,
  name: 'Ada',
  active: true,
  score: 99.5,
  nickname: null,
  tags: ['engineer'],
  address: { city: 'London', postcode: 'W1J 9BW' },
  posts: [
    { title: 'Notes', views: 12 },
    { title: 'On the Engine', views: 40, pinned: true },
  ],
};

function gen(json: unknown, language: Language, rootName = 'Root'): string {
  return generate(json, { language, rootName });
}

describe('TypeScript', () => {
  it('emits interfaces with optional and nullable fields', () => {
    const out = gen(SAMPLE, 'typescript');
    expect(out).toContain('export interface Root {');
    expect(out).toContain('id: number;');
    expect(out).toContain('nickname: null;');
    expect(out).toContain('tags: string[];');
    // `pinned` is missing from the first post, so it is optional.
    expect(out).toContain('pinned?: boolean;');
  });
});

describe('Python', () => {
  it('emits dataclasses with the right imports and field order', () => {
    const out = gen(SAMPLE, 'python');
    expect(out).toContain('from dataclasses import dataclass');
    expect(out).toContain('from typing import');
    expect(out).toContain('@dataclass');
    expect(out).toContain('class Root:');
    expect(out).toContain('id: int');
    expect(out).toContain('score: float');
    expect(out).toContain('active: bool');
    // Optional fields carry a default so they must be a valid dataclass.
    expect(out).toContain('pinned: Optional[bool] = None');
  });

  it('declares a nested type before the type that references it', () => {
    const out = gen(SAMPLE, 'python');
    expect(out.indexOf('class Address:')).toBeLessThan(out.indexOf('class Root:'));
  });

  it('sanitises keys that are not valid identifiers', () => {
    const out = gen({ 'first-name': 'Ada', class: 1 }, 'python');
    expect(out).toContain('first_name: str');
    // `class` is a keyword, so it is suffixed.
    expect(out).toContain('class_: int');
  });
});

describe('Go', () => {
  it('emits structs with json tags and pointer/omitempty for optionals', () => {
    const out = gen(SAMPLE, 'go');
    const flat = out.replace(/[ \t]+/g, ' ');
    expect(out).toContain('package main');
    expect(out).toContain('type Root struct {');
    expect(flat).toContain('Id int64 `json:"id"`');
    expect(flat).toContain('Pinned *bool `json:"pinned,omitempty"`');
    expect(out).toContain('type Address struct {');
  });
});

describe('Zod', () => {
  it('emits schemas in dependency order with inferred types', () => {
    const out = gen(SAMPLE, 'zod');
    expect(out).toContain("import { z } from 'zod';");
    expect(out).toContain('export const RootSchema = z.object({');
    expect(out).toContain('id: z.number().int(),');
    expect(out).toContain('nickname: z.null(),');
    expect(out).toContain('pinned: z.boolean().optional(),');
    expect(out).toContain('export type Root = z.infer<typeof RootSchema>;');
    // A referenced schema must be declared before it is used.
    expect(out.indexOf('AddressSchema =')).toBeLessThan(out.indexOf('address: AddressSchema'));
  });
});

describe('non-object roots', () => {
  it('emits a type alias when the JSON is a bare array', () => {
    expect(gen([1, 2, 3], 'typescript')).toContain('export type Root = number[];');
    expect(gen([1, 2, 3], 'python')).toContain('Root = List[int]');
    expect(gen([1, 2, 3], 'go')).toContain('type Root = []int64');
    expect(gen([1, 2, 3], 'zod')).toContain('export const RootSchema = z.array(z.number().int());');
  });
});
