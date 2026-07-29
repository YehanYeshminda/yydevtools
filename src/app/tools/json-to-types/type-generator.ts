/**
 * Turns a parsed JSON value into typed source for one of several languages.
 *
 * The work happens in three passes so each stays simple:
 *   1. `infer`    — describe a single value as a Shape.
 *   2. `merge`    — fold the shapes of array elements together, so a list of
 *                   objects produces one type whose fields are optional where
 *                   they were missing from some elements.
 *   3. `collect` + emit — name every object shape, then print it.
 *
 * The three passes are language-agnostic; only the final emit step differs per
 * language. Kept free of Angular so the generation is testable on its own.
 */

export type Language =
  | 'typescript'
  | 'csharp'
  | 'python'
  | 'go'
  | 'zod'
  | 'rust'
  | 'kotlin'
  | 'java'
  | 'jsonschema'
  | 'pydantic';

type Primitive = 'string' | 'integer' | 'number' | 'boolean';

export type Shape =
  /** Nothing seen yet — the identity value for `merge`. */
  | { kind: 'never' }
  | { kind: 'any' }
  | { kind: 'null' }
  | { kind: 'primitive'; name: Primitive }
  | { kind: 'array'; element: Shape }
  | { kind: 'object'; fields: Map<string, Field> }
  /** A shape that was also seen as null. */
  | { kind: 'nullable'; inner: Shape };

export interface Field {
  shape: Shape;
  /** True when some object of this type lacked the key entirely. */
  optional: boolean;
}

/** An object shape that has been given a name, ready to print. */
interface NamedType {
  name: string;
  fields: Map<string, Field>;
}

// --- Pass 1: describe one value ------------------------------------------

export function infer(value: unknown): Shape {
  if (value === null) {
    return { kind: 'null' };
  }
  if (Array.isArray(value)) {
    // An empty array tells us nothing about its element type.
    const element = value.map(infer).reduce(merge, { kind: 'never' } as Shape);
    return { kind: 'array', element };
  }
  switch (typeof value) {
    case 'string':
      return { kind: 'primitive', name: 'string' };
    case 'boolean':
      return { kind: 'primitive', name: 'boolean' };
    case 'number':
      return { kind: 'primitive', name: Number.isInteger(value) ? 'integer' : 'number' };
    case 'object': {
      const fields = new Map<string, Field>();
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        fields.set(key, { shape: infer(item), optional: false });
      }
      return { kind: 'object', fields };
    }
    default:
      return { kind: 'any' };
  }
}

// --- Pass 2: fold shapes together ----------------------------------------

export function merge(a: Shape, b: Shape): Shape {
  if (a.kind === 'never') return b;
  if (b.kind === 'never') return a;
  if (a.kind === 'any' || b.kind === 'any') return { kind: 'any' };

  // null combined with anything makes that thing nullable.
  if (a.kind === 'null' && b.kind === 'null') return a;
  if (a.kind === 'null') return nullable(b);
  if (b.kind === 'null') return nullable(a);
  if (a.kind === 'nullable' || b.kind === 'nullable') {
    return nullable(merge(unwrap(a), unwrap(b)));
  }

  if (a.kind === 'primitive' && b.kind === 'primitive') {
    if (a.name === b.name) return a;
    // A field holding both 1 and 1.5 is a number, not an int.
    const numeric = new Set<Primitive>(['integer', 'number']);
    if (numeric.has(a.name) && numeric.has(b.name)) {
      return { kind: 'primitive', name: 'number' };
    }
    return { kind: 'any' };
  }

  if (a.kind === 'array' && b.kind === 'array') {
    return { kind: 'array', element: merge(a.element, b.element) };
  }

  if (a.kind === 'object' && b.kind === 'object') {
    const fields = new Map<string, Field>();
    for (const [key, field] of a.fields) {
      const other = b.fields.get(key);
      fields.set(key, {
        shape: other ? merge(field.shape, other.shape) : field.shape,
        // Missing from the other object, so it cannot be required.
        optional: field.optional || !other,
      });
    }
    for (const [key, field] of b.fields) {
      if (!a.fields.has(key)) {
        fields.set(key, { shape: field.shape, optional: true });
      }
    }
    return { kind: 'object', fields };
  }

  // Genuinely mixed (e.g. string and object) — nothing useful to say.
  return { kind: 'any' };
}

