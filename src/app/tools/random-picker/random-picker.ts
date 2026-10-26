import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import {
  describeOutcome,
  flipCoins,
  intSource,
  numbersInRange,
  parseNames,
  rollDice,
  splitTeams,
  wheelRotation,
  type Outcome,
} from './random';

type Mode = 'coin' | 'dice' | 'number' | 'name' | 'teams';

const MODES: readonly { key: Mode; label: string; icon: string }[] = [
  { key: 'coin', label: 'Coin', icon: 'matAutorenewOutline' },
  { key: 'dice', label: 'Dice', icon: 'matCasinoOutline' },
  { key: 'number', label: 'Number', icon: 'matTagOutline' },
  { key: 'name', label: 'Name or wheel', icon: 'matShuffleOutline' },
  { key: 'teams', label: 'Teams', icon: 'matGroupsOutline' },
];

const DICE = [4, 6, 8, 10, 12, 20, 100];

/** How long the wheel turns. Matches the transition in random-picker.css. */
export const SPIN_MS = 4000;

/** Label radius, and the longest label: 11 characters at 7px fit between hub and rim. */
const LABEL_AT = 58;

/** Above this many names the wheel has no room for labels; it still spins. */
const MAX_LABELS = 40;

/** Fills for the wheel, one per segment in turn. Each carries --on text above 4.5:1 in both themes. */
const FILLS = ['var(--cat-dev-bg)', 'var(--cat-conv-bg)', 'var(--cat-doc-bg)', 'var(--cat-guide-bg)', 'var(--primary-c)'];

const SAMPLE_NAMES = ['Ada', 'Grace', 'Alan', 'Katherine', 'Linus', 'Margaret', 'Dennis', 'Barbara'].join('\n');

interface HistoryEntry {
  n: number;
  text: string;
}

interface Segment {
  path: string;
  fill: string;
  label: string;
  /** Where and at what angle the label sits. */
  transform: string;
}

/** A whole number from an input, clamped to [min, max]; the fallback when it is not a number. */
function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const value = Math.trunc(Number(raw));
  return Number.isFinite(value) && raw.trim() !== '' ? Math.min(max, Math.max(min, value)) : fallback;
}

