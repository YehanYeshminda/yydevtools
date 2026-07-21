import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  ADOBE_CLIENT_ID,
  AdobeEmbedMode,
  AdobeViewerService,
} from '../../core/adobe-viewer.service';

type State = 'idle' | 'loading' | 'ready' | 'error';

/** Adobe addresses its container by id, so each instance needs its own. */
let instanceCount = 0;

/**
 * Renders a PDF held in memory using the Adobe PDF Embed API.
 *
 * The bytes are handed straight to the viewer as an ArrayBuffer — nothing is
 * uploaded, and the document is rendered locally in the page.
 */
@Component({
  selector: 'app-pdf-preview',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './pdf-preview.html',
  styleUrl: './pdf-preview.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfPreview {
  private readonly viewer = inject(AdobeViewerService);

  /** The document to show. A new array reference re-renders the viewer. */
  readonly bytes = input.required<Uint8Array>();
  readonly fileName = input('document.pdf');
  readonly embedMode = input<AdobeEmbedMode>('SIZED_CONTAINER');
  readonly showDownload = input(false);
  readonly showPrint = input(false);
  /** Container height. `FULL_WINDOW` needs a tall box to be usable. */
  readonly height = input('34rem');

  protected readonly containerId = `adobe-pdf-preview-${++instanceCount}`;
  protected readonly state = signal<State>('idle');

  private readonly host = viewChild<ElementRef<HTMLDivElement>>('host');
  private requestId = 0;

  constructor() {
    effect(() => {
      const host = this.host();
      const bytes = this.bytes();
      const name = this.fileName();
      const mode = this.embedMode();
      const download = this.showDownload();
      const print = this.showPrint();
      if (host) {
        void this.render(host.nativeElement, bytes, name, mode, download, print);
      }
    });
  }

  protected retry(): void {
    const host = this.host();
    if (host) {
      void this.render(
        host.nativeElement,
        this.bytes(),
        this.fileName(),
        this.embedMode(),
        this.showDownload(),
        this.showPrint(),
      );
    }
  }

  private async render(
    host: HTMLDivElement,
    bytes: Uint8Array,
    fileName: string,
    embedMode: AdobeEmbedMode,
    showDownloadPDF: boolean,
    showPrintPDF: boolean,
  ): Promise<void> {
    // A viewer that resolves late must not paint over a newer document.
    const token = ++this.requestId;
    this.state.set('loading');

    try {
      const View = await this.viewer.load();
      if (token !== this.requestId) {
        return;
      }

      // Adobe appends its own iframe; clear the previous one before re-rendering.
      host.replaceChildren();

      const view = new View({ clientId: ADOBE_CLIENT_ID, divId: this.containerId });
      await view.previewFile(
        {
          // Copy into a fresh buffer — the viewer holds on to it, and the
          // caller's array may be a view over shared memory.
          content: { promise: Promise.resolve(bytes.slice().buffer) },
          metaData: { fileName },
        },
        {
          embedMode,
          showDownloadPDF,
          showPrintPDF,
          showAnnotationTools: false,
        },
      );

      if (token === this.requestId) {
        this.state.set('ready');
      }
    } catch {
      if (token === this.requestId) {
        this.state.set('error');
      }
    }
  }
}
