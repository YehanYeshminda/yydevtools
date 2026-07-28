import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  OnDestroy,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

/** Path to the vendored pdf.js viewer (see public/pdfjs, from the pdf.js release). */
const VIEWER_PATH = '/pdfjs/web/viewer.html';

/**
 * Renders a PDF held in memory using the bundled pdf.js viewer.
 *
 * The bytes are wrapped in a same-origin blob URL and handed to the viewer in an
 * iframe — nothing is uploaded, and the document is rendered locally in the
 * page. The viewer brings its own toolbar, search, thumbnails and zoom.
 */
@Component({
  selector: 'app-pdf-preview',
  imports: [],
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

  protected readonly src = signal<SafeResourceUrl | null>(null);

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
      const url = `${VIEWER_PATH}?file=${encodeURIComponent(this.blobUrl)}`;
      this.src.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
    });
  }

  ngOnDestroy(): void {
    this.revoke();
  }

  private revoke(): void {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }
}
