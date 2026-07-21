import { Injectable } from '@angular/core';

/**
 * Adobe PDF Embed API client ID.
 *
 * This is a public credential by design — it ships in the browser bundle and is
 * only accepted on the domains registered for it in the Adobe developer
 * console. Every host that should render previews (production plus `localhost`
 * for development) has to be on that allowlist or the viewer refuses to load.
 */
export const ADOBE_CLIENT_ID = '7719c603ba854e4aa086abe861ca51b8';

const VIEWER_SRC = 'https://acrobatservices.adobe.com/view-sdk/viewer.js';

/** How much of Adobe's own chrome the viewer draws around the document. */
export type AdobeEmbedMode = 'SIZED_CONTAINER' | 'FULL_WINDOW' | 'IN_LINE' | 'LIGHT_BOX';

export interface AdobePreviewConfig {
  embedMode: AdobeEmbedMode;
  showDownloadPDF?: boolean;
  showPrintPDF?: boolean;
  showAnnotationTools?: boolean;
  showLeftHandPanel?: boolean;
  defaultViewMode?: 'FIT_PAGE' | 'FIT_WIDTH' | 'TWO_COLUMN' | 'CONTINUOUS';
}

export interface AdobePreviewFile {
  content: { promise: Promise<ArrayBuffer> };
  metaData: { fileName: string };
}

export interface AdobeDCView {
  previewFile(file: AdobePreviewFile, config: AdobePreviewConfig): Promise<unknown>;
}

export type AdobeDCViewConstructor = new (options: {
  clientId: string;
  divId: string;
}) => AdobeDCView;

declare global {
  interface Window {
    AdobeDC?: { View?: AdobeDCViewConstructor };
  }
}

/**
 * Loads the Adobe PDF Embed SDK on demand, once per page.
 *
 * The script is only fetched the first time a tool actually needs to render a
 * PDF, so pages that never show a preview pay nothing for it.
 */
@Injectable({ providedIn: 'root' })
export class AdobeViewerService {
  private pending: Promise<AdobeDCViewConstructor> | null = null;

  load(): Promise<AdobeDCViewConstructor> {
    if (this.pending) {
      return this.pending;
    }

    const pending = new Promise<AdobeDCViewConstructor>((resolve, reject) => {
      const ready = window.AdobeDC?.View;
      if (ready) {
        resolve(ready);
        return;
      }

      // The SDK announces itself on `document` once its globals exist; listening
      // covers the case where another component already injected the script.
      document.addEventListener(
        'adobe_dc_view_sdk.ready',
        () => {
          const view = window.AdobeDC?.View;
          if (view) {
            resolve(view);
          } else {
            reject(new Error('Adobe viewer loaded without a View constructor.'));
          }
        },
        { once: true },
      );

      if (document.querySelector(`script[src="${VIEWER_SRC}"]`)) {
        return;
      }
      const script = document.createElement('script');
      script.src = VIEWER_SRC;
      script.async = true;
      script.onerror = () => reject(new Error('Could not load the Adobe PDF viewer.'));
      document.head.appendChild(script);
    });

    // Drop the cached promise on failure so a later attempt can retry, rather
    // than every future preview inheriting one transient network error.
    pending.catch(() => {
      if (this.pending === pending) {
        this.pending = null;
      }
    });

    this.pending = pending;
    return pending;
  }
}
