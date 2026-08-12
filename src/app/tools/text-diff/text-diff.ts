import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';

import { syncToolState } from '../../core/tool-state';
import { DiffRow, diffLines } from './diff';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { TryExample } from '../../shared/try-example/try-example';

type ViewMode = 'split' | 'unified';

/**
 * "Try an example" pair: an nginx server block before and after an HTTPS
 * migration — the kind of config diff people actually paste in, with adds,
 * removes and changed lines that exercise the pairing logic.
 */
const SAMPLE_ORIGINAL = `server {
  listen 80;
  server_name example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
  }

  location /static/ {
    root /var/www/example;
    expires 30d;
  }
}`;

const SAMPLE_CHANGED = `server {
  listen 443 ssl http2;
  server_name example.com www.example.com;

  ssl_certificate /etc/ssl/example.com.pem;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
  }

  location /static/ {
    root /var/www/example;
    expires 7d;
  }
}`;

/** One aligned pair for the split view: a left cell and a right cell. */
interface SplitRow {
  left: DiffRow | null;
  right: DiffRow | null;
}

@Component({
  selector: 'app-text-diff',
  imports: [ToolContent, CodeEditor, ShareLink, TryExample, RouterLink, MatButtonModule, NgIcon],
  templateUrl: './text-diff.html',
  styleUrls: ['../tool-shell.css', './text-diff.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextDiffTool {
  protected readonly original = signal('');
  protected readonly changed = signal('');
  protected readonly view = signal<ViewMode>('split');
  protected readonly ignoreCase = signal(false);
  protected readonly ignoreWhitespace = signal(false);

  /**
   * Both sides plus the comparison options — "here is the difference I am
   * looking at" is most of the reason anyone links to a diff.
   */
  protected readonly shared = syncToolState({
    key: 'text-diff',
    snapshot: () => ({
      original: this.original(),
      changed: this.changed(),
      view: this.view(),
      ignoreCase: this.ignoreCase(),
      ignoreWhitespace: this.ignoreWhitespace(),
    }),
    restore: (state) => {
      if (typeof state.original === 'string') {
        this.original.set(state.original);
      }
      if (typeof state.changed === 'string') {
        this.changed.set(state.changed);
      }
      if (state.view === 'split' || state.view === 'unified') {
        this.view.set(state.view);
      }
      if (typeof state.ignoreCase === 'boolean') {
        this.ignoreCase.set(state.ignoreCase);
      }
      if (typeof state.ignoreWhitespace === 'boolean') {
        this.ignoreWhitespace.set(state.ignoreWhitespace);
      }
    },
  });

  protected readonly result = computed(() =>
    diffLines(this.original(), this.changed(), {
      ignoreCase: this.ignoreCase(),
      ignoreWhitespace: this.ignoreWhitespace(),
    }),
  );

  protected readonly hasInput = computed(
    () => this.original().length > 0 || this.changed().length > 0,
  );

  protected readonly identical = computed(() => {
    const { stats } = this.result();
    return this.hasInput() && stats.added === 0 && stats.removed === 0;
  });

  /** Pair removals with the additions that follow them so the split view aligns changes. */
  protected readonly splitRows = computed<SplitRow[]>(() => {
    const rows = this.result().rows;
    const out: SplitRow[] = [];
    let index = 0;
    while (index < rows.length) {
      const row = rows[index];
      if (row.kind === 'equal') {
        out.push({ left: row, right: row });
        index++;
        continue;
      }
      // Gather a contiguous run of removals then additions and zip them.
      const removes: DiffRow[] = [];
      const adds: DiffRow[] = [];
      while (index < rows.length && rows[index].kind === 'remove') {
        removes.push(rows[index++]);
      }
      while (index < rows.length && rows[index].kind === 'add') {
        adds.push(rows[index++]);
      }
      const span = Math.max(removes.length, adds.length);
      for (let k = 0; k < span; k++) {
        out.push({ left: removes[k] ?? null, right: adds[k] ?? null });
      }
    }
    return out;
  });

  protected setView(mode: ViewMode): void {
    this.view.set(mode);
  }

  protected toggleIgnoreCase(): void {
    this.ignoreCase.update((value) => !value);
  }

  protected toggleIgnoreWhitespace(): void {
    this.ignoreWhitespace.update((value) => !value);
  }

  protected swap(): void {
    const original = this.original();
    this.original.set(this.changed());
    this.changed.set(original);
  }

  protected clear(): void {
    this.original.set('');
    this.changed.set('');
  }

  /** Fill both sides with the sample config pair; the diff renders immediately. */
  protected loadExample(): void {
    this.original.set(SAMPLE_ORIGINAL);
    this.changed.set(SAMPLE_CHANGED);
  }
}
