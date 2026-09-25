import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

import type { Tool } from '../tools/tool.model';
import { TOOLS } from '../tools/tools.data';
import { FileHandoff } from './file-handoff';

/** The fragment parameter naming the tool a Send to or Open in came from. */
const FROM_KEY = 'from';

export function fromFragment(slug: string): string {
  return `${FROM_KEY}=${encodeURIComponent(slug)}`;
}

/**
 * The tool `hash` says this page was sent from, or null.
 *
 * The fragment is untrusted — anyone can edit it — so only a built tool from
 * the catalogue counts, and never the page itself.
 */
export function sentFrom(hash: string, here: string): Tool | null {
  const slug = new URLSearchParams(hash.replace(/^#/, '')).get(FROM_KEY);
  const tool = TOOLS.find((entry) => entry.slug === slug);
  return tool?.ready && tool.slug !== here ? tool : null;
}

/**
 * The way back after Send to or Open in.
 *
 * Text tools need nothing from here to come back as they were: they save their
 * state to the tab's session storage (tool-state.ts), and open without a `#s=`
 * they restore from it. Tools whose state is a file cannot, so the file they
 * were showing is kept here, in memory, and handed back to them on return —
 * they reload it as if it had been dropped in again. Like FileHandoff, nothing
 * is written anywhere, and a reload forgets it.
 */
@Injectable({ providedIn: 'root' })
export class ReturnTrip {
  private readonly router = inject(Router);
  private readonly handoff = inject(FileHandoff);

  /** The file each tool reloads when you come back to it. */
  private readonly files = new Map<string, File>();
  /** Where each tool was itself sent from, so Back can be followed more than one step. */
  private readonly origins = new Map<string, string>();
  /** State a tool cannot put in session storage because it is too large. */
  private readonly parked = new Map<string, unknown>();

  /** Called as Send to or Open in leaves `slug`. Text tools pass no file. */
  leave(slug: string, file: File | null): void {
    if (file) {
      this.files.set(slug, file);
    } else {
      this.files.delete(slug);
    }
  }

  /** Called by the masthead of a tool that was sent here from `from`. */
  arrived(slug: string, from: string): void {
    this.origins.set(slug, from);
  }

  /** Holds `state` until the tool's next visit (see `unpark`). */
  park(slug: string, state: unknown): void {
    this.parked.set(slug, state);
  }

  unpark(slug: string): unknown {
    const state = this.parked.get(slug);
    this.parked.delete(slug);
    return state;
  }

  back(slug: string): void {
    const origin = this.origins.get(slug);
    const fragment = origin ? fromFragment(origin) : undefined;
    const file = this.files.get(slug);
    if (file) {
      this.handoff.sendFile(file, slug, fragment);
    } else {
      void this.router.navigate(['/tools', slug], { fragment });
    }
  }
}