function nullable(shape: Shape): Shape {
  if (shape.kind === 'nullable' || shape.kind === 'null') return shape;
  if (shape.kind === 'never') return { kind: 'null' };
  return { kind: 'nullable', inner: shape };
}

function unwrap(shape: Shape): Shape {
  return shape.kind === 'nullable' ? shape.inner : shape;
}

// --- Pass 3: naming ------------------------------------------------------

const CS_RESERVED = new Set([
  'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked',
  'class', 'const', 'continue', 'decimal', 'default', 'delegate', 'do', 'double', 'else',
  'enum', 'event', 'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for',
  'foreach', 'goto', 'if', 'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock',
  'long', 'namespace', 'new', 'null', 'object', 'operator', 'out', 'override', 'params',
  'private', 'protected', 'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed', 'short',
  'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch', 'this', 'throw', 'true',
  'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort', 'using', 'virtual',
  'void', 'volatile', 'while',
]);

/** "user_addresses" / "user-addresses" / "user addresses" -> "UserAddresses" */
function pascalCase(raw: string): string {
  const parts = raw.split(/[^A-Za-z0-9]+/).flatMap((part) =>
    // Split camelCase runs too, so "userName" keeps its word boundary.
    part.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' '),
  );
  const name = parts
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  if (name === '') return 'Item';
  // An identifier cannot start with a digit.
  return /^[0-9]/.test(name) ? `Type${name}` : name;
}

/** Best-effort singular, for naming the element type of an array field. */
function singular(name: string): string {
  if (/ies$/i.test(name)) return `${name.slice(0, -3)}y`;
  if (/(s|sh|ch|x|z)es$/i.test(name)) return name.slice(0, -2);
  if (/ss$/i.test(name)) return name;
  if (/s$/i.test(name)) return name.slice(0, -1);
  return name;
}

/**
 * Walks the tree naming every object shape, deduplicating structurally
 * identical ones so the same nested object does not produce two interfaces.
 * Returns the types in declaration order (root first).
 */
function collect(root: Shape, rootName: string): { types: NamedType[]; bySignature: Map<string, string> } {
  const types: NamedType[] = [];
  const bySignature = new Map<string, string>();
  const used = new Set<string>();

  function uniqueName(preferred: string): string {
    let name = preferred;
    let n = 2;
    while (used.has(name)) {
      name = `${preferred}${n++}`;
    }
    used.add(name);
    return name;
  }

  function visit(shape: Shape, preferredName: string): void {
    switch (shape.kind) {
      case 'object': {
        const sig = signatureOf(shape);
        if (bySignature.has(sig)) return;
        const name = uniqueName(pascalCase(preferredName));
        bySignature.set(sig, name);
        // Reserve the slot before recursing so nested types print after this one.
        const named: NamedType = { name, fields: shape.fields };
        types.push(named);
        for (const [key, field] of shape.fields) {
          visit(field.shape, key);
        }
        return;
      }
      case 'array':
        visit(shape.element, singular(preferredName));
        return;
      case 'nullable':
        visit(shape.inner, preferredName);
        return;
      default:
    }
  }

  visit(root, rootName);
  return { types, bySignature };
}

// --- Emit ----------------------------------------------------------------

export interface GenerateOptions {
  language: Language;
  /** Name for the root type. */
  rootName: string;
}

