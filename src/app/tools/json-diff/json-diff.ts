import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { syncToolState } from '../../core/tool-state';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { SendTo } from '../../shared/send-to/send-to';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { TryExample } from '../../shared/try-example/try-example';
import { diffJson, type Change } from './semantic-diff';

type ViewMode = 'changes' | 'tree';

/**
 * "Try an example": one API response before and after a release. Keys are
 * reordered, a value changes type, a field is added, a field is removed and a
 * list is reordered — each of which a line diff would report differently from
 * what actually happened.
 */
const SAMPLE_ORIGINAL = `{
  "id": 4821,
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "plan": "free",
  "seats": "5",
  "roles": ["viewer", "editor"],
  "address": { "city": "London", "postcode": "W1A 1AA" },
  "legacyId": "u-4821"
}`;

const SAMPLE_CHANGED = `{
  "name": "Ada Lovelace",
  "id": 4821,
  "plan": "team",
  "seats": 5,
  "email": "ada@example.com",
  "roles": ["editor", "viewer", "admin"],
  "address": { "postcode": "W1A 1AA", "city": "London", "country": "GB" }
}`;

type Parsed = { value: unknown; error: null } | { value: null; error: string };

function parse(text: string): Parsed {
  if (text.trim() === '') {
    return { value: null, error: '' };
  }
  try {
    return { value: JSON.parse(text), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Not valid JSON.';
    return { value: null, error: message.charAt(0).toUpperCase() + message.slice(1) };
  }
}

@Component({
  selector: 'app-json-diff',
  imports: [
    ToolPage,
    ToolContent,
    CodeEditor,
    SendTo,
    ShareLink,
    TryExample,
    MatButtonModule,
    NgIcon,
  ],
  templateUrl: './json-diff.html',
  // The tree view is the Text Diff's unified grid, so it borrows that sheet.
  styleUrls: ['../tool-shell.css', '../text-diff/text-diff.css', './json-diff.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonDiffTool {
  protected readonly original = signal('');
  protected readonly changed = signal('');
  protected readonly view = signal<ViewMode>('changes');
  protected readonly ignoreArrayOrder = signal(false);

  protected readonly shared = syncToolState({
    key: 'json-diff',
    snapshot: () => ({
      original: this.original(),
      changed: this.changed(),
      view: this.view(),
      ignoreArrayOrder: this.ignoreArrayOrder(),
    }),
    restore: (state) => {
      if (typeof state.original === 'string') {
        this.original.set(state.original);
      }
      if (typeof state.changed === 'string') {
        this.changed.set(state.changed);
      }
      if (state.view === 'changes' || state.view === 'tree') {
        this.view.set(state.view);
      }
      if (typeof state.ignoreArrayOrder === 'boolean') {
        this.ignoreArrayOrder.set(state.ignoreArrayOrder);
      }
    },
  });

  private readonly left = computed(() => parse(this.original()));
  private readonly right = computed(() => parse(this.changed()));

  protected readonly leftError = computed(() => this.left().error);
  protected readonly rightError = computed(() => this.right().error);
  protected readonly hasInput = computed(
    () => this.original().trim() !== '' && this.changed().trim() !== '',
  );

  protected readonly result = computed(() => {
    const left = this.left();
    const right = this.right();
    if (!this.hasInput() || left.error || right.error) {
      return null;
    }
    return diffJson(left.value, right.value, { ignoreArrayOrder: this.ignoreArrayOrder() });
  });

  protected readonly identical = computed(() => this.result()?.changes.length === 0);

  protected setView(mode: ViewMode): void {
    this.view.set(mode);
  }

  protected toggleArrayOrder(): void {
    this.ignoreArrayOrder.update((value) => !value);
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

  protected loadExample(): void {
    this.original.set(SAMPLE_ORIGINAL);
    this.changed.set(SAMPLE_CHANGED);
  }

  /** A change's value, compact, for the list. */
  protected show(value: unknown): string {
    return JSON.stringify(value) ?? 'null';
  }

  protected pathOf(change: Change): string {
    return change.path === '' ? '(root)' : change.path;
  }
}
