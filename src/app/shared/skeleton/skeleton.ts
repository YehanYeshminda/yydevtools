import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * A shimmering placeholder shown while a tool downloads a heavy code-split chunk
 * — Prettier's TypeScript plugin (~900 kB), the HEIC decoder (~3 MB) — so the
 * page reads as "working" rather than frozen during the wait.
 *
 * Two shapes. With `lines` set it draws that many text-line bars of varied
 * width, which stands in for a block of code or text. Without it, it fills its
 * container as a single block — size it from the parent — which stands in for a
 * thumbnail or preview.
 *
 * Purely decorative: it is `aria-hidden`, and the element that shows it is
 * expected to carry the `role="status"` and the visible or labelled message.
 */
@Component({
  selector: 'app-skeleton',
  imports: [],
  template: `
    @if (lines(); as count) {
      <div class="lines">
        @for (width of widths(); track $index) {
          <span class="bar" [style.width.%]="width"></span>
        }
      </div>
    } @else {
      <span class="block"></span>
    }
  `,
  host: {
    class: 'app-skeleton',
    'aria-hidden': 'true',
  },
  styles: `
    :host {
      display: block;
    }

    .lines {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }

    .bar,
    .block {
      display: block;
      border-radius: 6px;
      /* A moving highlight over a muted base. Both stops are theme tokens, so it
         reads correctly in light and dark without a second definition. */
      background:
        linear-gradient(
          90deg,
          var(--mat-sys-surface-container-high) 25%,
          var(--mat-sys-surface-container-highest) 37%,
          var(--mat-sys-surface-container-high) 63%
        );
      background-size: 400% 100%;
      animation: skeleton-shimmer 1.4s ease-in-out infinite;
    }

    .bar {
      height: 0.85rem;
    }

    .block {
      width: 100%;
      height: 100%;
      /* A floor for containers with no explicit height; a sized host (a thumb, a
         preview frame) overrides it via its own height. */
      min-height: 2.5rem;
      border-radius: 12px;
    }

    @keyframes skeleton-shimmer {
      0% {
        background-position: 100% 0;
      }
      100% {
        background-position: 0 0;
      }
    }

    /* A moving skeleton is the whole point, but honour a reduced-motion
       preference by holding a static muted block instead. */
    @media (prefers-reduced-motion: reduce) {
      .bar,
      .block {
        animation: none;
        background: var(--mat-sys-surface-container-high);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Skeleton {
  /** Number of text-line bars to draw; leave unset for a single filling block. */
  readonly lines = input<number | null>(null);

  /**
   * Bar widths as percentages, cycled from a fixed pattern so successive lines
   * look uneven like real text. Deterministic on purpose — no `Math.random`,
   * which is unavailable during prerender and would risk a hydration mismatch.
   */
  protected readonly widths = computed(() => {
    const count = this.lines() ?? 0;
    const pattern = [96, 82, 90, 68, 94, 74, 88, 60];
    return Array.from({ length: count }, (_, index) => pattern[index % pattern.length]);
  });
}
