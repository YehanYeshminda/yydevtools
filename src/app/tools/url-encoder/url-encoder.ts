import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { Mode, Scope, parseUrl, transform } from './url-codec';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { TryExample } from '../../shared/try-example/try-example';

/**
 * "Try an example": a full URL, percent-encoded, with two query parameters that
 * carry spaces and non-ASCII. Decoding it yields a readable address, and because
 * it parses as a URL the breakdown table lights up too — one click exercises the
 * mode tabs, the output and the inspector at once.
 */
const SAMPLE_INPUT =
  'https://example.com/search?q=caf%C3%A9%20m%C3%BCnchen&sort=updated%20desc#results';

@Component({
  selector: 'app-url-encoder',
  imports: [ToolPage, ToolContent, ShareLink, TryExample, MatButtonModule, NgIcon],
  templateUrl: './url-encoder.html',
  styleUrls: ['../tool-shell.css', './url-encoder.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UrlEncoderTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly input = signal('');
  protected readonly mode = signal<Mode>('encode');
  protected readonly scope = signal<Scope>('component');

  /**
   * The input, the direction and the scope — everything needed to reproduce the
   * result from a shared link. The input text stays in the fragment, which is
   * never sent to a server (see the privacy note on the page).
   */
  protected readonly shared = syncToolState({
    key: 'url-encoder',
    snapshot: () => ({ input: this.input(), mode: this.mode(), scope: this.scope() }),
    restore: (state) => {
      if (typeof state.input === 'string') {
        this.input.set(state.input);
      }
      if (state.mode === 'encode' || state.mode === 'decode') {
        this.mode.set(state.mode);
      }
      if (state.scope === 'component' || state.scope === 'full') {
        this.scope.set(state.scope);
      }
    },
  });

  protected readonly result = computed(() =>
    transform(this.input(), this.mode(), this.scope()),
  );

  /** The parts breakdown, shown whenever the input is an absolute URL. */
  protected readonly parts = computed(() => parseUrl(this.input()));

  protected readonly hasInput = computed(() => this.input().length > 0);

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  protected setScope(scope: Scope): void {
    this.scope.set(scope);
  }

  /**
   * Feed the result back into the input and flip the direction, so encode →
   * decode round-trips with one click. A no-op when the transform errored or
   * produced nothing.
   */
  protected swap(): void {
    const { output, error } = this.result();
    if (error || output === '') {
      return;
    }
    this.input.set(output);
    this.mode.update((mode) => (mode === 'encode' ? 'decode' : 'encode'));
  }

  protected clear(): void {
    this.input.set('');
  }

  /** Load the sample encoded URL and switch to decode so the output is readable. */
  protected loadExample(): void {
    this.input.set(SAMPLE_INPUT);
    this.mode.set('decode');
    this.scope.set('full');
  }

  protected copyOutput(): void {
    void this.clipboard.copy(this.result().output, { label: 'Result' });
  }

  protected copy(value: string, label: string): void {
    void this.clipboard.copy(value, { label });
  }
}
