import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { ShareLink } from '../../shared/share-link/share-link';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { TryExample } from '../../shared/try-example/try-example';
import {
  DRIFT_LABELS,
  osvKey,
  parsePackageJson,
  rowFor,
  toMarkdown,
  type Declared,
  type Lookup,
  type Row,
  type Vuln,
  type VulnState,
} from './package-check';
import { CONCURRENCY, eachLimited, fetchPackument, fetchVuln, queryOsv } from './registry';

/** A package.json is a few kilobytes; a megabyte is already something else. */
const MAX_FILE_BYTES = 1024 * 1024;

/**
 * One of each case the checker handles: a deprecated package, a pinned version
 * with published advisories, a range a major behind, a prerelease tag, a
 * scoped name, an alias, and three specs that are never looked up.
 */
const SAMPLE = `{
  "name": "example-app",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.17.1",
    "lodash": "4.17.15",
    "request": "^2.88.0",
    "react": "^17.0.2",
    "@angular/core": "next",
    "string-width-cjs": "npm:string-width@^4.2.3",
    "shared-ui": "workspace:*",
    "my-fork": "github:someone/some-repo#main"
  },
  "devDependencies": {
    "typescript": "~5.4.0",
    "vitest": "latest",
    "local-tool": "file:../tools/local-tool"
  }
}
`;

type OsvStatus = 'idle' | 'pending' | 'done' | 'failed';