export function generate(json: unknown, options: GenerateOptions): string {
  const shape = infer(json);
  const rootName = pascalCase(options.rootName || 'Root');

  // A top-level array of objects should name its element type, not "Root[]".
  const { types, bySignature } = collect(shape, rootName);

  if (types.length === 0) {
    // No objects anywhere — describe the value as an alias instead.
    return emitAlias(shape, rootName, options.language, bySignature);
  }

  switch (options.language) {
    case 'typescript':
      return emitTypeScript(types, bySignature);
    case 'csharp':
      return emitCSharp(types, bySignature);
    case 'python':
      return emitPython(types, bySignature);
    case 'go':
      return emitGo(types, bySignature);
    case 'zod':
      return emitZod(types, bySignature);
    case 'rust':
      return emitRust(types, bySignature);
    case 'kotlin':
      return emitKotlin(types, bySignature);
    case 'java':
      return emitJava(types, bySignature);
    case 'jsonschema':
      return emitJsonSchema(types, bySignature, rootName);
    case 'pydantic':
      return emitPydantic(types, bySignature);
  }
}

/** When the JSON holds no object anywhere, there is no type to name — emit an alias. */
function emitAlias(
  shape: Shape,
  rootName: string,
  language: Language,
  names: Map<string, string>,
): string {
  switch (language) {
    case 'typescript':
      return `export type ${rootName} = ${tsType(shape, names)};\n`;
    case 'python':
      return `${rootName} = ${pyType(shape, names)}\n`;
    case 'go':
      return `type ${rootName} = ${goType(shape, names)}\n`;
    case 'zod':
      return `import { z } from 'zod';\n\nexport const ${rootName}Schema = ${zodType(shape, names)};\n`;
    case 'rust':
      return `pub type ${rootName} = ${rustType(shape, names)};\n`;
    case 'kotlin':
      return `typealias ${rootName} = ${kotlinType(shape, names)}\n`;
    case 'java':
      return `// The JSON is a ${javaType(shape, names)}, not an object — there is no record to generate.\n`;
    case 'pydantic':
      return `${rootName} = ${pyType(shape, names)}\n`;
    case 'jsonschema':
      return `${JSON.stringify(
        { $schema: 'https://json-schema.org/draft/2020-12/schema', ...schemaFor(shape, names) },
        null,
        2,
      )}\n`;
    case 'csharp':
      return `// The JSON is a ${csType(shape, names)}, not an object — there is no class to generate.\n`;
  }
}

/**
 * Reorders collected types so every type appears after the types it references.
 * TypeScript interfaces, C# classes and Go structs may reference a type declared
 * later, but Python dataclasses and Zod `const` schemas cannot — they need their
 * dependencies defined first.
 */
function dependenciesFirst(types: NamedType[], names: Map<string, string>): NamedType[] {
  const byName = new Map(types.map((type) => [type.name, type]));
  const ordered: NamedType[] = [];
  const seen = new Set<string>();

  function referencedNames(shape: Shape, into: Set<string>): void {
    switch (shape.kind) {
      case 'object': {
        const name = names.get(signatureOf(shape));
        if (name) into.add(name);
        return;
      }
      case 'array':
        return referencedNames(shape.element, into);
      case 'nullable':
        return referencedNames(shape.inner, into);
      default:
    }
  }

  function visit(type: NamedType): void {
    if (seen.has(type.name)) return;
    seen.add(type.name);
    const refs = new Set<string>();
    for (const [, field] of type.fields) {
      referencedNames(field.shape, refs);
    }
    for (const ref of refs) {
      const dep = byName.get(ref);
      if (dep && dep !== type) visit(dep);
    }
    ordered.push(type);
  }

  for (const type of types) {
    visit(type);
  }
  return ordered;
}

/**
 * A structural fingerprint. Two object shapes with the same signature get one
 * shared generated type, and emitted references look their name up by it.
 */
function signatureOf(shape: Shape): string {
  switch (shape.kind) {
    case 'object':
      return `{${[...shape.fields]
        .map(([key, f]) => `${key}${f.optional ? '?' : ''}:${signatureOf(f.shape)}`)
        .sort()
        .join(',')}}`;
    case 'array':
      return `[${signatureOf(shape.element)}]`;
    case 'nullable':
      return `${signatureOf(shape.inner)}|null`;
    case 'primitive':
      return shape.name;
    default:
      return shape.kind;
  }
}

