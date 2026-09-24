import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { downloadText } from '../../core/download';
import { syncToolState } from '../../core/tool-state';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { SendTo } from '../../shared/send-to/send-to';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { TryExample } from '../../shared/try-example/try-example';
import { convert, type Format } from './toml-convert';

const FORMATS: { value: Format; label: string }[] = [
  { value: 'toml', label: 'TOML' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
];

const MIME: Record<Format, string> = {
  toml: 'application/toml',
  json: 'application/json',
  yaml: 'application/yaml',
};

const SAMPLE = `# A Rust crate's Cargo.toml
[package]
name = "weather-cli"
version = "0.3.1"
edition = "2021"
authors = ["Ada <ada@example.com>"]

[dependencies]
serde = { version = "1.0", features = ["derive"] }
reqwest = "0.12"

[profile.release]
lto = true
opt-level = 3

[[bin]]
name = "weather"
path = "src/main.rs"
`;

@Component({
  selector: 'app-toml-converter',
  imports: [ToolPage, ToolContent, CodeEditor, SendTo, ShareLink, TryExample, MatButtonModule, NgIcon],
  templateUrl: './toml-converter.html',
  styleUrls: ['../tool-shell.css', './toml-converter.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TomlConverterTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly formats = FORMATS;

  protected readonly text = signal('');
  protected readonly from = signal<Format>('toml');
  protected readonly to = signal<Format>('json');

  /**
   * A share link carries all three. Text handed over by Send to arrives alone,
   * so its format is worked out from the text itself.
   */
  protected readonly shared = syncToolState({
    key: 'toml-converter',
    snapshot: () => ({ text: this.text(), from: this.from(), to: this.to() }),
    restore: (state) => {
      if (typeof state.text !== 'string') {
        return;
      }
      this.text.set(state.text);
      const from = isFormat(state.from) ? state.from : guessFormat(state.text);
      this.from.set(from);
      this.to.set(isFormat(state.to) && state.to !== from ? state.to : from === 'toml' ? 'json' : 'toml');
    },
  });

  private readonly result = computed(() => convert(this.text(), this.from(), this.to()));

  protected readonly output = computed(() => this.result().output);
  protected readonly warnings = computed(() => this.result().warnings);
  protected readonly problem = computed(() => {
    const problem = this.result().problem;
    if (!problem) {
      return '';
    }
    const where = problem.line ? ` (line ${problem.line}, column ${problem.column})` : '';
    return `${problem.message}${where}`;
  });

  protected readonly fromLabel = computed(() => label(this.from()));
  protected readonly toLabel = computed(() => label(this.to()));

  protected setFrom(format: Format): void {
    if (format === this.to()) {
      this.to.set(this.from());
    }
    this.from.set(format);
  }

  protected setTo(format: Format): void {
    if (format === this.from()) {
      this.from.set(this.to());
    }
    this.to.set(format);
  }

  /** Output becomes input, the other way round — so a round trip is one click. */
  protected swap(): void {
    const output = this.output();
    const from = this.from();
    this.from.set(this.to());
    this.to.set(from);
    if (output) {
      this.text.set(output);
    }
  }

  protected copy(): void {
    void this.clipboard.copy(this.output(), { label: this.toLabel() });
  }

  protected download(): void {
    downloadText(this.output(), `converted.${this.to()}`, MIME[this.to()]);
  }

  protected loadExample(): void {
    this.text.set(SAMPLE);
    this.from.set('toml');
    this.to.set('json');
  }
}

function isFormat(value: unknown): value is Format {
  return value === 'toml' || value === 'json' || value === 'yaml';
}

/** JSON if it parses as JSON, then TOML if it converts cleanly, else YAML. */
function guessFormat(text: string): Format {
  if (!convert(text, 'json', 'yaml').problem) {
    return 'json';
  }
  return convert(text, 'toml', 'json').problem ? 'yaml' : 'toml';
}

function label(format: Format): string {
  return FORMATS.find((item) => item.value === format)!.label;
}