@Component({
  selector: 'app-package-json-checker',
  imports: [ToolPage, ToolContent, Dropzone, ShareLink, Spinner, TryExample, MatButtonModule, NgIcon],
  templateUrl: './package-json-checker.html',
  styleUrls: ['../tool-shell.css', './package-json-checker.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PackageJsonCheckerTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly text = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly onlyProblems = signal(false);

  private readonly declared = signal<Declared[]>([]);
  private readonly lookups = signal<ReadonlyMap<string, Lookup>>(new Map());
  private readonly osv = signal<OsvStatus>('idle');
  private readonly vulnIds = signal<ReadonlyMap<string, string[]>>(new Map());
  private readonly vulnDetails = signal<ReadonlyMap<string, Vuln | null>>(new Map());
  /** Bumped on every check, so a slow answer to an old one is dropped. */
  private run = 0;

  protected readonly driftLabels = DRIFT_LABELS;

  /** Only the text, never the report: the report needs the network, and the link must not. */
  protected readonly shared = syncToolState({
    key: 'package-json-checker',
    snapshot: () => ({ input: this.text() }),
    restore: (state) => {
      if (typeof state.input === 'string') this.text.set(state.input);
    },
  });

  protected readonly rows = computed<Row[]>(() => {
    const lookups = this.lookups();
    const status = this.osv();
    const ids = this.vulnIds();
    const details = this.vulnDetails();
    const vulnsFor = (key: string): VulnState => {
      if (status === 'pending') return 'pending';
      if (status === 'failed') return 'unchecked';
      return (ids.get(key) ?? []).map(
        (id) =>
          details.get(`${key} ${id}`) ?? { id, summary: null, severity: null, aliases: [], fixed: null },
      );
    };
    return this.declared().map((dep) => {
      const name = dep.parsed.kind === 'registry' ? dep.parsed.target.name : '';
      return rowFor(dep, name ? lookups.get(name) : undefined, vulnsFor);
    });
  });

  protected readonly shown = computed(() =>
    this.onlyProblems() ? this.rows().filter((row) => row.problem) : this.rows(),
  );

  protected readonly summary = computed(() => {
    const rows = this.rows();
    return {
      total: rows.length,
      behind: rows.filter((r) => r.drift === 'major' || r.drift === 'minor' || r.drift === 'patch')
        .length,
      deprecated: rows.filter((r) => r.deprecated !== null).length,
      vulnerable: rows.filter((r) => Array.isArray(r.vulns) && r.vulns.length > 0).length,
      skipped: rows.filter((r) => r.state === 'skipped').length,
      failed: rows.filter((r) => r.state === 'failed').length,
      problems: rows.filter((r) => r.problem).length,
    };
  });

  protected readonly summaryText = computed(() => {
    const s = this.summary();
    if (this.busy()) return `Checking ${plural(s.total, 'package')}…`;
    const parts = [
      `${s.behind} behind latest`,
      `${s.deprecated} deprecated`,
      `${s.vulnerable} with known vulnerabilities`,
    ];
    if (s.skipped) parts.push(`${s.skipped} not looked up`);
    if (s.failed) parts.push(`${s.failed} could not be checked`);
    return `${plural(s.total, 'package')}: ${parts.join(', ')}.`;
  });

  protected readonly osvFailed = computed(() => this.osv() === 'failed');

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }

  protected async acceptFiles(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      this.error.set(`"${file.name}" is larger than a package.json should be.`);
      return;
    }
    this.text.set(await file.text());
    await this.check();
  }

  protected async loadExample(): Promise<void> {
    this.text.set(SAMPLE);
    await this.check();
  }

  protected clear(): void {
    this.run++;
    this.text.set('');
    this.error.set(null);
    this.declared.set([]);
    this.busy.set(false);
  }

  protected copyReport(): void {
    void this.clipboard.copy(toMarkdown(this.rows()));
  }

  protected async check(): Promise<void> {
    const parsed = parsePackageJson(this.text());
    const run = ++this.run;
    this.lookups.set(new Map());
    this.vulnIds.set(new Map());
    this.vulnDetails.set(new Map());
    if (!parsed.ok) {
      this.error.set(parsed.message);
      this.declared.set([]);
      this.busy.set(false);
      return;
    }
    this.error.set(null);
    this.declared.set(parsed.deps);
    this.osv.set('pending');
    this.busy.set(true);

    // 1. The registry, once per distinct name, a few at a time. A failure is
    //    kept on that one package; the rest of the report carries on.
    const names = [
      ...new Set(
        parsed.deps.flatMap((dep) => (dep.parsed.kind === 'registry' ? [dep.parsed.target.name] : [])),
      ),
    ];
    await eachLimited(names, CONCURRENCY, async (name) => {
      let lookup: Lookup;
      try {
        lookup = await fetchPackument(name);
      } catch {
        lookup = 'failed';
      }
      if (run === this.run) this.lookups.update((map) => new Map(map).set(name, lookup));
    });
    if (run !== this.run) return;

    // 2. OSV, in one batch, for the version each range resolves to today.
    const targets = new Map<string, { name: string; version: string }>();
    for (const [index, row] of this.rows().entries()) {
      const dep = parsed.deps[index];
      if (row.resolved && dep.parsed.kind === 'registry') {
        const name = dep.parsed.target.name;
        targets.set(osvKey(name, row.resolved), { name, version: row.resolved });
      }
    }
    const queries = [...targets.entries()];
    try {
      const answers = queries.length ? await queryOsv(queries.map(([, query]) => query)) : [];
      if (run !== this.run) return;
      this.vulnIds.set(new Map(queries.map(([key], i) => [key, answers[i] ?? []])));
      this.osv.set('done');
    } catch {
      if (run === this.run) {
        this.osv.set('failed');
        this.busy.set(false);
      }
      return;
    }

    // 3. Each advisory's summary and fix. Without them the id is still shown.
    const advisories = queries.flatMap(([key, query]) =>
      (this.vulnIds().get(key) ?? []).map((id) => ({ key, id, ...query })),
    );
    await eachLimited(advisories, CONCURRENCY, async ({ key, id, name, version }) => {
      const vuln = await fetchVuln(id, name, version);
      if (run === this.run) {
        this.vulnDetails.update((map) => new Map(map).set(`${key} ${id}`, vuln));
      }
    });
    if (run === this.run) this.busy.set(false);
  }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