// --- TypeScript ---

function tsType(shape: Shape, names: Map<string, string>): string {
  switch (shape.kind) {
    case 'object':
      return names.get(signatureOf(shape)) ?? 'Record<string, unknown>';
    case 'array': {
      const element = tsType(shape.element, names);
      // `(A | null)[]` needs the parentheses; `A[]` does not.
      return /[|\s]/.test(element) ? `(${element})[]` : `${element}[]`;
    }
    case 'nullable':
      return `${tsType(shape.inner, names)} | null`;
    case 'primitive':
      return shape.name === 'integer' ? 'number' : shape.name;
    case 'null':
      return 'null';
    case 'never':
      return 'never';
    default:
      return 'unknown';
  }
}

/** Reserved words are legal as property names, so only shape matters here. */
function tsPropertyName(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function emitTypeScript(types: NamedType[], names: Map<string, string>): string {
  return types
    .map((type) => {
      if (type.fields.size === 0) {
        return `export interface ${type.name} {}`;
      }
      const body = [...type.fields]
        .map(([key, field]) => {
          const optional = field.optional ? '?' : '';
          return `  ${tsPropertyName(key)}${optional}: ${tsType(field.shape, names)};`;
        })
        .join('\n');
      return `export interface ${type.name} {\n${body}\n}`;
    })
    .join('\n\n')
    .concat('\n');
}

// --- C# ---

function csType(shape: Shape, names: Map<string, string>): string {
  switch (shape.kind) {
    case 'object':
      return names.get(signatureOf(shape)) ?? 'object';
    case 'array':
      return `List<${csType(shape.element, names)}>`;
    case 'nullable':
      return `${csType(shape.inner, names)}?`;
    case 'primitive':
      switch (shape.name) {
        case 'integer':
          return 'int';
        case 'number':
          return 'double';
        case 'boolean':
          return 'bool';
        default:
          return 'string';
      }
    case 'null':
      return 'object?';
    default:
      return 'object';
  }
}

function csPropertyName(key: string, typeName: string): string {
  let name = pascalCase(key);
  // A property may not have the same name as its containing type.
  if (name === typeName) {
    name = `${name}Value`;
  }
  return CS_RESERVED.has(name) ? `@${name}` : name;
}

function emitCSharp(types: NamedType[], names: Map<string, string>): string {
  const classes = types
    .map((type) => {
      if (type.fields.size === 0) {
        return `public class ${type.name}\n{\n}`;
      }
      const body = [...type.fields]
        .map(([key, field]) => {
          // Optional keys become nullable. Required reference types are left
          // plain, which matches what the common JSON-to-C# generators emit —
          // under <Nullable>enable</Nullable> those will want an initialiser
          // or `required`, which is a project-level choice, not ours.
          const base = csType(field.shape, names);
          const csharp = field.optional && !base.endsWith('?') ? `${base}?` : base;
          return (
            `    [JsonPropertyName("${key.replace(/["\\]/g, '\\$&')}")]\n` +
            `    public ${csharp} ${csPropertyName(key, type.name)} { get; set; }`
          );
        })
        .join('\n\n');
      return `public class ${type.name}\n{\n${body}\n}`;
    })
    .join('\n\n');

  return `using System.Collections.Generic;\nusing System.Text.Json.Serialization;\n\n${classes}\n`;
}

// --- Python (dataclasses) ---

const PY_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
  'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
  'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
  'try', 'while', 'with', 'yield', 'match', 'case',
]);

function pyType(shape: Shape, names: Map<string, string>): string {
  switch (shape.kind) {
    case 'object':
      return names.get(signatureOf(shape)) ?? 'dict';
    case 'array':
      return `List[${pyType(shape.element, names)}]`;
    case 'nullable':
      return `Optional[${pyType(shape.inner, names)}]`;
    case 'primitive':
      switch (shape.name) {
        case 'integer':
          return 'int';
        case 'number':
          return 'float';
        case 'boolean':
          return 'bool';
        default:
          return 'str';
      }
    case 'null':
      return 'Optional[Any]';
    default:
      return 'Any';
  }
}

