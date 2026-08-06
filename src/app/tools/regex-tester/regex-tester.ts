import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { RouterLink } from '@angular/router';

import { syncToolState } from '../../core/tool-state';
import { compile, run } from './regex-match';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';

interface FlagOption {
  key: string;
  label: string;
  hint: string;
}

/** One slice of the subject text, flagged as inside or outside a match. */
interface Segment {
  text: string;
  match: boolean;
}

const FLAGS: FlagOption[] = [
  { key: 'g', label: 'g', hint: 'global — find all matches' },
  { key: 'i', label: 'i', hint: 'ignore case' },
  { key: 'm', label: 'm', hint: 'multiline — ^ and $ match line breaks' },
  { key: 's', label: 's', hint: 'dotAll — . matches newlines' },
  { key: 'u', label: 'u', hint: 'unicode' },
  { key: 'y', label: 'y', hint: 'sticky' },
];

@Component({
  selector: 'app-regex-tester',
  imports: [ToolContent, CodeEditor, ShareLink, RouterLink, MatButtonModule, NgIcon],
  templateUrl: './regex-tester.html',
  styleUrls: ['../tool-shell.css', './regex-tester.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegexTesterTool {
  protected readonly flagOptions = FLAGS;

  protected readonly pattern = signal('');
  protected readonly text = signal('');
  private readonly enabledFlags = signal(new Set(['g', 'm']));

  protected readonly flagString = computed(() =>
    FLAGS.filter((flag) => this.enabledFlags().has(flag.key))
      .map((flag) => flag.key)
      .join(''),
  );

  /**
   * A pattern, its flags and the text it was tested against — which is exactly
   * what someone means when they say "look at this regex".
   *
   * Declared after `flagString` on purpose: field initialisers run in order, and
   * the snapshot reads it.
   *
   * Flags travel as the string the UI already shows (`gim`) rather than as a
   * Set, which JSON has no representation for.
   */
  protected readonly shared = syncToolState({
    key: 'regex-tester',
    snapshot: () => ({
      pattern: this.pattern(),
      flags: this.flagString(),
      text: this.text(),
    }),
    restore: (state) => {
      if (typeof state.pattern === 'string') {
        this.pattern.set(state.pattern);
      }
      if (typeof state.text === 'string') {
        this.text.set(state.text);
      }
      if (typeof state.flags === 'string') {
        const known = new Set(FLAGS.map((flag) => flag.key));
        this.enabledFlags.set(new Set([...state.flags].filter((flag) => known.has(flag))));
      }
    },
  });

  private readonly compiled = computed(() => compile(this.pattern(), this.flagString()));

  protected readonly error = computed(() => this.compiled().error);

  private readonly matchRun = computed(() => run(this.compiled().regex, this.text()));

  protected readonly matches = computed(() => this.matchRun().matches);
  protected readonly truncated = computed(() => this.matchRun().truncated);

  protected readonly hasPattern = computed(() => this.pattern().length > 0);

  /** Split the subject into highlighted (matched) and plain runs for display. */
  protected readonly segments = computed<Segment[]>(() => {
    const text = this.text();
    const matches = this.matches();
    if (!matches.length || text === '') {
      return text === '' ? [] : [{ text, match: false }];
    }

    const segments: Segment[] = [];
    let cursor = 0;
    for (const match of matches) {
      if (match.value === '') {
        continue; // Zero-width matches have nothing to highlight.
      }
      if (match.index > cursor) {
        segments.push({ text: text.slice(cursor, match.index), match: false });
      }
      const end = match.index + match.value.length;
      segments.push({ text: text.slice(match.index, end), match: true });
      cursor = end;
    }
    if (cursor < text.length) {
      segments.push({ text: text.slice(cursor), match: false });
    }
    return segments;
  });

  protected isFlagOn(key: string): boolean {
    return this.enabledFlags().has(key);
  }

  protected toggleFlag(key: string): void {
    this.enabledFlags.update((flags) => {
      const next = new Set(flags);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  protected onPatternInput(event: Event): void {
    this.pattern.set((event.target as HTMLInputElement).value);
  }

}
