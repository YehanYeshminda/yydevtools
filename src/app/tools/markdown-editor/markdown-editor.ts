import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { marked } from 'marked';

import { ClipboardService } from '../../core/clipboard.service';
import { ToolContent } from '../../shared/tool-content/tool-content';

const STARTER = `# Markdown Editor

Write **Markdown** on the left and see it rendered live on the right.

## Features

- Headings, **bold**, _italic_ and \`inline code\`
- Lists, links and blockquotes
- Tables and fenced code blocks

> Everything runs in your browser — nothing is uploaded.

\`\`\`ts
const greet = (name: string) => \`Hello, \${name}!\`;
\`\`\`

| Tool | Category |
| ---- | -------- |
| JSON Formatter | Developer |
| Base64 Converter | Converter |

[Back to all tools](/)
`;

@Component({
  selector: 'app-markdown-editor',
  imports: [ToolContent, RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './markdown-editor.html',
  styleUrl: './markdown-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkdownEditorTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly source = signal(STARTER);

  /** Rendered HTML for the preview. Bound via [innerHTML], which Angular sanitizes. */
  protected readonly html = computed(() => {
    try {
      return marked.parse(this.source(), { async: false, gfm: true, breaks: true }) as string;
    } catch {
      return '<p>Unable to render this Markdown.</p>';
    }
  });

  protected readonly charCount = computed(() => this.source().length);
  protected readonly wordCount = computed(() => {
    const words = this.source().trim().match(/\S+/g);
    return words ? words.length : 0;
  });

  protected onInput(event: Event): void {
    this.source.set((event.target as HTMLTextAreaElement).value);
  }

  protected copyHtml(): void {
    void this.clipboard.copy(this.html(), { message: 'HTML copied to clipboard' });
  }

  protected copyMarkdown(): void {
    void this.clipboard.copy(this.source(), { message: 'Markdown copied to clipboard' });
  }

  protected download(): void {
    const blob = new Blob([this.source()], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'document.md';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  protected clear(): void {
    this.source.set('');
  }
}
