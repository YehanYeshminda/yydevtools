import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';

import { createEditor, type EditorHandle, type EditorLanguage } from './code-editor.engine';

export type { EditorLanguage };

/**
 * The text box the tools type into: a CodeMirror 6 editor with line numbers,
 * syntax highlighting, bracket matching, undo history and Ctrl-F search.
 *
 * It degrades to a plain `<textarea>`, which matters more than it sounds. Every
 * tool page is prerendered, and the prerender has no DOM for CodeMirror to
 * mount into — so the textarea *is* the server-rendered markup, and the editor
 * replaces it once the browser has fetched the chunk. If that fetch fails the
 * textarea simply stays, and the tool still works. The two share the same
 * `value` model, so nothing above this component can tell which one is live.
 */
@Component({
  selector: 'app-code-editor',
  imports: [],
  template: `
    <div #host class="editor" [class.editor--live]="upgraded()"></div>
    @if (!upgraded()) {
      <textarea
        #fallback
        class="editor__fallback"
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        [attr.aria-label]="label()"
        [attr.placeholder]="placeholder() || null"
        [value]="value()"
        [readOnly]="readOnly()"
        (input)="onFallbackInput($event)"
      ></textarea>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* Hidden until CodeMirror has mounted, so the empty container never
         flashes above the textarea it is about to replace. */
      .editor {
        display: none;
      }

      .editor--live {
        display: block;
        height: 100%;
      }

      /* The fallback deliberately mirrors the geometry the editor's theme
         reads from the same properties, so the swap is not visible. */
      .editor__fallback {
        display: block;
        width: 100%;
        height: var(--cme-height, auto);
        min-height: var(--cme-min-height, 14rem);
        box-sizing: border-box;
        padding: 0.85rem 1rem;
        border: var(--cme-border, 1px solid var(--outline));
        border-radius: var(--cme-radius, var(--r-field));
        background: var(--surface);
        color: var(--on);
        font-family: var(--mono);
        font-size: 0.9rem;
        line-height: 1.5;
        resize: vertical;
      }

      .editor__fallback:focus {
        outline: none;
        border-color: var(--cme-focus-border, var(--primary));
        box-shadow: var(
          --cme-focus-ring,
          0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent)
        );
      }
    `,
  ],
  host: {
    '[style.--cme-min-height]': 'minHeight()',
    '[style.--cme-height]': 'height()',
    '[style.--cme-border]': 'frameless() ? "none" : null',
    '[style.--cme-radius]': 'frameless() ? "0" : null',
    '[style.--cme-focus-ring]': 'frameless() ? "none" : null',
    '[style.--cme-focus-border]': 'frameless() ? "transparent" : null',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeEditor implements OnDestroy {
  /** Two-way: bind with `[(value)]="someWritableSignal"`. */
  readonly value = model('');
  readonly language = input<EditorLanguage>('text');
  /** Accessible name. Required — neither the editor nor the fallback has a label. */
  readonly label = input.required<string>();
  readonly placeholder = input('');
  readonly readOnly = input(false);
  readonly minHeight = input('14rem');
  /** Set to `100%` to fill a flex or grid parent instead of sizing to content. */
  readonly height = input('auto');
  /** Drops the border, radius and focus ring, for an editor inside its own frame. */
  readonly frameless = input(false);
  readonly wrap = input(true);

  protected readonly upgraded = signal(false);

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly fallback = viewChild<ElementRef<HTMLTextAreaElement>>('fallback');

  private handle: EditorHandle | null = null;

  constructor() {
    afterNextRender(() => void this.upgrade());

    // Each signal is read BEFORE the optional call. With
    // `this.handle?.setValue(this.value())` the argument is skipped entirely
    // while `handle` is still null (optional chaining short-circuits argument
    // evaluation), so the effect's first run would track no signals and never
    // fire again — leaving the editor deaf to programmatic writes like
    // "Try an example", Clear and Swap.
    effect(() => {
      const value = this.value();
      this.handle?.setValue(value);
    });
    effect(() => {
      const language = this.language();
      void this.handle?.setLanguage(language);
    });
    effect(() => {
      const readOnly = this.readOnly();
      this.handle?.setReadOnly(readOnly);
    });
  }

  ngOnDestroy(): void {
    this.handle?.destroy();
    this.handle = null;
  }

  /** Move focus into whichever text box is live. */
  focus(): void {
    if (this.handle) {
      this.handle.focus();
    } else {
      this.fallback()?.nativeElement.focus();
    }
  }

  protected onFallbackInput(event: Event): void {
    this.value.set((event.target as HTMLTextAreaElement).value);
  }

  private async upgrade(): Promise<void> {
    // Carry focus across the swap, so upgrading under someone who has already
    // started typing does not silently drop them out of the field.
    const hadFocus = this.fallback()?.nativeElement === document.activeElement;

    try {
      this.handle = await createEditor({
        parent: this.host().nativeElement,
        value: this.value(),
        language: this.language(),
        placeholder: this.placeholder(),
        readOnly: this.readOnly(),
        label: this.label(),
        wrap: this.wrap(),
        onChange: (text) => this.value.set(text),
      });
    } catch {
      // The chunk could not be fetched. The textarea is already on screen and
      // fully functional, so there is nothing to report.
      return;
    }

    // Anything typed into the textarea while the chunk was in flight wins.
    this.handle.setValue(this.value());
    this.upgraded.set(true);
    if (hadFocus) {
      this.handle.focus();
    }
  }
}