/** A JSON key made into a valid Python identifier for a dataclass field. */
function pyFieldName(key: string): string {
  let name = key.replace(/[^A-Za-z0-9_]/g, '_');
  if (name === '' || /^[0-9]/.test(name)) {
    name = `field_${name}`;
  }
  return PY_KEYWORDS.has(name) ? `${name}_` : name;
}

function emitPython(types: NamedType[], names: Map<string, string>): string {
  const ordered = dependenciesFirst(types, names);

  const classes = ordered.map((type) => {
    if (type.fields.size === 0) {
      return `@dataclass\nclass ${type.name}:\n    pass`;
    }
    // Dataclass fields without a default must precede those with one, so the
    // optional fields (which default to None) are emitted last.
    const entries = [...type.fields];
    const required = entries.filter(([, field]) => !field.optional && !isNullable(field.shape));
    const optional = entries.filter(([, field]) => field.optional || isNullable(field.shape));

    const lines = [
      ...required.map(([key, field]) => `    ${pyFieldName(key)}: ${pyType(field.shape, names)}`),
      ...optional.map(([key, field]) => {
        const annotation = field.optional
          ? `Optional[${pyType(unwrap(field.shape), names)}]`
          : pyType(field.shape, names);
        return `    ${pyFieldName(key)}: ${annotation} = None`;
      }),
    ];
    return `@dataclass\nclass ${type.name}:\n${lines.join('\n')}`;
  });

  const body = classes.join('\n\n\n');
  const typing = ['Any', 'List', 'Optional'].filter((name) =>
    new RegExp(`\\b${name}\\b`).test(body),
  );
  const imports = [
    'from dataclasses import dataclass',
    ...(typing.length ? [`from typing import ${typing.join(', ')}`] : []),
  ].join('\n');

  return `${imports}\n\n\n${body}\n`;
}

function isNullable(shape: Shape): boolean {
  return shape.kind === 'nullable' || shape.kind === 'null';
}

// --- Go (structs) ---

function goType(shape: Shape, names: Map<string, string>): string {
  switch (shape.kind) {
    case 'object':
      return names.get(signatureOf(shape)) ?? 'map[string]interface{}';
    case 'array':
      return `[]${goType(shape.element, names)}`;
    case 'nullable':
      return `*${goType(shape.inner, names)}`;
    case 'primitive':
      switch (shape.name) {
        case 'integer':
          return 'int64';
        case 'number':
          return 'float64';
        case 'boolean':
          return 'bool';
        default:
          return 'string';
      }
    case 'null':
      return 'interface{}';
    default:
      return 'interface{}';
  }
}

function emitGo(types: NamedType[], names: Map<string, string>): string {
  const structs = types.map((type) => {
    if (type.fields.size === 0) {
      return `type ${type.name} struct {\n}`;
    }
    const rows = [...type.fields].map(([key, field]) => {
      // Optional fields become pointers with omitempty so an absent key stays nil.
      const base = goType(field.shape, names);
      const goName = pascalCase(key);
      const pointer = field.optional && !base.startsWith('*') && !base.startsWith('[]');
      const goFieldType = pointer ? `*${base}` : base;
      const tag = field.optional ? `${key},omitempty` : key;
      return { goName, goFieldType, tag: `\`json:"${tag}"\`` };
    });
    // Align the columns the way `gofmt` would.
    const nameWidth = Math.max(...rows.map((r) => r.goName.length));
    const typeWidth = Math.max(...rows.map((r) => r.goFieldType.length));
    const body = rows
      .map((r) => `\t${r.goName.padEnd(nameWidth)} ${r.goFieldType.padEnd(typeWidth)} ${r.tag}`)
      .join('\n');
    return `type ${type.name} struct {\n${body}\n}`;
  });

  return `package main\n\n${structs.join('\n\n')}\n`;
}

