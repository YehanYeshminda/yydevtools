import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

/**
 * The file drop target shared by every tool that takes an upload.
 *
 * Callers project the icon, title and hint, so the copy stays next to the tool
 * that owns it; this component only handles the container, the hidden input and
 * the drag state. Those projected nodes keep the *caller's* style encapsulation,
 * which is why `.dropzone__icon` / `__title` / `__hint` still live in
 * tool-shell.css while the container rules live here.
 *
 * Three things this does that the hand-rolled copies it replaced did not:
 *
 *  - counts dragenter/dragleave instead of clearing on the first dragleave.
 *    dragleave fires every time the pointer crosses onto a *child* node, so the
 *    old version flickered the highlight off while the pointer was still well
 *    inside the zone;
 *  - sets `dropEffect`, so the cursor shows a copy affordance rather than the
 *    browser default of "move";
 *  - ignores drags carrying no files, so dragging a text selection across the
 *    page no longer lights the zone up as if it were droppable.
 */
@Component({
  selector: 'app-dropzone',
  template: `
    <label
      class="dropzone"
      [class.dropzone--over]="over()"
      [class.dropzone--disabled]="disabled()"
      (dragenter)="onDragEnter($event)"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      <input
        type="file"
        class="dropzone__input"
        [accept]="accept()"
        [multiple]="multiple()"
        [disabled]="disabled()"
        (change)="onChange($event)"
      />
      <ng-content />
    </label>
  `,
  styleUrl: './dropzone.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dropzone {
  /** Forwarded to the native input's `accept`; empty means any file. */
  readonly accept = input('');
  readonly multiple = input(false);
  readonly disabled = input(false);

  /** Emits the dropped or picked files. Never emits an empty list. */
  readonly filesSelected = output<File[]>();

  protected readonly over = signal(false);

  /**
   * Depth of the current drag within the zone. dragenter/dragleave fire in
   * pairs as the pointer crosses each descendant, so the highlight is only
   * cleared once the count returns to zero.
   */
  private depth = 0;

  protected onDragEnter(event: DragEvent): void {
    if (this.disabled() || !this.hasFiles(event)) {
      return;
    }
    this.depth++;
    this.over.set(true);
  }

  protected onDragOver(event: DragEvent): void {
    if (this.disabled() || !this.hasFiles(event)) {
      return;
    }
    // Both are required: without preventDefault the browser navigates to the
    // file instead of letting us handle the drop.
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onDragLeave(event: DragEvent): void {
    if (this.disabled() || !this.hasFiles(event)) {
      return;
    }
    this.depth = Math.max(0, this.depth - 1);
    if (this.depth === 0) {
      this.over.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    if (this.disabled()) {
      return;
    }
    event.preventDefault();
    this.depth = 0;
    this.over.set(false);
    const files = event.dataTransfer?.files;
    if (files?.length) {
      this.filesSelected.emit(Array.from(files));
    }
  }

  protected onChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    // Copy out of the live FileList before resetting — clearing `input.value`
    // also empties `input.files`, which would otherwise leave us nothing to add.
    const files = input.files ? Array.from(input.files) : [];
    // Reset so picking the same file again still fires (change).
    input.value = '';
    if (files.length) {
      this.filesSelected.emit(files);
    }
  }

  /** True when the drag actually carries files rather than text or a link. */
  private hasFiles(event: DragEvent): boolean {
    const types = event.dataTransfer?.types;
    return types ? Array.from(types).includes('Files') : false;
  }
}
