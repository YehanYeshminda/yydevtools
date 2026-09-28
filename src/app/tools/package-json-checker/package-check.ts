/**
 * The package.json Checker's logic, kept free of the network so it can be
 * tested on its own: reading the file, deciding what each dependency spec asks
 * for, and comparing that with what the registry has published.
 *
 * Range maths is semver's, the library npm itself uses, never our own.
 */
import { diff, gt, maxSatisfying, satisfies, valid, validRange } from 'semver';

export type Section = 'dependencies' | 'devDependencies';
export const SECTIONS: readonly Section[] = ['dependencies', 'devDependencies'];

/**
 * What a spec asks the registry for. `range` and `tag` are mutually exclusive;
 * `name` is the package actually fetched, which differs from the key for an
 * `npm:` alias.
 */
export interface RegistryTarget {
  name: string;
  range?: string;
  tag?: string;
}

/** A spec the public registry cannot answer for, and why. */
export type SkipReason = 'workspace' | 'local' | 'git' | 'url' | 'other';

export type Spec =
  | { kind: 'registry'; target: RegistryTarget; alias: boolean }
  | { kind: 'skip'; reason: SkipReason }
  | { kind: 'invalid'; message: string };

export interface Declared {
  section: Section;
  name: string;
  spec: string;
  parsed: Spec;
}

/**
 * npm's own package-name grammar, with upper case allowed because a few old
 * packages (JSONStream) still have it. A name must pass this before it is ever
 * put in a URL, which also means nothing but a package name can be sent.
 */
const NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/i;
const MAX_NAME = 214;

/** A dist-tag such as `latest`, `next` or `beta`. */
const TAG = /^[a-z][a-z0-9._-]*$/i;

export function isPackageName(name: string): boolean {
  return name.length <= MAX_NAME && NAME.test(name);
}

