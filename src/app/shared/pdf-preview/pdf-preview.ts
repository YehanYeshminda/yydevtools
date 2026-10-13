import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NgIcon } from '@ng-icons/core';

/** Path to the vendored pdf.js viewer (see public/pdfjs, from the pdf.js release). */
const VIEWER_PATH = '/pdfjs/web/viewer.html';

/**
 * Renders a PDF held in memory using the bundled pdf.js viewer.
 *
 * The bytes are wrapped in a same-origin blob URL and handed to the viewer in an
 * iframe — nothing is uploaded, and the document is rendered locally in the
 * page. The viewer brings its own toolbar, search, thumbnails and zoom.
 *
 * A "Full screen" button below the viewer puts it on the whole screen, for
 * when the box on the page is too small to read the document comfortably.
 */
@Component({
  selector: 'app-pdf-preview',
  imports: [MatButtonModule, NgIcon],
  templateUrl: './pdf-preview.html',
  styleUrl: './pdf-preview.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfPreview implements OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);

  /** The document to show. A new array reference re-renders the viewer. */
  readonly bytes = input.required<Uint8Array>();
  /** Kept for the call sites; the viewer derives its own labels from the file. */
  readonly fileName = input('document.pdf');
  /** Container height. */
  readonly height = input('34rem');
  /**
   * The zoom pdf.js opens at, as its `#zoom=` open parameter (`page-fit` shows
   * the whole page). Null keeps the viewer's default, which fits the width.
   */
  readonly zoom = input<string | null>(null);

  protected readonly src = signal<SafeResourceUrl | null>(null);
  /** Whether this browser can put an element on the full screen (iPhone Safari cannot). */
  protected readonly canFullscreen = signal(false);
  protected readonly fullscreen = signal(false);

  /** The whole preview goes full screen, so its bar and exit button come along. */
  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');
  private readonly onFullscreenChange = () =>
    this.fullscreen.set(document.fullscreenElement === this.root().nativeElement);

  /** The current blob URL, held so it can be revoked when it is replaced. */
  private blobUrl: string | null = null;

  constructor() {
    effect(() => {
      const bytes = this.bytes();
      // createObjectURL only exists in the browser; these tool pages prerender
      // without a file, so this effect never needs to run on the server.
      if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        return;
      }
      this.revoke();
      // Copy into a fresh buffer — the caller's array may be a view over shared
      // memory that outlives this preview.
      const blob = new Blob([bytes.slice()], { type: 'application/pdf' });
      this.blobUrl = URL.createObjectURL(blob);
      const zoom = this.zoom();
      const hash = zoom ? `#zoom=${encodeURIComponent(zoom)}` : '';
      const url = `${VIEWER_PATH}?file=${encodeURIComponent(this.blobUrl)}${hash}`;
      this.src.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
    });

    // Browser-only, and after hydration so the prerendered markup still matches.
    afterNextRender(() => {
      this.canFullscreen.set(document.fullscreenEnabled === true);
      document.addEventListener('fullscreenchange', this.onFullscreenChange);
    });
  }

  protected toggleFullscreen(): void {
    if (this.fullscreen()) {
      void document.exitFullscreen();
    } else {
      void this.root().nativeElement.requestFullscreen();
    }
  }

  ngOnDestroy(): void {
    this.revoke();
    if (typeof document !== 'undefined') {
      document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    }
  }

  private revoke(): void {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }
}
