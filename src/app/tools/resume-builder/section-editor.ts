import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import {
  MONTHS,
  SECTION_KINDS,
  emptyEntry,
  joinYearMonth,
  move,
  splitYearMonth,
  type EntryField,
  type ResumeEntry,
  type ResumeSection,
} from './resume';

/**
 * Years offered by the date pickers, newest first. A fixed range rather than
 * one counted from today: the list is prerendered, and a list that grew on
 * New Year's Day would no longer match the static HTML it hydrates.
 */
const YEARS = Array.from({ length: 2040 - 1950 + 1 }, (_, index) => String(2040 - index));
const MONTH_OPTIONS = MONTHS.map((label, index) => ({
  value: String(index + 1).padStart(2, '0'),
  label,
}));

/** The order fields appear in, whatever order a kind lists them. */
const FIELD_ORDER: EntryField[] = ['title', 'subtitle', 'location', 'url', 'text', 'bullets'];

/**
 * One section of the resume: its heading, its entries and their fields.
 *
 * It owns nothing but which entries are expanded. Every edit goes out as a
 * whole new section through `changed`, and the page applies it, so the one
 * resume signal stays the only state worth saving.
 */
@Component({
  selector: 'app-section-editor',
  imports: [MatButtonModule, NgIcon],
  templateUrl: './section-editor.html',
  styleUrls: ['../tool-shell.css', './section-editor.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'section-editor' },
})
export class SectionEditor {
  readonly section = input.required<ResumeSection>();
  readonly index = input.required<number>();
  readonly count = input.required<number>();
  /** Set when the chosen design puts this section in its narrow column. */
  readonly sideNote = input('');

  readonly changed = output<ResumeSection>();
  readonly moved = output<number>();
  readonly removed = output<void>();
  /** Something to say in the page's live region. */
  readonly announce = output<string>();

  private readonly injector = inject(Injector);

  protected readonly years = YEARS;
  protected readonly months = MONTH_OPTIONS;

  protected readonly info = computed(() => SECTION_KINDS[this.section().kind]);
  protected readonly fields = computed(() => {
    const labels = this.info().fields;
    return FIELD_ORDER.filter((field) => labels[field]).map((field) => ({
      field,
      label: labels[field] ?? '',
      hint: this.info().hints?.[field] ?? '',
      multiline: field === 'text' || field === 'bullets',
    }));
  });

  protected readonly open = signal(true);
  /** Entries whose fields are showing. New ones open; loaded ones start closed. */
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected toggleOpen(): void {
    this.open.update((open) => !open);
  }

  protected isExpanded(id: string): boolean {
    return this.info().single === true || this.expanded().has(id);
  }

  protected toggleEntry(id: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  protected entryLabel(entry: ResumeEntry): string {
    const label = [entry.title, entry.subtitle].map((part) => part.trim()).filter(Boolean).join(', ');
    return label || `New ${this.info().noun}`;
  }

  // --- Section ---------------------------------------------------------------

  protected setTitle(title: string): void {
    this.changed.emit({ ...this.section(), title });
  }

  protected toggleHidden(): void {
    const hidden = !this.section().hidden;
    this.changed.emit({ ...this.section(), hidden });
    this.announce.emit(`${this.section().title} ${hidden ? 'hidden from' : 'shown on'} the resume.`);
  }

  // --- Entries ------------------------------------------------------------------

  private setEntries(entries: ResumeEntry[]): void {
    this.changed.emit({ ...this.section(), entries });
  }

  protected addEntry(): void {
    const entry = emptyEntry();
    this.setEntries([...this.section().entries, entry]);
    this.expanded.update((set) => new Set(set).add(entry.id));
    this.open.set(true);
    this.focusLater(`${entry.id}-${this.fields()[0]?.field ?? 'title'}`);
  }

  protected removeEntry(entry: ResumeEntry, position: number): void {
    const entries = this.section().entries.filter((item) => item.id !== entry.id);
    this.setEntries(entries);
    this.announce.emit(`Removed ${this.entryLabel(entry)}.`);
    // Focus goes to the entry that took its place, or the Add button.
    const next = entries[Math.min(position, entries.length - 1)];
    this.focusLater(next ? `${next.id}-toggle` : `${this.section().id}-add`);
  }

  protected moveEntry(entry: ResumeEntry, position: number, by: number): void {
    const entries = move(this.section().entries, position, by);
    if (entries === this.section().entries) {
      return;
    }
    this.setEntries(entries);
    const to = position + by;
    this.announce.emit(`${this.entryLabel(entry)} moved to position ${to + 1} of ${entries.length}.`);
    // The button pressed may now be disabled (top or bottom), so the focus
    // lands on whichever of the pair still does something.
    const direction = by < 0 ? (to === 0 ? 'down' : 'up') : to === entries.length - 1 ? 'up' : 'down';
    this.focusLater(`${entry.id}-${direction}`);
  }

  protected toggleEntryHidden(entry: ResumeEntry): void {
    this.patch(entry, { hidden: !entry.hidden });
    this.announce.emit(`${this.entryLabel(entry)} ${entry.hidden ? 'shown on' : 'hidden from'} the resume.`);
  }

  protected patch(entry: ResumeEntry, change: Partial<ResumeEntry>): void {
    this.setEntries(
      this.section().entries.map((item) => (item.id === entry.id ? { ...item, ...change, id: item.id } : item)),
    );
  }

  protected setField(entry: ResumeEntry, field: EntryField, value: string): void {
    this.patch(entry, { [field]: value });
  }

  // --- Dates -----------------------------------------------------------------------

  protected yearOf(value: string): string {
    return splitYearMonth(value).year;
  }

  protected monthOf(value: string): string {
    return splitYearMonth(value).month;
  }

  protected setDate(entry: ResumeEntry, which: 'start' | 'end', part: 'year' | 'month', value: string): void {
    const current = splitYearMonth(entry[which]);
    const next = part === 'year' ? joinYearMonth(value, current.month) : joinYearMonth(current.year, value);
    this.patch(entry, { [which]: next });
  }

  protected setCurrent(entry: ResumeEntry, current: boolean): void {
    this.patch(entry, { current });
  }

  /** Moves focus once the change has been rendered. */
  private focusLater(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }
}