/** Decide what one `"name": "spec"` entry asks for. */
export function parseSpec(name: string, raw: unknown): Spec {
  if (!isPackageName(name)) {
    return { kind: 'invalid', message: 'Not a valid npm package name.' };
  }
  if (typeof raw !== 'string') {
    return { kind: 'invalid', message: 'The version should be a string.' };
  }
  const spec = raw.trim();

  if (/^(workspace|catalog):/.test(spec)) return { kind: 'skip', reason: 'workspace' };
  if (spec.startsWith('npm:')) return parseAlias(spec.slice(4));
  if (/^(file|link|portal):/.test(spec) || /^(\.{1,2}\/|\/|~\/|[a-z]:\\)/i.test(spec)) {
    return { kind: 'skip', reason: 'local' };
  }
  if (
    /^(git\+[a-z]+|git|github|gitlab|bitbucket|gist):/.test(spec) ||
    /\.git(#.*)?$/.test(spec) ||
    // GitHub shorthand: user/repo, optionally with a #ref.
    /^[a-z0-9_.-]+\/[a-z0-9_.-]+(#.*)?$/i.test(spec)
  ) {
    return { kind: 'skip', reason: 'git' };
  }
  if (/^https?:/.test(spec)) return { kind: 'skip', reason: 'url' };
  if (/^[a-z][a-z0-9+.-]*:/i.test(spec)) return { kind: 'skip', reason: 'other' };

  return rangeOrTag(name, spec, false);
}

/** `npm:real-name@range`, where the range (or tag) is optional. */
function parseAlias(rest: string): Spec {
  const at = rest.indexOf('@', 1);
  const name = at === -1 ? rest : rest.slice(0, at);
  const spec = at === -1 ? '' : rest.slice(at + 1).trim();
  if (!isPackageName(name)) {
    return { kind: 'invalid', message: 'The npm: alias does not name a valid package.' };
  }
  return rangeOrTag(name, spec, true);
}

function rangeOrTag(name: string, spec: string, alias: boolean): Spec {
  // An empty spec means "latest" to npm, and so does a bare alias.
  if (spec === '') return { kind: 'registry', target: { name, tag: 'latest' }, alias };
  if (validRange(spec) !== null) return { kind: 'registry', target: { name, range: spec }, alias };
  if (TAG.test(spec)) return { kind: 'registry', target: { name, tag: spec }, alias };
  return { kind: 'invalid', message: 'Not a version range, a tag or a known protocol.' };
}

export type ParseResult =
  | { ok: true; name: string | null; deps: Declared[] }
  | { ok: false; message: string };

/** Read a package.json and list its dependencies and devDependencies in file order. */
export function parsePackageJson(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    return { ok: false, message: `That is not valid JSON. ${detail}`.trim() };
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return { ok: false, message: 'A package.json is a JSON object, and this is not one.' };
  }
  const pkg = json as Record<string, unknown>;
  const deps: Declared[] = [];
  for (const section of SECTIONS) {
    const block = pkg[section];
    if (block === undefined) continue;
    if (block === null || typeof block !== 'object' || Array.isArray(block)) {
      return { ok: false, message: `"${section}" should be an object of name: version pairs.` };
    }
    for (const [name, spec] of Object.entries(block)) {
      deps.push({
        section,
        name,
        spec: typeof spec === 'string' ? spec : JSON.stringify(spec),
        parsed: parseSpec(name, spec),
      });
    }
  }
  if (deps.length === 0) {
    return { ok: false, message: 'No dependencies or devDependencies were found in that file.' };
  }
  return { ok: true, name: typeof pkg['name'] === 'string' ? pkg['name'] : null, deps };
}

/** The part of a registry document this tool reads. */
export interface Packument {
  tags: Record<string, string>;
  versions: string[];
  /** Deprecation message by version, only for deprecated versions. */
  deprecated: Record<string, string>;
}

/** Reduce npm's abbreviated metadata document to a Packument. */
export function toPackument(doc: unknown): Packument {
  const record = (doc ?? {}) as {
    'dist-tags'?: Record<string, unknown>;
    versions?: Record<string, { deprecated?: unknown }>;
  };
  const tags: Record<string, string> = {};
  for (const [tag, version] of Object.entries(record['dist-tags'] ?? {})) {
    if (typeof version === 'string') tags[tag] = version;
  }
  const versions: string[] = [];
  const deprecated: Record<string, string> = {};
  for (const [version, manifest] of Object.entries(record.versions ?? {})) {
    if (valid(version) === null) continue;
    versions.push(version);
    const message = manifest?.deprecated;
    // npm writes an empty string to *un*-deprecate a version.
    if (typeof message === 'string' && message.trim() !== '') deprecated[version] = message;
  }
  return { tags, versions, deprecated };
}

/**
 * How the declared spec relates to the newest release.
 *
 * - `current`: the spec already allows (or is) the latest version.
 * - `major` / `minor` / `patch`: the newest version it allows is that far behind.
 * - `ahead`: it resolves past `latest`, usually a prerelease channel like `next`.
 * - `no-match`: nothing published satisfies it (or the tag does not exist).
 */
export type Drift = 'current' | 'major' | 'minor' | 'patch' | 'ahead' | 'no-match';

export interface Resolution {
  latest: string | null;
  resolved: string | null;
  drift: Drift;
  deprecated: string | null;
}

/**
 * Pick the version the spec installs today, the way npm does: the `latest` tag
 * when the range allows it, otherwise the highest non-deprecated match, and a
 * deprecated one only when nothing else matches.
 */
export function resolve(target: RegistryTarget, pack: Packument): Resolution {
  const latest = pack.tags['latest'] ?? maxSatisfying(pack.versions, '*');
  let resolved: string | null;
  if (target.tag !== undefined) {
    resolved = pack.tags[target.tag] ?? null;
  } else {
    const range = target.range ?? '*';
    if (latest !== null && satisfies(latest, range)) {
      resolved = latest;
    } else {
      const live = pack.versions.filter((version) => !(version in pack.deprecated));
      resolved = maxSatisfying(live, range) ?? maxSatisfying(pack.versions, range);
    }
  }
  const deprecated =
    (resolved !== null ? pack.deprecated[resolved] : undefined) ??
    (latest !== null ? pack.deprecated[latest] : undefined) ??
    null;
  return { latest, resolved, drift: driftBetween(resolved, latest), deprecated };
}

export function driftBetween(resolved: string | null, latest: string | null): Drift {
  if (resolved === null) return 'no-match';
  if (latest === null || resolved === latest) return 'current';
  if (gt(resolved, latest)) return 'ahead';
  switch (diff(resolved, latest)) {
    case 'major':
    case 'premajor':
      return 'major';
    case 'minor':
    case 'preminor':
      return 'minor';
    case null:
      return 'current';
    default:
      return 'patch';
  }
}

/** One OSV advisory, reduced to what the report shows. */
export interface Vuln {
  id: string;
  summary: string | null;
  severity: string | null;
  aliases: string[];
  /** The lowest fixed version above the one checked, if the advisory names one. */
  fixed: string | null;
}

/** Reduce an OSV /v1/vulns/{id} document for the package and version it was found in. */
export function toVuln(doc: unknown, name: string, version: string): Vuln {
  const record = (doc ?? {}) as {
    id?: unknown;
    summary?: unknown;
    aliases?: unknown;
    database_specific?: { severity?: unknown };
    affected?: Array<{
      package?: { name?: unknown; ecosystem?: unknown };
      ranges?: Array<{ events?: Array<{ fixed?: unknown }> }>;
    }>;
  };
  const fixes: string[] = [];
  for (const affected of record.affected ?? []) {
    if (affected.package?.ecosystem !== 'npm' || affected.package?.name !== name) continue;
    for (const range of affected.ranges ?? []) {
      for (const event of range.events ?? []) {
        const fixed = event.fixed;
        if (typeof fixed === 'string' && valid(fixed) !== null && gt(fixed, version)) {
          fixes.push(fixed);
        }
      }
    }
  }
  const severity = record.database_specific?.severity;
  return {
    id: String(record.id ?? ''),
    summary: typeof record.summary === 'string' && record.summary ? record.summary : null,
    severity: typeof severity === 'string' ? severity.toUpperCase() : null,
    aliases: Array.isArray(record.aliases)
      ? record.aliases.filter((alias): alias is string => typeof alias === 'string')
      : [],
    fixed: fixes.length ? fixes.reduce((a, b) => (gt(a, b) ? b : a)) : null,
  };
}

/** URL path segment for a package: a scoped name keeps its @ and escapes the slash. */
export function registryPath(name: string): string {
  return name.startsWith('@')
    ? '@' + encodeURIComponent(name.slice(1))
    : encodeURIComponent(name);
}

/** What the registry said about a name: a document, `null` for a 404, or a failure. */
export type Lookup = Packument | null | 'failed';

/** OSV's answer for one `name@version`: advisories, still waiting, or not checked. */
export type VulnState = Vuln[] | 'pending' | 'unchecked';

export type RowState = 'pending' | 'skipped' | 'invalid' | 'not-found' | 'failed' | 'checked';

export interface Row {
  section: Section;
  name: string;
  spec: string;
  /** The package really fetched, when an npm: alias names a different one. */
  alias: string | null;
  state: RowState;
  note: string | null;
  latest: string | null;
  resolved: string | null;
  drift: Drift | null;
  deprecated: string | null;
  /** Null when there is no resolved version to check. */
  vulns: VulnState | null;
  problem: boolean;
}

const SKIP_NOTES: Record<SkipReason, string> = {
  workspace: 'Workspace package, not looked up.',
  local: 'Local path, not looked up.',
  git: 'Git dependency, not looked up.',
  url: 'Tarball URL, not looked up.',
  other: 'Not an npm registry spec, not looked up.',
};

/** Key for the OSV answer about one resolved version. */
export const osvKey = (name: string, version: string): string => `${name}@${version}`;

/** One report row from a declaration and whatever has come back for it so far. */
export function rowFor(
  dep: Declared,
  lookup: Lookup | undefined,
  vulns: (key: string) => VulnState,
): Row {
  const row: Row = {
    section: dep.section,
    name: dep.name,
    spec: dep.spec,
    alias: null,
    state: 'pending',
    note: null,
    latest: null,
    resolved: null,
    drift: null,
    deprecated: null,
    vulns: null,
    problem: false,
  };
  const parsed = dep.parsed;
  if (parsed.kind === 'skip') return { ...row, state: 'skipped', note: SKIP_NOTES[parsed.reason] };
  if (parsed.kind === 'invalid') {
    return { ...row, state: 'invalid', note: parsed.message, problem: true };
  }
  const target = parsed.target;
  row.alias = parsed.alias ? target.name : null;
  if (lookup === undefined) return row;
  if (lookup === null) {
    return { ...row, state: 'not-found', note: 'Not on the public npm registry.', problem: true };
  }
  if (lookup === 'failed') {
    return { ...row, state: 'failed', note: 'The registry could not be reached.', problem: true };
  }
  const { latest, resolved, drift, deprecated } = resolve(target, lookup);
  const found = resolved === null ? null : vulns(osvKey(target.name, resolved));
  return {
    ...row,
    state: 'checked',
    latest,
    resolved,
    drift,
    deprecated,
    vulns: found,
    note:
      drift === 'no-match'
        ? target.tag !== undefined
          ? `The registry has no "${target.tag}" tag.`
          : 'No published version matches this range.'
        : null,
    problem:
      drift !== 'current' && drift !== 'ahead'
        ? true
        : deprecated !== null || (Array.isArray(found) && found.length > 0),
  };
}

export const DRIFT_LABELS: Record<Drift, string> = {
  current: 'Allows latest',
  major: 'Major behind',
  minor: 'Minor behind',
  patch: 'Patch behind',
  ahead: 'Ahead of latest',
  'no-match': 'No matching version',
};

/** The report as a Markdown table, for pasting into an issue or a pull request. */
export function toMarkdown(rows: readonly Row[]): string {
  const cell = (text: string | null): string =>
    (text ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim() || '-';
  const lines = [
    '| Package | Section | Declared | Resolves to | Latest | Status | Deprecated | Known vulnerabilities |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    const status = row.drift ? DRIFT_LABELS[row.drift] : row.note;
    const vulns =
      row.vulns === null
        ? null
        : row.vulns === 'pending'
          ? 'checking'
          : row.vulns === 'unchecked'
            ? 'not checked'
            : row.vulns.length === 0
              ? 'none known'
              : row.vulns
                  .map((vuln) => (vuln.severity ? `${vuln.id} (${vuln.severity})` : vuln.id))
                  .join(', ');
    lines.push(
      '| ' +
        [
          row.alias ? `${row.name} (npm:${row.alias})` : row.name,
          row.section,
          row.spec,
          row.resolved,
          row.latest,
          status,
          row.deprecated,
          vulns,
        ]
          .map(cell)
          .join(' | ') +
        ' |',
    );
  }
  return lines.join('\n') + '\n';
}
