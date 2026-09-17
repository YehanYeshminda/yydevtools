import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { downloadBytes } from '../../core/download';
import { PdfDocumentRenderer } from '../../core/pdf-render';
import { syncToolState } from '../../core/tool-state';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import {
  CURRENCIES,
  MAX_LOGO_BYTES,
  addDays,
  fileStemFor,
  formatDate,
  formatMoney,
  imageFormat,
  isoDate,
  lineTotal,
  nextNumber,
  toMinor,
  totalsFor,
  type LineItem,
} from './invoice';
import type { InvoiceDocument, InvoiceLogo } from './invoice-pdf';

type Kind = 'invoice' | 'receipt';

interface EditableItem extends LineItem {
  /** Stable across re-renders, so the inputs keep focus while you type. */
  id: number;
}

const SAMPLE_ITEMS: LineItem[] = [
  { description: 'Design and build, landing page', quantity: 1, unitPrice: 1800 },
  { description: 'Content migration (hours)', quantity: 6.5, unitPrice: 85 },
];

/**
 * How long the page waits after the last keystroke before redrawing.
 *
 * Long enough that typing a company name does not rebuild the document on
 * every letter, short enough that it feels like it is keeping up.
 */
const PREVIEW_DEBOUNCE_MS = 350;

/** Rasterising scale for the preview. A4 at 1.5 is a legible ~890px wide. */
const PREVIEW_SCALE = 1.5;

@Component({
  selector: 'app-invoice-generator',
  imports: [ToolPage, ToolContent, Spinner, MatButtonModule, NgIcon],
  templateUrl: './invoice-generator.html',
  styleUrls: ['../tool-shell.css', './invoice-generator.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceGeneratorTool {
  protected readonly currencies = CURRENCIES;

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly previewCanvas = viewChild<ElementRef<HTMLCanvasElement>>('preview');

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

  /**
   * The letterhead, once it has been checked.
   *
   * Deliberately outside the saved state: it is megabytes of base64 next to a
   * few hundred bytes of text, and re-picking a file after a refresh is a
   * lesser annoyance than a session store that will not fit.
   */
  protected readonly logo = signal<InvoiceLogo | null>(null);
  protected readonly logoName = signal('');

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly previewBusy = signal(false);
  protected readonly previewPages = signal(0);
  protected readonly previewReady = signal(false);

  /** Discards a render whose inputs have already been superseded. */
  private previewToken = 0;

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

  /** Everything the PDF needs, in one place: the preview and the download share it. */
  protected readonly docState = computed<InvoiceDocument>(() => ({
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
    logo: this.logo(),
  }));

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

  constructor() {
    // Redraw the preview whenever anything on the form changes. The timer is
    // cleared by the next change rather than left to fire, so holding a key
    // down rebuilds the document once at the end instead of forty times.
    effect((onCleanup) => {
      const state = this.docState();
      if (!this.isBrowser) {
        return;
      }
      const timer = setTimeout(() => void this.renderPreview(state), PREVIEW_DEBOUNCE_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

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

  // --- Logo -------------------------------------------------------------
  /**
   * Takes on a letterhead, having proved it can actually be embedded.
   *
   * Checked here rather than when the PDF is built, because by then the only
   * honest report is "the invoice could not be produced", which points at the
   * wrong thing. A file that gets past this is one pdf-lib has already
   * accepted once.
   */
  protected async onLogoPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared straight away so picking the same file twice still fires a change.
    input.value = '';
    if (!file) {
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      this.error.set('That logo is over 2 MB. Every invoice would carry all of it.');
      return;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const format = imageFormat(bytes);
    if (!format) {
      this.error.set('A logo has to be a PNG or a JPEG. SVG and WebP cannot go into a PDF.');
      return;
    }

    try {
      const { PDFDocument } = await import('@cantoo/pdf-lib');
      const probe = await PDFDocument.create();
      await (format === 'png' ? probe.embedPng(bytes) : probe.embedJpg(bytes));
    } catch {
      this.error.set('That image could not be read. Try re-saving it as a PNG.');
      return;
    }

    this.error.set(null);
    this.logoName.set(file.name);
    this.logo.set({ bytes, format });
  }

  protected removeLogo(): void {
    this.logo.set(null);
    this.logoName.set('');
  }

  // --- Preview ----------------------------------------------------------
  private async renderPreview(state: InvoiceDocument): Promise<void> {
    const canvas = this.previewCanvas()?.nativeElement;
    if (!canvas) {
      return;
    }
    const token = ++this.previewToken;
    this.previewBusy.set(true);

    let renderer: PdfDocumentRenderer | null = null;
    try {
      const { renderInvoice } = await import('./invoice-pdf');
      const bytes = await renderInvoice(state);
      if (token !== this.previewToken) {
        return;
      }

      renderer = await PdfDocumentRenderer.open(bytes);
      const page = await renderer.renderPageCanvas(0, PREVIEW_SCALE);
      if (token === this.previewToken) {
        canvas.width = page.width;
        canvas.height = page.height;
        canvas.getContext('2d')?.drawImage(page.canvas, 0, 0);
        this.previewPages.set(renderer.pageCount);
        this.previewReady.set(true);
        this.error.set(null);
      }
      // Zeroing the size is the only way to make the browser hand the backing
      // store back promptly, and this one is remade on every keystroke.
      page.canvas.width = 0;
      page.canvas.height = 0;
    } catch {
      if (token === this.previewToken) {
        this.error.set('The PDF could not be produced. Check the dates and amounts.');
      }
    } finally {
      renderer?.close();
      if (token === this.previewToken) {
        this.previewBusy.set(false);
      }
    }
  }

  protected async download(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { renderInvoice } = await import('./invoice-pdf');
      const bytes = await renderInvoice(this.docState());
      downloadBytes(bytes, `${fileStemFor(this.kind(), this.number())}.pdf`, 'application/pdf');
    } catch {
      this.error.set('The PDF could not be produced. Check the dates and amounts.');
    } finally {
      this.busy.set(false);
    }
  }
}
