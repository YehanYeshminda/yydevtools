import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { FileHandoff, type HandoffFile } from '../../core/file-handoff';

/** The tools a finished PDF can be carried into, and how the button reads. */
const LABELS = {
  'pdf-ocr': 'Make it searchable',
  'pdf-protect': 'Add a password',
  'pdf-sign': 'Sign it',
  'pdf-compress': 'Shrink it',
  'pdf-watermark': 'Watermark it',
} as const;

export type NextSlug = keyof typeof LABELS;

/**
 * The strip a file tool shows once it has produced something: the obvious
 * follow-on tools, one click each, with the result carried across so nobody
 * downloads a file only to drop it straight back in.
 */
@Component({
  selector: 'app-next-step',
  imports: [MatButtonModule, NgIcon],
  template: `
    @if (file(); as ready) {
      <div class="next" role="group" aria-label="Next step" data-testid="next-step">
        <span class="next__lead">
          <ng-icon aria-hidden="true" name="matArrowForwardOutline" />
          Next, with <strong>{{ ready.name }}</strong
          >:
        </span>
        @for (target of targets(); track target.slug) {
          <button matButton type="button" (click)="go(target.slug)">{{ target.label }}</button>
        }
      </div>
    }
  `,
  styles: `
    .next {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 0.5rem;
      padding: 0.6rem 0.9rem;
      border: 1px dashed var(--mat-sys-outline-variant);
      border-radius: 12px;
      background: var(--surface-1);
    }

    .next__lead {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      margin-right: 0.25rem;
      font-size: 0.9rem;
      color: var(--mat-sys-on-surface-variant);
      overflow-wrap: anywhere;
    }

    .next__lead strong {
      color: var(--mat-sys-on-surface);
      font-weight: 600;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NextStep {
  private readonly handoff = inject(FileHandoff);

  /** The finished document, or null while there is nothing to carry yet. */
  readonly file = input.required<HandoffFile | null>();
  readonly to = input.required<readonly NextSlug[]>();

  protected readonly targets = computed(() =>
    this.to().map((slug) => ({ slug, label: LABELS[slug] })),
  );

  protected go(slug: NextSlug): void {
    const file = this.file();
    if (file) {
      this.handoff.send(file, slug);
    }
  }
}