@Component({
  selector: 'app-random-picker',
  imports: [ToolPage, ToolContent, MatButtonModule, MatCheckboxModule, NgIcon],
  templateUrl: './random-picker.html',
  styleUrls: ['../tool-shell.css', './random-picker.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RandomPickerTool {
  private readonly clipboard = inject(ClipboardService);
  private readonly int = intSource();

  protected readonly modes = MODES;
  protected readonly describe = describeOutcome;
  protected readonly dicePresets = DICE;

  protected readonly mode = signal<Mode>('coin');
  protected readonly coins = signal(1);
  protected readonly diceCount = signal(2);
  protected readonly sides = signal(6);
  protected readonly min = signal(1);
  protected readonly max = signal(100);
  protected readonly howMany = signal(1);
  protected readonly unique = signal(true);
  protected readonly names = signal('');
  protected readonly removePicked = signal(false);
  protected readonly splitBy = signal<'teams' | 'perTeam'>('teams');
  protected readonly splitSize = signal(2);

  protected readonly outcome = signal<Outcome | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly history = signal<HistoryEntry[]>([]);
  /** What the live region says. Cleared first, so the same result twice is still read out. */
  protected readonly announcement = signal('');

  protected readonly rotation = signal(0);
  protected readonly spinning = signal(false);
  private spinTimer: ReturnType<typeof setTimeout> | undefined;
  private announceTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly state = syncToolState({
    key: 'random-picker',
    shareable: false,
    snapshot: () => ({
      mode: this.mode(),
      coins: this.coins(),
      diceCount: this.diceCount(),
      sides: this.sides(),
      min: this.min(),
      max: this.max(),
      howMany: this.howMany(),
      unique: this.unique(),
      names: this.names(),
      removePicked: this.removePicked(),
      splitBy: this.splitBy(),
      splitSize: this.splitSize(),
      history: this.history(),
    }),
    restore: (state) => {
      if (MODES.some((m) => m.key === state.mode)) this.mode.set(state.mode as Mode);
      for (const key of ['coins', 'diceCount', 'sides', 'min', 'max', 'howMany', 'splitSize'] as const) {
        const value = state[key];
        if (typeof value === 'number' && Number.isSafeInteger(value)) this[key].set(value);
      }
      if (typeof state.unique === 'boolean') this.unique.set(state.unique);
      if (typeof state.removePicked === 'boolean') this.removePicked.set(state.removePicked);
      if (typeof state.names === 'string') this.names.set(state.names);
      if (state.splitBy === 'teams' || state.splitBy === 'perTeam') this.splitBy.set(state.splitBy);
      if (Array.isArray(state.history)) {
        this.history.set(
          state.history.filter(
            (e): e is HistoryEntry => typeof e?.n === 'number' && typeof e?.text === 'string',
          ),
        );
      }
    },
  });

  protected readonly nameList = computed(() => parseNames(this.names()));

  protected readonly segments = computed<Segment[]>(() => {
    const names = this.nameList();
    const n = Math.max(names.length, 1);
    const size = 360 / n;
    // With n = 6, five fills in turn would put the same colour either side of the top.
    const cycle = n % FILLS.length === 1 ? FILLS.length - 1 : FILLS.length;
    return Array.from({ length: n }, (_, i) => {
      // SVG angles start at 3 o'clock; segment 0 starts at 12.
      const a0 = ((i * size - 90) * Math.PI) / 180;
      const a1 = (((i + 1) * size - 90) * Math.PI) / 180;
      const r = 96;
      const path =
        n === 1
          ? `M 0 -${r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 -${r} Z`
          : `M 0 0 L ${(r * Math.cos(a0)).toFixed(3)} ${(r * Math.sin(a0)).toFixed(3)} ` +
            `A ${r} ${r} 0 ${size > 180 ? 1 : 0} 1 ${(r * Math.cos(a1)).toFixed(3)} ${(r * Math.sin(a1)).toFixed(3)} Z`;
      const name = names[i] ?? '';
      return {
        path,
        fill: FILLS[i % cycle],
        label: n > MAX_LABELS ? '' : name.length > 11 ? `${name.slice(0, 10)}…` : name,
        transform: `rotate(${(i + 0.5) * size - 90}) translate(${LABEL_AT} 0)`,
      };
    });
  });

  protected readonly wheelTransform = computed(() => `rotate(${this.rotation()}deg)`);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.spinTimer);
      clearTimeout(this.announceTimer);
    });
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set(null);
  }

  protected setNumber(
    key: 'coins' | 'diceCount' | 'sides' | 'min' | 'max' | 'howMany' | 'splitSize',
    event: Event,
    min: number,
    max: number,
  ): void {
    const raw = (event.target as HTMLInputElement).value;
    this[key].set(clampInt(raw, min, max, this[key]()));
  }

  protected onNames(event: Event): void {
    this.names.set((event.target as HTMLTextAreaElement).value);
  }

  protected flip(): void {
    this.show({ kind: 'coin', coins: flipCoins(this.coins(), this.int) });
  }

  protected roll(): void {
    this.show({ kind: 'dice', roll: rollDice(this.diceCount(), this.sides(), this.int), sides: this.sides() });
  }

  protected draw(): void {
    const result = numbersInRange(this.min(), this.max(), this.howMany(), this.unique(), this.int);
    if ('error' in result) {
      this.fail(result.error);
      return;
    }
    this.show({ kind: 'number', numbers: result, min: this.min(), max: this.max() });
  }

  protected pick(): void {
    const names = this.nameList();
    if (names.length < 2) {
      this.fail('Add at least two names, one per line.');
      return;
    }
    const index = this.int(names.length);
    this.finishPick(names, index, false);
  }

  /**
   * The winner is drawn first, then the wheel is turned to land on it, so the
   * animation never decides anything. With reduced motion asked for, the
   * wheel jumps straight there and the result is shown at once.
   */
  protected spin(): void {
    const names = this.nameList();
    if (names.length < 2) {
      this.fail('Add at least two names, one per line.');
      return;
    }
    if (this.spinning()) return;
    const index = this.int(names.length);
    const offset = this.int(1000) / 999;
    const target = wheelRotation(this.rotation(), index, names.length, offset);
    this.rotation.set(target);

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      this.finishPick(names, index, true);
      return;
    }
    this.spinning.set(true);
    this.announcement.set('Spinning…');
    this.spinTimer = setTimeout(() => {
      this.spinning.set(false);
      this.finishPick(names, index, true);
    }, SPIN_MS);
  }

  private finishPick(names: string[], index: number, wheel: boolean): void {
    const name = names[index];
    this.show({ kind: 'name', name, from: names.length, wheel });
    if (this.removePicked()) {
      this.names.set(names.filter((_, i) => i !== index).join('\n'));
    }
  }

  protected makeTeams(): void {
    const size = this.splitSize();
    const result = splitTeams(
      this.nameList(),
      this.splitBy() === 'teams' ? { teams: size } : { perTeam: size },
      this.int,
    );
    if ('error' in result) {
      this.fail(result.error);
      return;
    }
    this.show({ kind: 'teams', teams: result });
  }

  private show(outcome: Outcome): void {
    this.error.set(null);
    this.outcome.set(outcome);
    const text = describeOutcome(outcome);
    this.history.update((entries) => [{ n: (entries[0]?.n ?? 0) + 1, text }, ...entries].slice(0, 100));
    this.announce(text);
  }

  private fail(message: string): void {
    this.error.set(message);
    this.announce(message);
  }

  private announce(text: string): void {
    this.announcement.set('');
    clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => this.announcement.set(text), 60);
  }

  protected copyResult(): void {
    const outcome = this.outcome();
    if (outcome) void this.clipboard.copy(describeOutcome(outcome), { label: 'Result' });
  }

  protected clearHistory(): void {
    this.history.set([]);
  }

  protected loadNames(): void {
    this.names.set(SAMPLE_NAMES);
  }
}
