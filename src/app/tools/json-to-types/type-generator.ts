/**
 * Turns a parsed JSON value into TypeScript interfaces or C# classes.
 *
 * The work happens in three passes so each stays simple:
 *   1. `infer`    — describe a single value as a Shape.
 *   2. `merge`    — fold the shapes of array elements together, so a list of
 *                   objects produces one type whose fields are optional where
 *                   they were missing from some elements.
 *   3. `collect` + emit — name every object shape, then print it.
 *
 * Kept free of Angular so the generation is testable on its own.
 */

export type Language = 'typescript' | 'csharp';

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
    return options.language === 'typescript'
      ? `export type ${rootName} = ${tsType(shape, bySignature)};\n`
      : `// The JSON is a ${csType(shape, bySignature)}, not an object — there is no class to generate.\n`;
  }

  return options.language === 'typescript'
    ? emitTypeScript(types, bySignature)
    : emitCSharp(types, bySignature);
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
