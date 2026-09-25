import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

/** A finished document, ready to be carried into another tool. */
export interface HandoffFile {
  bytes: Uint8Array;
  name: string;
}

/**
 * Carries a file from one place straight into a tool.
 *
 * The file is parked here for exactly one navigation: the source calls `send`
 * (a finished PDF from another tool) or `sendFile` (something dropped on the
 * page), the router opens the target tool, and the target picks it up with
 * `take` and loads it as if it had been dropped in. Nothing is written to
 * storage and nothing survives a reload — a reload is the user starting over.
 */
@Injectable({ providedIn: 'root' })
export class FileHandoff {
  private readonly router = inject(Router);
  private pending: File | null = null;

  send(file: HandoffFile, slug: string): void {
    this.sendFile(new File([file.bytes.slice()], file.name, { type: 'application/pdf' }), slug);
  }

  sendFile(file: File, slug: string, fragment?: string): void {
    this.pending = file;
    void this.router.navigate(['/tools', slug], { fragment });
  }

  /** The file parked by the previous page, if this navigation brought one. */
  take(): File | null {
    const file = this.pending;
    this.pending = null;
    return file;
  }
}
