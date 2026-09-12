import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

/** A finished document, ready to be carried into another tool. */
export interface HandoffFile {
  bytes: Uint8Array;
  name: string;
}

/**
 * Carries a finished file from one tool straight into the next.
 *
 * The file is parked here for exactly one navigation: the source tool calls
 * `send`, the router opens the target tool, and the target's constructor calls
 * `take` and loads the file as if it had been dropped in. Nothing is written to
 * storage and nothing survives a reload — a reload is the user starting over.
 */
@Injectable({ providedIn: 'root' })
export class FileHandoff {
  private readonly router = inject(Router);
  private pending: File | null = null;

  send(file: HandoffFile, slug: string): void {
    this.pending = new File([file.bytes.slice()], file.name, { type: 'application/pdf' });
    void this.router.navigate(['/tools', slug]);
  }

  /** The file parked by the previous tool, if this navigation brought one. */
  take(): File | null {
    const file = this.pending;
    this.pending = null;
    return file;
  }
}
