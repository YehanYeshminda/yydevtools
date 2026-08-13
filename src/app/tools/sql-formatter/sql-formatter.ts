import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { format, type KeywordCase, type SqlLanguage } from 'sql-formatter';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';

interface Dialect {
  value: SqlLanguage;
  label: string;
}

// A curated subset of sql-formatter's dialects — the ones people actually search
// for — rather than all two dozen, which would bury the common choices.
const DIALECTS: Dialect[] = [
  { value: 'sql', label: 'Standard SQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'mariadb', label: 'MariaDB' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'transactsql', label: 'SQL Server (T-SQL)' },
  { value: 'plsql', label: 'Oracle (PL/SQL)' },
  { value: 'bigquery', label: 'BigQuery' },
  { value: 'snowflake', label: 'Snowflake' },
  { value: 'redshift', label: 'Redshift' },
  { value: 'spark', label: 'Spark SQL' },
];

interface KeywordChoice {
  value: KeywordCase;
  label: string;
}

const KEYWORD_CASES: KeywordChoice[] = [
  { value: 'upper', label: 'UPPER' },
  { value: 'lower', label: 'lower' },
  { value: 'preserve', label: 'Preserve' },
];

const SAMPLE =
  'select id, name, email from users u join orders o on o.user_id = u.id ' +
  "where u.active = true and o.total > 100 order by o.created_at desc limit 10;";

@Component({
  selector: 'app-sql-formatter',
  imports: [ToolPage, ToolContent, CodeEditor, ShareLink, MatButtonModule, NgIcon],
  templateUrl: './sql-formatter.html',
  styleUrls: ['../tool-shell.css', './sql-formatter.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SqlFormatterTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly dialects = DIALECTS;
  protected readonly keywordCases = KEYWORD_CASES;

  protected readonly input = signal(SAMPLE);
  protected readonly dialect = signal<SqlLanguage>('sql');
  protected readonly keywordCase = signal<KeywordCase>('upper');
  protected readonly tabWidth = signal(2);
  protected readonly useTabs = signal(false);

  protected readonly shared = syncToolState({
    key: 'sql-formatter',
    snapshot: () => ({
      input: this.input(),
      dialect: this.dialect(),
      keywordCase: this.keywordCase(),
      tabWidth: this.tabWidth(),
      useTabs: this.useTabs(),
    }),
    restore: (state) => {
      if (typeof state.input === 'string') {
        this.input.set(state.input);
      }
      // Options come from a URL anyone can edit, so each is checked against the
      // list the tool actually offers rather than trusted.
      if (DIALECTS.some((option) => option.value === state.dialect)) {
        this.dialect.set(state.dialect as SqlLanguage);
      }
      if (KEYWORD_CASES.some((option) => option.value === state.keywordCase)) {
        this.keywordCase.set(state.keywordCase as KeywordCase);
      }
      if (typeof state.tabWidth === 'number' && Number.isFinite(state.tabWidth)) {
        this.tabWidth.set(Math.min(8, Math.max(1, Math.round(state.tabWidth))));
      }
      if (typeof state.useTabs === 'boolean') {
        this.useTabs.set(state.useTabs);
      }
    },
  });

  /** Formatted result, or an error string when the formatter rejects the input. */
  private readonly formatted = computed<{ output: string; error: string | null }>(() => {
    const text = this.input().trim();
    if (text === '') {
      return { output: '', error: null };
    }
    try {
      const output = format(this.input(), {
        language: this.dialect(),
        keywordCase: this.keywordCase(),
        tabWidth: this.tabWidth(),
        useTabs: this.useTabs(),
      });
      return { output, error: null };
    } catch (error) {
      return { output: '', error: error instanceof Error ? error.message : 'Could not format SQL.' };
    }
  });

  protected readonly output = computed(() => this.formatted().output);
  protected readonly error = computed(() => this.formatted().error);
  protected readonly hasOutput = computed(() => this.output().length > 0);

  protected onDialectChange(event: Event): void {
    this.dialect.set((event.target as HTMLSelectElement).value as SqlLanguage);
  }

  protected setKeywordCase(value: KeywordCase): void {
    this.keywordCase.set(value);
  }

  protected onTabWidthInput(event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(parsed)) {
      this.tabWidth.set(Math.min(8, Math.max(1, Math.round(parsed))));
    }
  }

  protected toggleTabs(): void {
    this.useTabs.update((value) => !value);
  }

  protected clear(): void {
    this.input.set('');
  }

  protected copy(): void {
    void this.clipboard.copy(this.output(), { message: 'Formatted SQL copied to clipboard' });
  }
}
