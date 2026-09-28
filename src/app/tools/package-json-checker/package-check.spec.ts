import { describe, expect, it } from 'vitest';

import {
  driftBetween,
  parsePackageJson,
  parseSpec,
  registryPath,
  resolve,
  rowFor,
  toMarkdown,
  toPackument,
  toVuln,
  type Declared,
  type Packument,
} from './package-check';

const pack = (latest: string, versions: string[], deprecated: Record<string, string> = {}): Packument => ({
  tags: { latest, next: '5.0.0-rc.1' },
  versions,
  deprecated,
});

describe('parseSpec', () => {
  const target = (name: string, spec: unknown) => {
    const parsed = parseSpec(name, spec);
    return parsed.kind === 'registry' ? parsed.target : parsed;
  };

  it('reads ranges, exact versions and wildcards as ranges', () => {
    expect(target('lodash', '^4.17.15')).toEqual({ name: 'lodash', range: '^4.17.15' });
    expect(target('lodash', '4.17.15')).toEqual({ name: 'lodash', range: '4.17.15' });
    expect(target('lodash', '>=1.2 <3 || 4.x')).toEqual({ name: 'lodash', range: '>=1.2 <3 || 4.x' });
    expect(target('lodash', '*')).toEqual({ name: 'lodash', range: '*' });
  });

  it('reads dist-tags, and an empty spec as latest', () => {
    expect(target('react', 'latest')).toEqual({ name: 'react', tag: 'latest' });
    expect(target('react', 'next')).toEqual({ name: 'react', tag: 'next' });
    expect(target('react', '')).toEqual({ name: 'react', tag: 'latest' });
  });

  it('keeps scoped names', () => {
    expect(target('@angular/core', '~21.0.0')).toEqual({ name: '@angular/core', range: '~21.0.0' });
  });

  it('follows npm: aliases to the real package, with or without a range', () => {
    expect(parseSpec('str-width', 'npm:string-width@^4.2.3')).toEqual({
      kind: 'registry',
      target: { name: 'string-width', range: '^4.2.3' },
      alias: true,
    });
    expect(target('ng', 'npm:@angular/core@next')).toEqual({ name: '@angular/core', tag: 'next' });
    expect(target('x', 'npm:left-pad')).toEqual({ name: 'left-pad', tag: 'latest' });
    expect(parseSpec('x', 'npm:Not A Name@1').kind).toBe('invalid');
  });

  it('skips everything the public registry cannot answer for', () => {
    const reason = (spec: string) => {
      const parsed = parseSpec('pkg', spec);
      return parsed.kind === 'skip' ? parsed.reason : parsed.kind;
    };
    expect(reason('workspace:*')).toBe('workspace');
    expect(reason('workspace:^1.0.0')).toBe('workspace');
    expect(reason('catalog:')).toBe('workspace');
    expect(reason('file:../lib')).toBe('local');
    expect(reason('link:../lib')).toBe('local');
    expect(reason('./vendor/pkg.tgz')).toBe('local');
    expect(reason('../pkg')).toBe('local');
    expect(reason('git+https://github.com/user/repo.git')).toBe('git');
    expect(reason('git+ssh://git@github.com:user/repo.git#v1.0.0')).toBe('git');
    expect(reason('git://github.com/user/repo')).toBe('git');
    expect(reason('github:user/repo#semver:^1')).toBe('git');
    expect(reason('user/repo')).toBe('git');
    expect(reason('user/repo#main')).toBe('git');
    expect(reason('https://github.com/user/repo.git')).toBe('git');
    expect(reason('https://example.com/pkg-1.0.0.tgz')).toBe('url');
    expect(reason('patch:pkg@1.0.0#./fix.patch')).toBe('other');
  });

  it('rejects bad names and bad specs without sending them anywhere', () => {
    expect(parseSpec('Has Space', '1.0.0').kind).toBe('invalid');
    expect(parseSpec('../../etc', '1.0.0').kind).toBe('invalid');
    expect(parseSpec('a'.repeat(215), '1.0.0').kind).toBe('invalid');
    expect(parseSpec('pkg', 42).kind).toBe('invalid');
    expect(parseSpec('pkg', '^^not a range!').kind).toBe('invalid');
  });
});