// --- Zod ---

function zodType(shape: Shape, names: Map<string, string>): string {
  switch (shape.kind) {
    case 'object':
      return `${names.get(signatureOf(shape)) ?? 'z.record(z.string(), z.unknown())'}Schema`;
    case 'array':
      return `z.array(${zodType(shape.element, names)})`;
    case 'nullable':
      return `${zodType(shape.inner, names)}.nullable()`;
    case 'primitive':
      switch (shape.name) {
        case 'integer':
          return 'z.number().int()';
        case 'number':
          return 'z.number()';
        case 'boolean':
          return 'z.boolean()';
        default:
          return 'z.string()';
      }
    case 'null':
      return 'z.null()';
    default:
      return 'z.unknown()';
  }
}

function emitZod(types: NamedType[], names: Map<string, string>): string {
  const ordered = dependenciesFirst(types, names);

  const blocks = ordered.map((type) => {
    if (type.fields.size === 0) {
      return `export const ${type.name}Schema = z.object({});\n\nexport type ${type.name} = z.infer<typeof ${type.name}Schema>;`;
    }
    const body = [...type.fields]
      .map(([key, field]) => {
        const value = zodType(field.shape, names);
        const optional = field.optional ? '.optional()' : '';
        return `  ${tsPropertyName(key)}: ${value}${optional},`;
      })
      .join('\n');
    return (
      `export const ${type.name}Schema = z.object({\n${body}\n});\n\n` +
      `export type ${type.name} = z.infer<typeof ${type.name}Schema>;`
    );
  });

  return `import { z } from 'zod';\n\n${blocks.join('\n\n')}\n`;
}

// --- Rust (serde) ---

const RUST_KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else', 'enum', 'extern',
  'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub',
  'ref', 'return', 'self', 'static', 'struct', 'super', 'trait', 'true', 'type', 'union', 'unsafe',
  'use', 'where', 'while', 'abstract', 'become', 'box', 'do', 'final', 'macro', 'override', 'priv',
  'try', 'typeof', 'unsized', 'virtual', 'yield',
]);

/** "userName" / "user-name" -> "user_name". */
function snakeCase(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function rustType(shape: Shape, names: Map<string, string>): string {
  switch (shape.kind) {
    case 'object':
      return names.get(signatureOf(shape)) ?? 'serde_json::Value';
    case 'array':
      return `Vec<${rustType(shape.element, names)}>`;
    case 'nullable':
      return `Option<${rustType(shape.inner, names)}>`;
    case 'primitive':
      switch (shape.name) {
        case 'integer':
          return 'i64';
        case 'number':
          return 'f64';
        case 'boolean':
          return 'bool';
        default:
          return 'String';
      }
    case 'null':
      return 'Option<serde_json::Value>';
    default:
      return 'serde_json::Value';
  }
}

function emitRust(types: NamedType[], names: Map<string, string>): string {
  const structs = types.map((type) => {
    if (type.fields.size === 0) {
      return `#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct ${type.name} {}`;
    }
    const rows = [...type.fields].map(([key, field]) => {
      const snake = snakeCase(key);
      const name = snake === '' || /^[0-9]/.test(snake) ? `field_${snake}` : snake;
      const ident = RUST_KEYWORDS.has(name) ? `r#${name}` : name;
      // Optional (absent in some samples) fields become Option<T> with a default.
      const optional = field.optional && field.shape.kind !== 'nullable' && field.shape.kind !== 'null';
      const base = rustType(field.shape, names);
      const rustFieldType = optional && !base.startsWith('Option<') ? `Option<${base}>` : base;

      const attrs: string[] = [];
      // serde needs the wire name whenever it differs from the Rust identifier.
      if (name !== key) {
        attrs.push(`rename = "${key.replace(/["\\]/g, '\\$&')}"`);
      }
      if (optional) {
        attrs.push('default', 'skip_serializing_if = "Option::is_none"');
      }
      const attrLine = attrs.length ? `    #[serde(${attrs.join(', ')})]\n` : '';
      return `${attrLine}    pub ${ident}: ${rustFieldType},`;
    });
    return `#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct ${type.name} {\n${rows.join('\n')}\n}`;
  });

  return `use serde::{Deserialize, Serialize};\n\n${structs.join('\n\n')}\n`;
}

// --- Kotlin (data classes) ---

const KOTLIN_KEYWORDS = new Set([
  'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in', 'interface',
  'is', 'null', 'object', 'package', 'return', 'super', 'this', 'throw', 'true', 'try', 'typealias',
  'typeof', 'val', 'var', 'when', 'while',
]);

function kotlinType(shape: Shape, names: Map<string, string>): string {
  switch (shape.kind) {
    case 'object':
      return names.get(signatureOf(shape)) ?? 'Any';
    case 'array':
      return `List<${kotlinType(shape.element, names)}>`;
    case 'nullable':
      return `${kotlinType(shape.inner, names)}?`;
    case 'primitive':
      switch (shape.name) {
        case 'integer':
          return 'Long';
        case 'number':
          return 'Double';
        case 'boolean':
          return 'Boolean';
        default:
          return 'String';
      }
    case 'null':
      return 'Any?';
    default:
      return 'Any';
  }
}

/** A JSON key as a Kotlin property name; invalid names are back-tick escaped. */
function kotlinPropertyName(key: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !KOTLIN_KEYWORDS.has(key)) {
    return key;
  }
  return `\`${key}\``;
}

