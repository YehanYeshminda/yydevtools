import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import {
  CurrencyRates,
  ageInDays,
  convertAmount,
  currencyCodes,
  currencyName,
  formatRate,
  fractionDigits,
  isStale,
  rateBetween,
  rateDateText,
} from '../../core/currency';
import { syncToolState } from '../../core/tool-state';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import {
  CATEGORIES,
  categoryById,
  convert,
  convertAll,
  format,
  unitById,
  type Unit,
} from './units';

/** Currency is not a table of fixed factors, so it is a category of its own. */
const CURRENCY = 'currency';

/** The table under a currency result: the ones most people convert into. */
const COMMON = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'LKR', 'AUD', 'CAD', 'CHF', 'SGD', 'AED'];

/** Codes from a restored link are checked for shape here, and for a rate later. */
const ISO_CODE = /^[A-Z]{3}$/;

/** A value at the currency's own decimals: 2 for most, 0 for yen, 3 for dinars. */
function formatCurrency(value: number, code: string): string {
  if (!Number.isFinite(value)) {
    return '';
  }
  const digits = fractionDigits(code);
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function currencyUnit(code: string): Unit {
  return { id: code, name: currencyName(code), symbol: code, factor: 1 };
}

@Component({
  selector: 'app-unit-converter',
  imports: [ToolPage, ToolContent, ShareLink, MatButtonModule, NgIcon],
  templateUrl: './unit-converter.html',
  styleUrls: ['../tool-shell.css', './unit-converter.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnitConverterTool {
  private readonly clipboard = inject(ClipboardService);
  private readonly currencyRates = inject(CurrencyRates);

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
      if (state.category === CURRENCY) {
        const code = (value: unknown, fallback: string) =>
          typeof value === 'string' && ISO_CODE.test(value) ? value : fallback;
        this.categoryId.set(CURRENCY);
        this.from.set(code(state.from, 'USD'));
        this.to.set(code(state.to, 'EUR'));
        if (typeof state.input === 'string') {
          this.input.set(state.input);
        }
        return;
      }
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

  protected readonly isCurrency = computed(() => this.categoryId() === CURRENCY);
  protected readonly category = computed(() => categoryById(this.categoryId()) ?? CATEGORIES[0]);

  /**
   * Every real currency once the rates are in; until then the common ones, so
   * the pickers are never empty. The selected pair is always listed, even one
   * from a link naming a currency the rates turn out not to have.
   */
  private readonly currencyUnits = computed(() => {
    const rates = this.currencyRates.rates();
    const codes = new Set(rates ? currencyCodes(rates) : COMMON);
    codes.add(this.from());
    codes.add(this.to());
    return [...codes].map(currencyUnit);
  });

  protected readonly units = computed(() =>
    this.isCurrency() ? this.currencyUnits() : this.category().units,
  );

  /** 'loading', 'failed', 'missing' (no rate for the pair) or 'ready'. */
  protected readonly currencyStatus = computed(() => {
    const state = this.currencyRates.state();
    if (state !== 'ready') {
      return state === 'failed' ? 'failed' : 'loading';
    }
    const rates = this.currencyRates.rates();
    return rates && rateBetween(rates, this.from(), this.to()) !== null ? 'ready' : 'missing';
  });

  /** Whichever of the pair has no rate, for the message that says so. */
  protected readonly missingCode = computed(() =>
    this.currencyRates.rates()?.perUsd[this.from()] ? this.to() : this.from(),
  );

  protected readonly rateText = computed(() => {
    const rates = this.currencyRates.rates();
    const rate = rates ? rateBetween(rates, this.from(), this.to()) : null;
    return rate === null ? '' : `1 ${this.from()} = ${formatRate(rate)} ${this.to()}`;
  });
  protected readonly rateDate = computed(() =>
    rateDateText(this.currencyRates.rates()?.date ?? ''),
  );
  /** Days old, when the rates are old enough to say so; 0 otherwise. */
  protected readonly staleDays = computed(() => {
    const rates = this.currencyRates.rates();
    const now = new Date();
    return rates && isStale(rates, now) ? ageInDays(rates.date, now) : 0;
  });

  protected readonly value = computed(() => {
    const text = this.input().trim().replace(/,/g, '');
    return text === '' ? Number.NaN : Number(text);
  });

  protected readonly valid = computed(() => Number.isFinite(this.value()));
  protected readonly invalid = computed(() => this.input().trim() !== '' && !this.valid());

  protected readonly result = computed(() => {
    if (!this.isCurrency()) {
      return convert(this.value(), this.category(), this.from(), this.to());
    }
    const rates = this.currencyRates.rates();
    return (rates && convertAmount(this.value(), this.from(), this.to(), rates)) ?? Number.NaN;
  });

  protected readonly resultText = computed(() =>
    this.isCurrency() ? formatCurrency(this.result(), this.to()) : format(this.result()),
  );

  protected readonly fromSymbol = computed(() =>
    this.isCurrency() ? this.from() : (unitById(this.category(), this.from())?.symbol ?? ''),
  );
  protected readonly toSymbol = computed(() =>
    this.isCurrency() ? this.to() : (unitById(this.category(), this.to())?.symbol ?? ''),
  );

  /** Every unit of the category at once, which answers the next question too. */
  protected readonly all = computed(() => {
    if (!this.valid()) {
      return [];
    }
    if (!this.isCurrency()) {
      return convertAll(this.value(), this.category(), this.from());
    }
    const rates = this.currencyRates.rates();
    return COMMON.flatMap((code) => {
      const value = rates ? convertAmount(this.value(), this.from(), code, rates) : null;
      return value === null
        ? []
        : [{ unit: currencyUnit(code), value, text: formatCurrency(value, code) }];
    });
  });

  constructor() {
    // Rates are fetched the first time Currency is opened (or restored), not
    // on page load: most visits here are for inches and kilograms.
    effect(() => {
      if (this.isCurrency()) {
        this.currencyRates.load();
      }
    });
  }

  protected setCategory(id: string): void {
    if (id === CURRENCY) {
      this.categoryId.set(CURRENCY);
      this.from.set('USD');
      this.to.set('EUR');
      return;
    }
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

  protected retryRates(): void {
    this.currencyRates.load();
  }

  protected copy(): void {
    void this.clipboard.copy(`${this.resultText()} ${this.toSymbol()}`, { label: 'Result' });
  }
}