describe('registryPath', () => {
  it('escapes the slash of a scoped name and nothing else', () => {
    expect(registryPath('@angular/core')).toBe('@angular%2Fcore');
    expect(registryPath('lodash')).toBe('lodash');
  });
});

describe('parsePackageJson', () => {
  it('lists dependencies then devDependencies in file order', () => {
    const result = parsePackageJson(
      JSON.stringify({
        name: 'app',
        scripts: { build: 'secret-script' },
        devDependencies: { vitest: '^4.0.0' },
        dependencies: { b: '1.0.0', a: '2.0.0' },
      }),
    );
    expect(result.ok && result.deps.map((dep) => `${dep.section}:${dep.name}@${dep.spec}`)).toEqual([
      'dependencies:b@1.0.0',
      'dependencies:a@2.0.0',
      'devDependencies:vitest@^4.0.0',
    ]);
  });

  it('explains what is wrong with a file it cannot use', () => {
    expect(parsePackageJson('{').ok).toBe(false);
    expect(parsePackageJson('[]').ok).toBe(false);
    expect(parsePackageJson('{"dependencies": []}').ok).toBe(false);
    expect(parsePackageJson('{"name": "empty"}')).toEqual({
      ok: false,
      message: 'No dependencies or devDependencies were found in that file.',
    });
  });
});

describe('toPackument', () => {
  it('keeps tags, valid versions and real deprecations only', () => {
    expect(
      toPackument({
        'dist-tags': { latest: '2.0.0' },
        versions: {
          '1.0.0': { deprecated: 'use 2' },
          '1.1.0': { deprecated: '' },
          '2.0.0': {},
          'not-a-version': {},
        },
      }),
    ).toEqual({ tags: { latest: '2.0.0' }, versions: ['1.0.0', '1.1.0', '2.0.0'], deprecated: { '1.0.0': 'use 2' } });
  });
});

describe('resolve and drift', () => {
  const versions = ['3.9.0', '4.0.0', '4.17.15', '4.17.21', '4.18.0', '5.0.0-rc.1'];

  it('says a range that already allows latest is current, and resolves to latest', () => {
    expect(resolve({ name: 'x', range: '^4.0.0' }, pack('4.18.0', versions))).toEqual({
      latest: '4.18.0',
      resolved: '4.18.0',
      drift: 'current',
      deprecated: null,
    });
  });

  it('measures how far behind the newest allowed version is', () => {
    const p = pack('4.18.0', versions);
    expect(resolve({ name: 'x', range: '4.17.15' }, p).drift).toBe('minor');
    expect(resolve({ name: 'x', range: '~4.17.0' }, p)).toMatchObject({ resolved: '4.17.21', drift: 'minor' });
    expect(resolve({ name: 'x', range: '^3.0.0' }, p)).toMatchObject({ resolved: '3.9.0', drift: 'major' });
    expect(resolve({ name: 'x', range: '4.17.21' }, pack('4.17.22', [...versions, '4.17.22'])).drift).toBe(
      'patch',
    );
  });

  it('resolves tags through dist-tags, including prerelease channels ahead of latest', () => {
    const p = pack('4.18.0', versions);
    expect(resolve({ name: 'x', tag: 'latest' }, p)).toMatchObject({ resolved: '4.18.0', drift: 'current' });
    expect(resolve({ name: 'x', tag: 'next' }, p)).toMatchObject({ resolved: '5.0.0-rc.1', drift: 'ahead' });
    expect(resolve({ name: 'x', tag: 'beta' }, p)).toMatchObject({ resolved: null, drift: 'no-match' });
  });

  it('reports a range nothing satisfies', () => {
    expect(resolve({ name: 'x', range: '^9.0.0' }, pack('4.18.0', versions)).drift).toBe('no-match');
  });

  it('skips deprecated versions the way npm does, and reports deprecation', () => {
    const p = pack('4.18.0', versions, { '4.17.21': 'broken build' });
    expect(resolve({ name: 'x', range: '~4.17.0' }, p)).toMatchObject({ resolved: '4.17.15', deprecated: null });
    expect(resolve({ name: 'x', range: '4.17.21' }, p)).toMatchObject({
      resolved: '4.17.21',
      deprecated: 'broken build',
    });
    // A deprecated latest means the whole package is deprecated.
    const gone = pack('2.88.2', ['2.88.2'], { '2.88.2': 'request has been deprecated' });
    expect(resolve({ name: 'request', range: '^2.88.0' }, gone).deprecated).toBe('request has been deprecated');
  });

  it('maps prerelease diffs onto major, minor and patch', () => {
    expect(driftBetween('1.0.0-beta.1', '2.0.0')).toBe('major');
    expect(driftBetween('1.0.0', '1.1.0')).toBe('minor');
    // semver's own reading: a 1.0.0 prerelease is a major step short of 1.0.0.
    expect(driftBetween('1.0.0-rc.1', '1.0.0')).toBe('major');
    expect(driftBetween('1.2.3-rc.1', '1.2.4')).toBe('patch');
    expect(driftBetween('1.2.3', '1.2.4')).toBe('patch');
    expect(driftBetween(null, '1.0.0')).toBe('no-match');
  });
});

