import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import type { Plugin } from 'prettier';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { CodeEditor, type EditorLanguage } from '../../shared/code-editor/code-editor';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';

interface Lang {
  value: string;
  label: string;
  /** The Prettier parser this language formats with. */
  parser: string;
  /**
   * The editor's highlighting mode. Several Prettier parsers share one grammar
   * — SCSS and LESS highlight as CSS, JSON as JSON — and GraphQL has no mode
   * here, so it falls back to unhighlighted text rather than mis-colouring.
   */
  editor: EditorLanguage;
}

// The subset of Prettier's languages people reach for, each formatted by a
// standalone parser + plugin that is dynamically imported only when picked.
const LANGUAGES: Lang[] = [
  { value: 'html', label: 'HTML', parser: 'html', editor: 'html' },
  { value: 'css', label: 'CSS', parser: 'css', editor: 'css' },
  { value: 'scss', label: 'SCSS', parser: 'scss', editor: 'css' },
  { value: 'less', label: 'LESS', parser: 'less', editor: 'css' },
  { value: 'babel', label: 'JavaScript', parser: 'babel', editor: 'javascript' },
  { value: 'typescript', label: 'TypeScript', parser: 'typescript', editor: 'typescript' },
  { value: 'json', label: 'JSON', parser: 'json', editor: 'json' },
  { value: 'markdown', label: 'Markdown', parser: 'markdown', editor: 'markdown' },
  { value: 'yaml', label: 'YAML', parser: 'yaml', editor: 'yaml' },
  { value: 'graphql', label: 'GraphQL', parser: 'graphql', editor: 'text' },
  { value: 'xml', label: 'XML', parser: 'xml', editor: 'xml' },
];

const SAMPLE = `<section class="card"   id="hero">
<h1>Hello</h1>
    <p style="color:red">Unformatted   markup with   odd   spacing</p>
<a href="/x" class='link'>Link</a></section>`;

@Component({
  selector: 'app-code-formatter',
  imports: [ToolPage, ToolContent, CodeEditor, ShareLink, MatButtonModule, NgIcon],
  templateUrl: './code-formatter.html',
  styleUrls: ['../tool-shell.css', './code-formatter.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeFormatterTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly languages = LANGUAGES;

  protected readonly input = signal(SAMPLE);
  protected readonly language = signal('html');
  protected readonly tabWidth = signal(2);
  protected readonly useTabs = signal(false);
  protected readonly semi = signal(true);
  protected readonly singleQuote = signal(false);

  protected readonly shared = syncToolState({
    key: 'code-formatter',
    snapshot: () => ({
      input: this.input(),
      language: this.language(),
      tabWidth: this.tabWidth(),
      useTabs: this.useTabs(),
      semi: this.semi(),
      singleQuote: this.singleQuote(),
    }),
    restore: (state) => {
      if (typeof state.input === 'string') {
        this.input.set(state.input);
      }
      if (LANGUAGES.some((lang) => lang.value === state.language)) {
        this.language.set(state.language as string);
      }
      if (typeof state.tabWidth === 'number' && Number.isFinite(state.tabWidth)) {
        this.tabWidth.set(Math.min(8, Math.max(1, Math.round(state.tabWidth))));
      }
      if (typeof state.useTabs === 'boolean') {
        this.useTabs.set(state.useTabs);
      }
      if (typeof state.semi === 'boolean') {
        this.semi.set(state.semi);
      }
      if (typeof state.singleQuote === 'boolean') {
        this.singleQuote.set(state.singleQuote);
      }
    },
  });

  protected readonly output = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly hasOutput = computed(() => this.output().length > 0);
  /** Semicolons and quote style only affect the JS-family parsers. */
  protected readonly showJsOptions = computed(() =>
    ['babel', 'typescript'].includes(this.language()),
  );

  protected readonly editorLanguage = computed<EditorLanguage>(
    () => LANGUAGES.find((lang) => lang.value === this.language())?.editor ?? 'text',
  );

  protected onLanguageChange(event: Event): void {
    this.language.set((event.target as HTMLSelectElement).value);
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

  protected toggleSemi(): void {
    this.semi.update((value) => !value);
  }

  protected toggleSingleQuote(): void {
    this.singleQuote.update((value) => !value);
  }

  protected clear(): void {
    this.input.set('');
    this.output.set('');
    this.error.set(null);
  }

  /**
   * Format the input with Prettier. The engine and its per-language plugins are
   * ~1 MB, so they are dynamically imported here — nothing loads until the user
   * actually formats, and only the plugins for the chosen language are fetched.
   */
  protected async format(): Promise<void> {
    const source = this.input();
    if (source.trim() === '') {
      return;
    }
    const lang = LANGUAGES.find((l) => l.value === this.language());
    if (!lang) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      const [{ format }, plugins] = await Promise.all([
        import('prettier/standalone'),
        pluginsFor(lang.value),
      ]);
      const result = await format(source, {
        parser: lang.parser,
        plugins,
        tabWidth: this.tabWidth(),
        useTabs: this.useTabs(),
        semi: this.semi(),
        singleQuote: this.singleQuote(),
        // plugin-xml keeps whitespace verbatim by default, which leaves minified
        // XML minified; "ignore" lets it re-indent nested elements.
        ...(lang.value === 'xml' ? { xmlWhitespaceSensitivity: 'ignore' } : {}),
      });
      this.output.set(result.replace(/\n$/, ''));
    } catch (error) {
      this.output.set('');
      this.error.set(formatError(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected copy(): void {
    void this.clipboard.copy(this.output(), { message: 'Formatted code copied to clipboard' });
  }
}

// A Prettier standalone plugin is a module namespace (core plugins) or a
// default-exported object (plugin-xml). Either satisfies the `plugins` option
// structurally; the cast in pluginsFor() bridges the nominal type gap.
type PluginModule = unknown;

/** Per-language loaders. Each import is a literal so esbuild can code-split it. */
const PLUGIN_LOADERS: Record<string, () => Promise<PluginModule[]>> = {
  // HTML can embed CSS and JS, so it needs their plugins too.
  html: () =>
    Promise.all([
      import('prettier/plugins/html'),
      import('prettier/plugins/postcss'),
      import('prettier/plugins/babel'),
      import('prettier/plugins/estree'),
    ]),
  css: () => Promise.all([import('prettier/plugins/postcss')]),
  scss: () => Promise.all([import('prettier/plugins/postcss')]),
  less: () => Promise.all([import('prettier/plugins/postcss')]),
  babel: () =>
    Promise.all([import('prettier/plugins/babel'), import('prettier/plugins/estree')]),
  json: () =>
    Promise.all([import('prettier/plugins/babel'), import('prettier/plugins/estree')]),
  typescript: () =>
    Promise.all([import('prettier/plugins/typescript'), import('prettier/plugins/estree')]),
  markdown: () => Promise.all([import('prettier/plugins/markdown')]),
  yaml: () => Promise.all([import('prettier/plugins/yaml')]),
  graphql: () => Promise.all([import('prettier/plugins/graphql')]),
  xml: async () => {
    const xml = (await import('@prettier/plugin-xml')) as { default?: PluginModule };
    return [xml.default ?? xml];
  },
};

/** Dynamically load just the Prettier plugins the chosen language needs. */
async function pluginsFor(value: string): Promise<Plugin[]> {
  const loader = PLUGIN_LOADERS[value];
  const modules = loader ? await loader() : [];
  return modules as Plugin[];
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    // Prettier's syntax errors carry a helpful location; keep the first line.
    return error.message.split('\n')[0];
  }
  return 'Could not format that input.';
}
