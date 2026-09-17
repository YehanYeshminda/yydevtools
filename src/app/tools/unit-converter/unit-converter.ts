import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { CATEGORIES, categoryById, convert, convertAll, format, unitById } from './units';

@Component({
  selector: 'app-unit-converter',
  imports: [ToolPage, ToolContent, ShareLink, MatButtonModule, NgIcon],
  templateUrl: './unit-converter.html',
  styleUrls: ['../tool-shell.css', './unit-converter.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnitConverterTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly categories = CATEGORIES;

  protected readonly categoryId = signal(CATEGORIES[0].id);
  protected readonly from = signal(CATEGORIES[0].from);
  protected readonly to = signal(CATEGORIES[0].to);
  protected readonly input = signal('1');

  protected readonly shared = syncToolState({
    key: 'unit-converter',
    snapshot: () => ({
      category: this.categoryId(),
      from: this.from(),
      to: this.to(),
      input: this.input(),
    }),
    restore: (state) => {
      // Checked against the tables rather than trusted: a shared link can be
      // hand-edited, and a unit that does not exist would silently produce NaN
      // for everything.
      const category = typeof state.category === 'string' ? categoryById(state.category) : null;
      if (!category) {
        return;
      }
      this.categoryId.set(category.id);
      this.from.set(
        typeof state.from === 'string' && unitById(category, state.from)
          ? state.from
          : category.from,
      );
      this.to.set(
        typeof state.to === 'string' && unitById(category, state.to) ? state.to : category.to,
      );
      if (typeof state.input === 'string') {
        this.input.set(state.input);
      }
    },
  });

  protected readonly category = computed(() => categoryById(this.categoryId()) ?? CATEGORIES[0]);
  protected readonly units = computed(() => this.category().units);

  protected readonly value = computed(() => {
    const text = this.input().trim().replace(/,/g, '');
    return text === '' ? Number.NaN : Number(text);
  });

  protected readonly valid = computed(() => Number.isFinite(this.value()));
  protected readonly invalid = computed(() => this.input().trim() !== '' && !this.valid());

  protected readonly result = computed(() =>
    convert(this.value(), this.category(), this.from(), this.to()),
  );

  protected readonly resultText = computed(() => format(this.result()));

  protected readonly fromSymbol = computed(
    () => unitById(this.category(), this.from())?.symbol ?? '',
  );
  protected readonly toSymbol = computed(() => unitById(this.category(), this.to())?.symbol ?? '');

  /** Every unit of the category at once, which answers the next question too. */
  protected readonly all = computed(() =>
    this.valid() ? convertAll(this.value(), this.category(), this.from()) : [],
  );

  protected setCategory(id: string): void {
    const category = categoryById(id);
    if (!category) {
      return;
    }
    this.categoryId.set(id);
    // The old units belong to the old category, so both pickers reset rather
    // than holding an id this category has never heard of.
    this.from.set(category.from);
    this.to.set(category.to);
  }

  protected setFrom(id: string): void {
    this.from.set(id);
  }

  protected setTo(id: string): void {
    this.to.set(id);
  }

  protected setInput(value: string): void {
    this.input.set(value);
  }

  protected swap(): void {
    const from = this.from();
    this.from.set(this.to());
    this.to.set(from);
  }

  protected copy(): void {
    void this.clipboard.copy(`${this.resultText()} ${this.toSymbol()}`, { label: 'Result' });
  }
}
