import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * The small ring shown while a tool is working.
 *
 * It replaces `mat-spinner`, which renders as a block-level SVG and so pushed
 * the label of a button onto its own line. This one is an inline-block ring
 * drawn in `currentColor`, so it lines up with the text beside it and picks up
 * the muted colour of a disabled button on its own.
 *
 * It is decorative — the visible label ("Compressing…") or the `role="status"`
 * wrapper around it carries the message for assistive technology.
 */
@Component({
  selector: 'app-spinner',
  imports: [],
  template: '',
  host: {
    class: 'app-spinner',
    'aria-hidden': 'true',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.borderWidth.px]': 'stroke()',
  },
  styles: `
    :host {
      display: inline-block;
      flex: none;
      box-sizing: border-box;
      vertical-align: middle;
      border-style: solid;
      border-color: currentColor;
      border-top-color: color-mix(in srgb, currentColor 20%, transparent);
      border-right-color: color-mix(in srgb, currentColor 55%, transparent);
      border-radius: 50%;
      animation: app-spinner-rotate 0.7s linear infinite;
    }

    @keyframes app-spinner-rotate {
      to {
        transform: rotate(360deg);
      }
    }

    /* Keep it turning — a frozen ring reads as broken — but calm it right down. */
    @media (prefers-reduced-motion: reduce) {
      :host {
        animation-duration: 2.4s;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Spinner {
  /** Outer diameter in pixels. */
  readonly size = input(18);

  /** Ring thickness, scaled to the diameter so large spinners are not spindly. */
  protected readonly stroke = computed(() => Math.max(2, Math.round(this.size() / 9)));
}