function emitKotlin(types: NamedType[], names: Map<string, string>): string {
  const classes = types.map((type) => {
    // A Kotlin data class must declare at least one property.
    if (type.fields.size === 0) {
      return `class ${type.name}`;
    }
    const rows = [...type.fields].map(([key, field]) => {
      const optional = field.optional && field.shape.kind !== 'nullable' && field.shape.kind !== 'null';
      const base = kotlinType(field.shape, names);
      const kotlinFieldType = optional && !base.endsWith('?') ? `${base}?` : base;
      // Absent-in-some-samples fields default to null so the class stays constructible.
      const suffix = optional ? ' = null' : '';
      // The property keeps the JSON key verbatim (back-ticked when not a bare
      // identifier), so the serialized name always matches — no @SerialName needed.
      return `    val ${kotlinPropertyName(key)}: ${kotlinFieldType}${suffix},`;
    });
    return `data class ${type.name}(\n${rows.join('\n')}\n)`;
  });

  return `${classes.join('\n\n')}\n`;
}

// --- Java (records) ---

const JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
  'volatile', 'while', 'true', 'false', 'null', 'var', 'record', 'yield',
]);

/** Java type. `boxed` forces the wrapper type, needed inside generics and for nullables. */
function javaType(shape: Shape, names: Map<string, string>, boxed = false): string {
  switch (shape.kind) {
    case 'object':
      return names.get(signatureOf(shape)) ?? 'Object';
    case 'array':
      return `List<${javaType(shape.element, names, true)}>`;
    case 'nullable':
      return javaType(shape.inner, names, true);
    case 'primitive':
      switch (shape.name) {
        case 'integer':
          return boxed ? 'Long' : 'long';
        case 'number':
          return boxed ? 'Double' : 'double';
        case 'boolean':
          return boxed ? 'Boolean' : 'boolean';
        default:
          return 'String';
      }
    case 'null':
      return 'Object';
    default:
      return 'Object';
  }
}

function javaComponentName(key: string): string {
  let name = key.replace(/[^A-Za-z0-9_$]/g, '_');
  if (name === '' || /^[0-9]/.test(name)) {
    name = `field_${name}`;
  }
  return JAVA_KEYWORDS.has(name) ? `${name}_` : name;
}

