import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { downloadBytes } from '../../core/download';
import { syncToolState } from '../../core/tool-state';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import {
  CURRENCIES,
  addDays,
  fileStemFor,
  formatDate,
  formatMoney,
  isoDate,
  lineTotal,
  nextNumber,
  toMinor,
  totalsFor,
  type LineItem,
} from './invoice';

type Kind = 'invoice' | 'receipt';

interface EditableItem extends LineItem {
  /** Stable across re-renders, so the inputs keep focus while you type. */
  id: number;
}

const SAMPLE_ITEMS: LineItem[] = [
  { description: 'Design and build, landing page', quantity: 1, unitPrice: 1800 },
  { description: 'Content migration (hours)', quantity: 6.5, unitPrice: 85 },
];

@Component({
  selector: 'app-invoice-generator',
  imports: [ToolPage, ToolContent, Spinner, MatButtonModule, NgIcon],
  templateUrl: './invoice-generator.html',
  styleUrls: ['../tool-shell.css', './invoice-generator.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceGeneratorTool {
  protected readonly currencies = CURRENCIES;

  private nextId = 0;

  protected readonly kind = signal<Kind>('invoice');
  protected readonly number = signal('INV-0001');
  protected readonly issueDate = signal(isoDate(new Date()));
  protected readonly secondDate = signal(addDays(isoDate(new Date()), 30));
  protected readonly from = signal('Your Company Ltd\n1 Example Street\nLondon\nhello@example.com');
  protected readonly to = signal('Client Name Ltd\n2 Sample Road\nManchester');
  protected readonly currency = signal<string>('GBP');
  protected readonly taxLabel = signal('VAT');
  protected readonly taxRate = signal(20);
  protected readonly notes = signal('Payment within 30 days. Bank details on request.');
  protected readonly items = signal<EditableItem[]>(
    SAMPLE_ITEMS.map((item) => ({ ...item, id: this.nextId++ })),
  );

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /**
   * Never shareable.
   *
   * What is on this page is a client's name and address and what they are being
   * charged. Session restore saves an accidental refresh, which is worth
   * having; a link carrying all of it into a chat window is not.
   */
  protected readonly shared = syncToolState({
    key: 'invoice-generator',
    shareable: false,
    snapshot: () => ({
      kind: this.kind(),
      number: this.number(),
      issueDate: this.issueDate(),
      secondDate: this.secondDate(),
      from: this.from(),
      to: this.to(),
      currency: this.currency(),
      taxLabel: this.taxLabel(),
      taxRate: this.taxRate(),
      notes: this.notes(),
      items: this.items().map(({ description, quantity, unitPrice }) => ({
        description,
        quantity,
        unitPrice,
      })),
    }),
    restore: (state) => {
      if (state.kind === 'invoice' || state.kind === 'receipt') {
        this.kind.set(state.kind);
      }
      for (const key of ['number', 'from', 'to', 'taxLabel', 'notes'] as const) {
        const value = state[key];
        if (typeof value === 'string') {
          this[key].set(value);
        }
      }
      for (const key of ['issueDate', 'secondDate'] as const) {
        const value = state[key];
        if (typeof value === 'string') {
          this[key].set(value);
        }
      }
      if (
        typeof state.currency === 'string' &&
        CURRENCIES.some((entry) => entry.code === state.currency)
      ) {
        this.currency.set(state.currency);
      }
      if (typeof state.taxRate === 'number' && Number.isFinite(state.taxRate)) {
        this.taxRate.set(state.taxRate);
      }
      if (Array.isArray(state.items)) {
        // A restored state can be hand-edited, so every field is checked rather
        // than trusted: a string where a quantity should be would print NaN
        // across the finished PDF.
        const items = state.items
          .filter((item): item is LineItem => !!item && typeof item === 'object')
          .map((item) => ({
            id: this.nextId++,
            description: typeof item.description === 'string' ? item.description : '',
            quantity: Number.isFinite(item.quantity) ? item.quantity : 0,
            unitPrice: Number.isFinite(item.unitPrice) ? item.unitPrice : 0,
          }));
        if (items.length > 0) {
          this.items.set(items);
        }
      }
    },
  });

  protected readonly totals = computed(() =>
    totalsFor(this.items(), this.taxRate(), this.currency()),
  );

  protected readonly rows = computed(() =>
    this.items().map((item) => ({
      ...item,
      unitText: formatMoney(toMinor(item.unitPrice, this.currency()), this.currency()),
      amountText: formatMoney(lineTotal(item, this.currency()), this.currency()),
    })),
  );

  protected readonly subtotalText = computed(() =>
    formatMoney(this.totals().subtotal, this.currency()),
  );
  protected readonly taxText = computed(() => formatMoney(this.totals().tax, this.currency()));
  protected readonly totalText = computed(() => formatMoney(this.totals().total, this.currency()));

  protected readonly issuedText = computed(() => formatDate(this.issueDate()));
  protected readonly secondText = computed(() => formatDate(this.secondDate()));
  protected readonly secondLabel = computed(() =>
    this.kind() === 'receipt' ? 'Paid on' : 'Due date',
  );
  protected readonly toLabel = computed(() =>
    this.kind() === 'receipt' ? 'Received from' : 'Bill to',
  );

  protected setKind(kind: Kind): void {
    this.kind.set(kind);
  }

  protected setText(which: 'number' | 'from' | 'to' | 'taxLabel' | 'notes', value: string): void {
    this[which].set(value);
  }

  protected setIssueDate(value: string): void {
    this.issueDate.set(value);
  }

  protected setSecondDate(value: string): void {
    this.secondDate.set(value);
  }

  protected setCurrency(value: string): void {
    this.currency.set(value);
  }

  protected setTaxRate(value: string): void {
    this.taxRate.set(Number.parseFloat(value) || 0);
  }

  protected addItem(): void {
    this.items.update((items) => [
      ...items,
      { id: this.nextId++, description: '', quantity: 1, unitPrice: 0 },
    ]);
  }

  protected removeItem(id: number): void {
    this.items.update((items) => items.filter((item) => item.id !== id));
  }

  protected updateItem(id: number, field: keyof LineItem, value: string): void {
    this.items.update((items) =>
      items.map((item) =>
        item.id === id
          ? { ...item, [field]: field === 'description' ? value : Number.parseFloat(value) || 0 }
          : item,
      ),
    );
  }

  /** Bumps the number ready for the next one, which is the usual next action. */
  protected bumpNumber(): void {
    this.number.update(nextNumber);
  }

  protected async download(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { renderInvoice } = await import('./invoice-pdf');
      const bytes = await renderInvoice({
        kind: this.kind(),
        number: this.number(),
        issueDate: this.issueDate(),
        secondDate: this.secondDate(),
        from: this.from(),
        to: this.to(),
        currency: this.currency(),
        taxLabel: this.taxLabel(),
        taxRate: this.taxRate(),
        items: this.items(),
        notes: this.notes(),
      });
      downloadBytes(bytes, `${fileStemFor(this.kind(), this.number())}.pdf`, 'application/pdf');
    } catch {
      this.error.set('The PDF could not be produced. Check the dates and amounts.');
    } finally {
      this.busy.set(false);
    }
  }
}
