import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { NgIcon } from '@ng-icons/core';
import { MatInputModule } from '@angular/material/input';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { Language, generate } from './type-generator';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { TryExample } from '../../shared/try-example/try-example';

/** The languages a restored link is allowed to select. */
const LANGUAGES: readonly Language[] = [
  'typescript',
  'csharp',
  'python',
  'go',
  'zod',
  'rust',
  'kotlin',
  'java',
  'jsonschema',
  'pydantic',
];

/** Human labels for the output box, keyed by the language toggle value. */
const LANGUAGE_LABELS: Record<Language, string> = {
  typescript: 'TypeScript',
  csharp: 'C#',
  python: 'Python',
  go: 'Go',
  zod: 'Zod',
  rust: 'Rust',
  kotlin: 'Kotlin',
  java: 'Java',
  jsonschema: 'JSON Schema',
  pydantic: 'Pydantic',
};

/** Either the generated source, or the parse error to show instead. */
type Result = { ok: true; code: string } | { ok: false; message: string } | { ok: null };

const SAMPLE = `{
  "id": 128,
  "name": "Ada Lovelace",
  "active": true,
  "score": 99.5,
  "nickname": null,
  "tags": ["engineer", "mathematician"],
  "address": { "city": "London", "postcode": "W1J 9BW" },
  "posts": [
    { "title": "Notes", "views": 12 },
    { "title": "On the Engine", "views": 40, "pinned": true }
  ]
}`;

@Component({
  selector: 'app-json-to-types',
  imports: [ToolPage, ToolContent,
    ShareLink,
    TryExample,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    NgIcon,
    MatInputModule,
  ],
  templateUrl: './json-to-types.html',
  styleUrls: ['../tool-shell.css', './json-to-types.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonToTypesTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly input = signal('');
  protected readonly language = signal<Language>('typescript');
  protected readonly rootName = signal('Root');

  protected readonly shared = syncToolState({
    key: 'json-to-types',
    snapshot: () => ({
      input: this.input(),
      language: this.language(),
      rootName: this.rootName(),
    }),
    restore: (state) => {
      if (typeof state.input === 'string') {
        this.input.set(state.input);
      }
      if (LANGUAGES.includes(state.language as Language)) {
        this.language.set(state.language as Language);
      }
      if (typeof state.rootName === 'string') {
        this.rootName.set(state.rootName);
      }
    },
  });

  /**
   * Generation is cheap and pure, so it runs on every keystroke rather than
   * behind a button — the output tracks what you paste.
   */
  protected readonly result = computed<Result>(() => {
    const text = this.input().trim();
    if (text === '') {
      return { ok: null };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return { ok: false, message: parseErrorMessage(error) };
    }
    return {
      ok: true,
      code: generate(parsed, { language: this.language(), rootName: this.rootName() }),
    };
  });

  protected readonly code = computed(() => {
    const result = this.result();
    return result.ok === true ? result.code : '';
  });

  protected readonly languageLabel = computed(() => LANGUAGE_LABELS[this.language()]);

  protected readonly error = computed(() => {
    const result = this.result();
    return result.ok === false ? result.message : '';
  });

  /** Rows for the output box, so short results don't leave a tall empty field. */
  protected readonly outputRows = computed(() =>
    Math.min(24, Math.max(8, this.code().split('\n').length + 1)),
  );

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onRootNameInput(event: Event): void {
    this.rootName.set((event.target as HTMLInputElement).value);
  }

  protected setLanguage(value: Language): void {
    this.language.set(value);
  }

  protected loadExample(): void {
    this.input.set(SAMPLE);
  }

  protected clear(): void {
    this.input.set('');
  }

  protected copy(): void {
    void this.clipboard.copy(this.code());
  }
}

/** Turn a JSON.parse exception into a readable, capitalised message. */
function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'That input is not valid JSON.';
  }
  const message = error.message.replace(/^JSON\.parse:\s*/i, '');
  return message.charAt(0).toUpperCase() + message.slice(1);
}