function emitJava(types: NamedType[], names: Map<string, string>): string {
  const records = types.map((type) => {
    if (type.fields.size === 0) {
      return `public record ${type.name}() {}`;
    }
    const rows = [...type.fields].map(([key, field]) => {
      // A record component cannot be a primitive if it may be null, so box optionals.
      const boxed = field.optional;
      return `    ${javaType(field.shape, names, boxed)} ${javaComponentName(key)}`;
    });
    return `public record ${type.name}(\n${rows.join(',\n')}\n) {}`;
  });

  const needsList = records.some((record) => /\bList</.test(record));
  const imports = needsList ? 'import java.util.List;\n\n' : '';
  return `${imports}${records.join('\n\n')}\n`;
}

// --- JSON Schema (draft 2020-12) ---

/** A JSON Schema fragment describing one shape. */
function schemaFor(shape: Shape, names: Map<string, string>): Record<string, unknown> {
  switch (shape.kind) {
    case 'object': {
      const name = names.get(signatureOf(shape));
      return name ? { $ref: `#/$defs/${name}` } : { type: 'object' };
    }
    case 'array':
      return { type: 'array', items: schemaFor(shape.element, names) };
    case 'nullable': {
      const inner = schemaFor(shape.inner, names);
      // A nullable primitive can widen its `type`; anything else needs anyOf.
      if (typeof inner['type'] === 'string' && Object.keys(inner).length === 1) {
        return { type: [inner['type'], 'null'] };
      }
      return { anyOf: [inner, { type: 'null' }] };
    }
    case 'primitive':
      return { type: shape.name === 'integer' ? 'integer' : shape.name };
    case 'null':
      return { type: 'null' };
    default:
      return {};
  }
}

function emitJsonSchema(
  types: NamedType[],
  names: Map<string, string>,
  rootName: string,
): string {
  const $defs: Record<string, unknown> = {};
  for (const type of types) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, field] of type.fields) {
      properties[key] = schemaFor(field.shape, names);
      if (!field.optional) {
        required.push(key);
      }
    }
    const schema: Record<string, unknown> = { type: 'object', properties };
    if (required.length) {
      schema['required'] = required;
    }
    $defs[type.name] = schema;
  }

  const root = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $ref: `#/$defs/${rootName}`,
    $defs,
  };
  return `${JSON.stringify(root, null, 2)}\n`;
}

// --- Pydantic (v2) ---

function emitPydantic(types: NamedType[], names: Map<string, string>): string {
  const ordered = dependenciesFirst(types, names);
  let needsField = false;

  const classes = ordered.map((type) => {
    if (type.fields.size === 0) {
      return `class ${type.name}(BaseModel):\n    pass`;
    }
    const lines = [...type.fields].map(([key, field]) => {
      const name = pyFieldName(key);
      const optional = field.optional;
      const annotation = optional
        ? `Optional[${pyType(unwrap(field.shape), names)}]`
        : pyType(field.shape, names);

      // An alias is only needed when the sanitised identifier no longer matches
      // the JSON key; a plain optional just takes a `= None` default.
      if (name !== key) {
        needsField = true;
        const parts = [`alias='${key.replace(/[\\']/g, '\\$&')}'`];
        if (optional) {
          parts.push('default=None');
        }
        return `    ${name}: ${annotation} = Field(${parts.join(', ')})`;
      }
      return `    ${name}: ${annotation}${optional ? ' = None' : ''}`;
    });
    return `class ${type.name}(BaseModel):\n${lines.join('\n')}`;
  });

  const body = classes.join('\n\n\n');
  const typing = ['Any', 'List', 'Optional'].filter((name) =>
    new RegExp(`\\b${name}\\b`).test(body),
  );
  const pydanticImport = needsField
    ? 'from pydantic import BaseModel, Field'
    : 'from pydantic import BaseModel';
  const imports = [
    'from __future__ import annotations',
    '',
    ...(typing.length ? [`from typing import ${typing.join(', ')}`] : []),
    pydanticImport,
  ].join('\n');

  return `${imports}\n\n\n${body}\n`;
}
