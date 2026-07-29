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

describe('Rust', () => {
  it('emits serde structs with Option/Vec and rename for camelCase keys', () => {
    const out = gen(SAMPLE, 'rust');
    const flat = out.replace(/[ \t]+/g, ' ');
    expect(out).toContain('use serde::{Deserialize, Serialize};');
    expect(out).toContain('#[derive(Debug, Clone, Serialize, Deserialize)]');
    expect(out).toContain('pub struct Root {');
    expect(flat).toContain('pub id: i64,');
    expect(flat).toContain('pub tags: Vec<String>,');
    // `pinned` is missing from the first post, so it becomes an Option with a default.
    expect(flat).toContain('pub pinned: Option<bool>,');
    expect(out).toContain('skip_serializing_if = "Option::is_none"');
  });

  it('snake_cases keys and renames, escaping keywords with r#', () => {
    const out = gen({ userName: 'Ada', type: 1 }, 'rust');
    expect(out).toContain('pub user_name: String,');
    expect(out).toContain('rename = "userName"');
    // `type` is a keyword, so the identifier is raw.
    expect(out).toContain('pub r#type: i64,');
  });
});

describe('Kotlin', () => {
  it('emits data classes with nullable optionals defaulting to null', () => {
    const out = gen(SAMPLE, 'kotlin');
    expect(out).toContain('data class Root(');
    expect(out).toContain('val id: Long,');
    expect(out).toContain('val tags: List<String>,');
    expect(out).toContain('val pinned: Boolean? = null,');
    expect(out).toContain('data class Address(');
  });

  it('back-tick escapes keys that are not bare identifiers', () => {
    const out = gen({ 'first-name': 'Ada' }, 'kotlin');
    expect(out).toContain('val `first-name`: String,');
  });
});

describe('Java', () => {
  it('emits records with boxed optionals and a List import', () => {
    const out = gen(SAMPLE, 'java');
    expect(out).toContain('import java.util.List;');
    expect(out).toContain('public record Root(');
    expect(out).toContain('long id');
    expect(out).toContain('List<String> tags');
    // Optional primitives must be boxed so they can be null.
    expect(out).toContain('Boolean pinned');
    expect(out).toContain('public record Address(');
  });
});

describe('JSON Schema', () => {
  it('emits a draft schema with $defs, $ref and required', () => {
    const schema = JSON.parse(gen(SAMPLE, 'jsonschema'));
    expect(schema.$schema).toContain('json-schema.org');
    expect(schema.$ref).toBe('#/$defs/Root');
    expect(schema.$defs.Root.properties.id).toEqual({ type: 'integer' });
    expect(schema.$defs.Root.properties.tags).toEqual({ type: 'array', items: { type: 'string' } });
    expect(schema.$defs.Root.properties.address).toEqual({ $ref: '#/$defs/Address' });
    // `pinned` is optional, so it is absent from Post's required list.
    expect(schema.$defs.Post.required).not.toContain('pinned');
    expect(schema.$defs.Post.required).toContain('title');
  });
});

describe('Pydantic', () => {
  it('emits v2 models with BaseModel and optional defaults', () => {
    const out = gen(SAMPLE, 'pydantic');
    expect(out).toContain('from __future__ import annotations');
    expect(out).toContain('from pydantic import BaseModel');
    expect(out).toContain('class Root(BaseModel):');
    expect(out).toContain('id: int');
    expect(out).toContain('pinned: Optional[bool] = None');
    // Nested model declared before the model that references it.
    expect(out.indexOf('class Address(BaseModel):')).toBeLessThan(out.indexOf('class Root(BaseModel):'));
  });

  it('adds a Field alias when a key is not a valid identifier', () => {
    const out = gen({ 'first-name': 'Ada' }, 'pydantic');
    expect(out).toContain('from pydantic import BaseModel, Field');
    expect(out).toContain("first_name: str = Field(alias='first-name')");
  });
});

describe('non-object roots', () => {
  it('emits a type alias when the JSON is a bare array', () => {
    expect(gen([1, 2, 3], 'typescript')).toContain('export type Root = number[];');
    expect(gen([1, 2, 3], 'python')).toContain('Root = List[int]');
    expect(gen([1, 2, 3], 'go')).toContain('type Root = []int64');
    expect(gen([1, 2, 3], 'zod')).toContain('export const RootSchema = z.array(z.number().int());');
    expect(gen([1, 2, 3], 'rust')).toContain('pub type Root = Vec<i64>;');
    expect(gen([1, 2, 3], 'kotlin')).toContain('typealias Root = List<Long>');
    expect(gen([1, 2, 3], 'jsonschema')).toContain('"type": "array"');
  });
});
