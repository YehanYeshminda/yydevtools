import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { CaseKind, convert } from './case';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';

interface CaseRow {
  kind: CaseKind;
  label: string;
  value: string;
}

const CASES: { kind: CaseKind; label: string }[] = [
  { kind: 'camel', label: 'camelCase' },
  { kind: 'pascal', label: 'PascalCase' },
  { kind: 'snake', label: 'snake_case' },
  { kind: 'constant', label: 'CONSTANT_CASE' },
  { kind: 'kebab', label: 'kebab-case' },
  { kind: 'title', label: 'Title Case' },
  { kind: 'sentence', label: 'Sentence case' },
  { kind: 'lower', label: 'lower case' },
  { kind: 'upper', label: 'UPPER CASE' },
  { kind: 'slug', label: 'url-slug' },
];

@Component({
  selector: 'app-case-converter',
  imports: [ToolContent, ShareLink, RouterLink, MatButtonModule, NgIcon],
  templateUrl: './case-converter.html',
  styleUrls: ['../tool-shell.css', './case-converter.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseConverterTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly input = signal('helloWorld example_string');

  protected readonly shared = syncToolState({
    key: 'case-converter',
    snapshot: () => ({ input: this.input() }),
    restore: (state) => {
      if (typeof state.input === 'string') {
        this.input.set(state.input);
      }
    },
  });

  protected readonly rows = computed<CaseRow[]>(() => {
    const text = this.input();
    return CASES.map(({ kind, label }) => ({ kind, label, value: convert(text, kind) }));
  });

  protected readonly hasInput = computed(() => this.input().trim().length > 0);

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected clear(): void {
    this.input.set('');
  }

  protected copy(value: string, label: string): void {
    void this.clipboard.copy(value, { label });
  }
}