describe('toVuln', () => {
  it('picks the lowest fix above the checked version, for this package only', () => {
    const vuln = toVuln(
      {
        id: 'GHSA-p6mc-m468-83gw',
        summary: 'Prototype Pollution in lodash',
        aliases: ['CVE-2020-8203'],
        database_specific: { severity: 'HIGH' },
        affected: [
          { package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ events: [{ introduced: '0' }, { fixed: '4.17.19' }] }] },
          { package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ events: [{ introduced: '5.0.0' }, { fixed: '5.0.1' }] }] },
          { package: { name: 'lodash-es', ecosystem: 'npm' }, ranges: [{ events: [{ fixed: '4.17.18' }] }] },
          { package: { name: 'lodash', ecosystem: 'RubyGems' }, ranges: [{ events: [{ fixed: '4.17.16' }] }] },
        ],
      },
      'lodash',
      '4.17.15',
    );
    expect(vuln).toEqual({
      id: 'GHSA-p6mc-m468-83gw',
      summary: 'Prototype Pollution in lodash',
      severity: 'HIGH',
      aliases: ['CVE-2020-8203'],
      fixed: '4.17.19',
    });
  });

  it('copes with an advisory that has no fix or severity', () => {
    expect(toVuln({ id: 'MAL-2024-1' }, 'evil', '1.0.0')).toEqual({
      id: 'MAL-2024-1',
      summary: null,
      severity: null,
      aliases: [],
      fixed: null,
    });
  });
});

describe('rowFor and toMarkdown', () => {
  const declared = (name: string, spec: string): Declared => ({
    section: 'dependencies',
    name,
    spec,
    parsed: parseSpec(name, spec),
  });

  it('turns each lookup outcome into a row, and flags only real problems', () => {
    const none = () => [] as never[];
    expect(rowFor(declared('a', '^1.0.0'), undefined, none).state).toBe('pending');
    expect(rowFor(declared('a', '^1.0.0'), null, none)).toMatchObject({ state: 'not-found', problem: true });
    expect(rowFor(declared('a', '^1.0.0'), 'failed', none)).toMatchObject({ state: 'failed', problem: true });
    expect(rowFor(declared('a', 'workspace:*'), undefined, none)).toMatchObject({ state: 'skipped', problem: false });
    expect(rowFor(declared('a', '^1.0.0'), pack('1.2.0', ['1.2.0']), none)).toMatchObject({
      state: 'checked',
      drift: 'current',
      vulns: [],
      problem: false,
    });
    const vulnerable = rowFor(declared('a', '1.2.0'), pack('1.2.0', ['1.2.0']), (key) =>
      key === 'a@1.2.0' ? [{ id: 'GHSA-x', summary: null, severity: 'LOW', aliases: [], fixed: null }] : [],
    );
    expect(vulnerable.problem).toBe(true);
    expect(rowFor(declared('a', 'npm:b@^1'), pack('1.0.0', ['1.0.0']), none).alias).toBe('b');
  });

  it('writes a Markdown table with pipes escaped', () => {
    const row = rowFor(declared('a', '>=1 || <0.1'), pack('1.0.0', ['1.0.0']), () => 'unchecked');
    const markdown = toMarkdown([row]);
    expect(markdown.split('\n')[2]).toBe(
      '| a | dependencies | >=1 \\|\\| <0.1 | 1.0.0 | 1.0.0 | Allows latest | - | not checked |',
    );
  });
});
