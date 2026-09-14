import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { toolForFile } from '../../core/drop-targets';
import { FileHandoff } from '../../core/file-handoff';
import { TOOLS } from '../../tools/tools.data';

/**
 * Drop a file anywhere on the page, not only onto the dashed zone.
 *
 * Without this, a drop that misses the zone makes the browser navigate to the
 * file and the site is gone. Now a drag carrying files lights the whole page
 * up and says where the file will land:
 *
 *  - on a page with a file input, the drop is fed to that input, so the tool
 *    behaves exactly as if the zone had been hit;
 *  - anywhere else, the file's type picks the tool and the handoff service
 *    carries the file across the navigation.
 *
 * A drop something else already handled — the zone itself, or an editor
 * taking a text file — arrives with `defaultPrevented` set and is left alone.
 * Drags without files (a text selection, a link) are ignored throughout.
 */
@Component({
  selector: 'app-global-drop',
  template: `
    @if (over()) {
      <div class="veil" role="status" aria-live="polite">
        <p class="veil__text">{{ message() }}</p>
      </div>
    }
  `,
  styles: [
    `
      .veil {
        position: fixed;
        inset: 0;
        z-index: 900;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        pointer-events: none;
        background: color-mix(in srgb, var(--bg) 88%, transparent);
        outline: 3px dashed var(--brand);
        outline-offset: -1rem;
      }

      .veil__text {
        margin: 0;
        padding: 0.75rem 1.25rem;
        border-radius: 999px;
        background: var(--brand);
        color: var(--on-brand);
        font-weight: 600;
        text-align: center;
      }
    `,
  ],
  host: {
    '(document:dragenter)': 'onDragEnter($event)',
    '(document:dragover)': 'onDragOver($event)',
    '(document:dragleave)': 'onDragLeave($event)',
    '(document:drop)': 'onDrop($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalDrop {
  private readonly handoff = inject(FileHandoff);

  protected readonly over = signal(false);
  protected readonly message = signal('');

  /** dragenter/dragleave fire per element crossed; only zero means "left the page". */
  private depth = 0;

  protected onDragEnter(event: DragEvent): void {
    if (!hasFiles(event)) {
      return;
    }
    this.depth++;
    if (this.depth === 1) {
      this.message.set(this.describe(event));
      this.over.set(true);
    }
  }

  protected onDragOver(event: DragEvent): void {
    if (!hasFiles(event)) {
      return;
    }
    // Without this the browser opens the file on drop instead of firing `drop`.
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onDragLeave(event: DragEvent): void {
    if (!hasFiles(event)) {
      return;
    }
    this.depth = Math.max(0, this.depth - 1);
    if (this.depth === 0) {
      this.over.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    this.depth = 0;
    this.over.set(false);
    const files = event.dataTransfer?.files;
    if (event.defaultPrevented || !files?.length) {
      return;
    }
    event.preventDefault();

    const input = pageInput();
    if (input) {
      input.files = files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    const file = files[0];
    this.handoff.sendFile(file, toolForFile(file.name, file.type));
  }

  /** What the drop will do, from the little a browser reveals mid-drag: the MIME type. */
  private describe(event: DragEvent): string {
    if (pageInput()) {
      return 'Drop to add it here';
    }
    const type = event.dataTransfer?.items?.[0]?.type ?? '';
    const slug = toolForFile('', type);
    const name = TOOLS.find((tool) => tool.slug === slug)?.name;
    return name ? `Drop to open in ${name}` : 'Drop to open in the right tool';
  }
}

/** The first file input the current page offers, if any. */
function pageInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('input.dropzone__input:not(:disabled)');
}

function hasFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  return types ? Array.from(types).includes('Files') : false;
}
