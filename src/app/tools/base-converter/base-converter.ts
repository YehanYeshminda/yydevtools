import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { SendTo } from '../../shared/send-to/send-to';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import {
  BASES,
  BASE_LABELS,
  MAX_BASE,
  MIN_BASE,
  WIDTHS,
  fitsIn,
  fittingWidth,
  group,
  parseValue,
  popCount,
  toBase,
  toBits,
  toggleBit,
  type Width,
} from './base';

/** One converted form of the value. */
interface Row {
  base: number;
  label: string;
  value: string;
  grouped: string;
}

@Component({
  selector: 'app-base-converter',
  imports: [ToolPage, ToolContent, SendTo, ShareLink, MatButtonModule, NgIcon],
  templateUrl: './base-converter.html',
  styleUrls: ['../tool-shell.css', './base-converter.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BaseConverterTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly bases = BASES;
  protected readonly widths = WIDTHS;
  protected readonly baseLabels = BASE_LABELS;
  protected readonly minBase = MIN_BASE;
  protected readonly maxBase = MAX_BASE;

  protected readonly input = signal('255');
  protected readonly inputBase = signal(10);
  protected readonly otherBase = signal(36);

  /** Null until someone picks a width, after which their choice sticks. */
  private readonly chosenWidth = signal<Width | null>(null);

  protected readonly shared = syncToolState({
    key: 'base-converter',
    snapshot: () => ({ input: this.input(), inputBase: this.inputBase() }),
    restore: (state) => {
      if (typeof state.input === 'string') {
        this.input.set(state.input);
      }
      if (
        typeof state.inputBase === 'number' &&
        BASES.includes(state.inputBase as 2 | 8 | 10 | 16)
      ) {
        this.inputBase.set(state.inputBase);
      }
    },
  });

  protected readonly parsed = computed(() => parseValue(this.input(), this.inputBase()));
  protected readonly empty = computed(() => this.input().trim().length === 0);
  protected readonly invalid = computed(() => !this.empty() && this.parsed() === null);

  /** Set when a 0x/0b/0o prefix chose the base instead of the tabs. */
  protected readonly prefixBase = computed(() => {
    const parsed = this.parsed();
    return parsed?.fromPrefix ? parsed.base : null;
  });

  protected readonly rows = computed<Row[]>(() => {
    const parsed = this.parsed();
    if (!parsed) {
      return [];
    }
    return BASES.map((base) => {
      const value = toBase(parsed.value, base);
      return { base, label: BASE_LABELS[base], value, grouped: group(value, base) };
    });
  });

  protected readonly otherValue = computed(() => {
    const parsed = this.parsed();
    return parsed ? toBase(parsed.value, this.otherBase()) : '';
  });

  /**
   * The width the bit view uses: whatever was picked, or else the smallest one
   * that holds the value, so a byte does not arrive spread over 64 boxes.
   */
  protected readonly width = computed<Width>(() => {
    const chosen = this.chosenWidth();
    if (chosen) {
      return chosen;
    }
    const parsed = this.parsed();
    return (parsed && fittingWidth(parsed.value)) ?? 32;
  });

  /** False for a value too large for any offered width — the bit view hides. */
  protected readonly showBits = computed(() => {
    const parsed = this.parsed();
    return parsed !== null && fitsIn(parsed.value, this.width());
  });

  protected readonly tooWideFor = computed(() => {
    const parsed = this.parsed();
    return parsed !== null && !fitsIn(parsed.value, this.width());
  });

  protected readonly bits = computed(() => {
    const parsed = this.parsed();
    return parsed ? toBits(parsed.value, this.width()) : [];
  });

  protected readonly setBits = computed(() => {
    const parsed = this.parsed();
    return parsed ? popCount(parsed.value, this.width()) : 0;
  });

  protected onInput(value: string): void {
    this.input.set(value);
  }

  protected setInputBase(base: number): void {
    const parsed = this.parsed();
    // Rewrite the input into the new base rather than re-reading the same
    // digits in it: someone switching from decimal to hex with 255 on screen
    // means "show me that number in hex", not "read 255 as hex".
    if (parsed) {
      this.input.set(toBase(parsed.value, base));
    }
    this.inputBase.set(base);
  }

  protected setOtherBase(value: string): void {
    const base = Math.round(Number(value));
    if (Number.isFinite(base)) {
      this.otherBase.set(Math.min(MAX_BASE, Math.max(MIN_BASE, base)));
    }
  }

  protected setWidth(width: Width): void {
    this.chosenWidth.set(width);
  }

  /** Flipping a bit writes the new value back into the input, in its own base. */
  protected flip(index: number): void {
    const parsed = this.parsed();
    if (!parsed) {
      return;
    }
    this.input.set(toBase(toggleBit(parsed.value, this.width(), index), this.inputBase()));
  }

  protected clear(): void {
    this.input.set('');
    this.chosenWidth.set(null);
  }

  protected copy(row: Row): void {
    void this.clipboard.copy(row.value, { label: row.label });
  }

  protected copyOther(): void {
    void this.clipboard.copy(this.otherValue(), { label: `Base ${this.otherBase()}` });
  }
}
