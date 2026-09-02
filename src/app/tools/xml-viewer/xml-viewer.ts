import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgIcon } from '@ng-icons/core';
import type { Plugin } from 'prettier';

import { ClipboardService } from '../../core/clipboard.service';
import { downloadText } from '../../core/download';
import { syncToolState } from '../../core/tool-state';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { TryExample } from '../../shared/try-example/try-example';
import {
  findParseError,
  flatten,
  matches,
  statsFor,
  toNode,
  type XmlError,
  type XmlNode,
} from './xml-tools';

/** Reading a dropped file into memory, so cap it. */
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

type View = 'tree' | 'source';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<catalog updated="2026-08-31">
  <!-- Two books and a magazine, to show attributes, nesting and CDATA -->
  <book id="bk101" available="true">
    <author>Herbert, Frank</author>
    <title>Dune</title>
    <genre>Science fiction</genre>
    <price currency="GBP">9.99</price>
    <description><![CDATA[Politics & sand — the <definitive> desert epic.]]></description>
  </book>
  <book id="bk102" available="false">
    <author>Le Guin, Ursula K.</author>
    <title>The Dispossessed</title>
    <genre>Science fiction</genre>
    <price currency="GBP">8.50</price>
  </book>
  <magazine id="mg001">
    <title>Nature</title>
    <issue volume="640" number="8057" />
  </magazine>
</catalog>`;

@Component({
  selector: 'app-xml-viewer',
  imports: [
    ToolPage,
    ToolContent,
    CodeEditor,
    Dropzone,
    ShareLink,
    TryExample,
    MatButtonModule,
    NgIcon,
  ],
  templateUrl: './xml-viewer.html',
  styleUrls: ['../tool-shell.css', './xml-viewer.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XmlViewerTool {
  private readonly clipboard = inject(ClipboardService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly source = signal('');
  protected readonly view = signal<View>('tree');
  protected readonly filter = signal('');
  protected readonly xpath = signal('');
  protected readonly formatting = signal(false);

  protected readonly shared = syncToolState({
    key: 'xml-viewer',
    snapshot: () => ({ source: this.source(), view: this.view(), xpath: this.xpath() }),
    restore: (state) => {
      if (typeof state.source === 'string') {
        this.source.set(state.source);
      }
      if (state.view === 'tree' || state.view === 'source') {
        this.view.set(state.view);
      }
      if (typeof state.xpath === 'string') {
        this.xpath.set(state.xpath);
      }
    },
  });

  protected readonly hasSource = computed(() => this.source().trim().length > 0);

  /**
   * Parse on every change. `DOMParser` is browser-only, so this returns nothing
   * during the prerender — the page ships its empty state and fills in once the
   * browser takes over.
   */
  private readonly parsed = computed<{ root: XmlNode | null; error: XmlError | null }>(() => {
    const text = this.source().trim();
    if (text === '' || typeof DOMParser === 'undefined') {
      return { root: null, error: null };
    }
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const error = findParseError(doc);
    if (error) {
      return { root: null, error };
    }
    return {
      root: doc.documentElement ? toNode(doc.documentElement) : null,
      error: null,
    };
  });

  protected readonly error = computed(() => this.parsed().error);
  protected readonly root = computed(() => this.parsed().root);
  protected readonly valid = computed(() => this.hasSource() && this.error() === null && this.root() !== null);
  protected readonly stats = computed(() => statsFor(this.root()));

  /** Every node, flattened, then narrowed by the filter box. */
  protected readonly rows = computed(() => {
    const all = flatten(this.root());
    const query = this.filter();
    if (query.trim() === '') {
      return all;
    }
    return all.filter((node) => matches(node, query));
  });

  protected readonly filtered = computed(() => this.filter().trim() !== '');

  /** XPath results, as display strings. Re-evaluated whenever either changes. */
  protected readonly xpathResult = computed<{ items: string[]; error: string | null } | null>(
    () => {
      const expression = this.xpath().trim();
      const text = this.source().trim();
      if (expression === '' || text === '' || typeof DOMParser === 'undefined') {
        return null;
      }
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      if (findParseError(doc)) {
        return { items: [], error: 'Fix the XML before running a query.' };
      }
      try {
        const result = doc.evaluate(expression, doc, null, 5 /* ORDERED_NODE_ITERATOR */, null);
        const items: string[] = [];
        for (let node = result.iterateNext(); node; node = result.iterateNext()) {
          items.push(describe(node));
          if (items.length >= 200) {
            break;
          }
        }
        return { items, error: null };
      } catch (error) {
        return {
          items: [],
          error: error instanceof Error ? error.message : 'That is not a valid XPath expression.',
        };
      }
    },
  );

  protected setView(view: View): void {
    this.view.set(view);
  }

  protected onFilterInput(event: Event): void {
    this.filter.set((event.target as HTMLInputElement).value);
  }

  protected onXpathInput(event: Event): void {
    this.xpath.set((event.target as HTMLInputElement).value);
  }

  protected loadExample(): void {
    this.source.set(SAMPLE);
    this.xpath.set('//book/title');
  }

  protected clear(): void {
    this.source.set('');
    this.filter.set('');
    this.xpath.set('');
  }

  protected copy(): void {
    void this.clipboard.copy(this.source(), { message: 'XML copied to clipboard' });
  }

  protected download(): void {
    downloadText(this.source(), 'document.xml', 'application/xml');
  }

  protected async openFile(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) {
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.snackBar.open(`"${file.name}" is too large (max 10 MB).`, 'Dismiss', { duration: 6000 });
      return;
    }
    this.source.set(await file.text());
  }

  /**
   * Pretty-print with Prettier's XML plugin, which is already a dependency for
   * the Code Formatter. `xmlWhitespaceSensitivity: 'ignore'` is what lets it
   * re-indent a minified document; the default keeps whitespace verbatim and so
   * leaves one-line XML on one line.
   */
  protected async format(): Promise<void> {
    const text = this.source();
    if (text.trim() === '') {
      return;
    }
    this.formatting.set(true);
    try {
      const [{ format }, xml] = await Promise.all([
        import('prettier/standalone'),
        import('@prettier/plugin-xml') as Promise<{ default?: unknown }>,
      ]);
      const result = await format(text, {
        parser: 'xml',
        plugins: [(xml.default ?? xml) as Plugin],
        xmlWhitespaceSensitivity: 'ignore',
        tabWidth: 2,
      });
      this.source.set(result.replace(/\n$/, ''));
    } catch (error) {
      this.snackBar.open(
        error instanceof Error ? error.message.split('\n')[0] : 'Could not format that XML.',
        'Dismiss',
        { duration: 6000 },
      );
    } finally {
      this.formatting.set(false);
    }
  }
}

/** A one-line description of an XPath match, for the results list. */
function describe(node: Node): string {
  if (node.nodeType === 1) {
    const element = node as Element;
    const attrs = Array.from(element.attributes ?? [])
      .map((attr) => ` ${attr.name}="${attr.value}"`)
      .join('');
    const text = (element.textContent ?? '').trim().replace(/\s+/g, ' ');
    const inner = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    return element.children.length === 0
      ? `<${element.tagName}${attrs}>${inner}</${element.tagName}>`
      : `<${element.tagName}${attrs}> (${element.children.length} children)`;
  }
  if (node.nodeType === 2) {
    return `${node.nodeName}="${node.nodeValue ?? ''}"`;
  }
  return (node.nodeValue ?? '').trim();
}
