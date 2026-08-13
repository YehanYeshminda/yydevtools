import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { syncToolState } from '../../core/tool-state';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import {
  PassphraseOptions,
  PasswordOptions,
  Separator,
  characterPool,
  generatePassphrase,
  generatePassword,
  passphraseEntropy,
  passwordEntropy,
} from './generate';
import { SCORE_LABELS, StrengthReading, StrengthScore, estimateStrength, scoreFromEntropy } from './strength';

export type Mode = 'password' | 'passphrase';

const MIN_LENGTH = 4;
const MAX_LENGTH = 128;
const MIN_WORDS = 3;
const MAX_WORDS = 12;
const MAX_COUNT = 50;

interface SeparatorOption {
  value: Separator;
  label: string;
}

const SEPARATORS: readonly SeparatorOption[] = [
  { value: '-', label: 'Hyphen' },
  { value: ' ', label: 'Space' },
  { value: '.', label: 'Period' },
  { value: '_', label: 'Underscore' },
  { value: '', label: 'None' },
];

@Component({
  selector: 'app-password-generator',
  imports: [ToolPage, ToolContent, ShareLink, MatButtonModule, NgIcon],
  templateUrl: './password-generator.html',
  styleUrls: ['../tool-shell.css', './password-generator.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordGeneratorTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly minLength = MIN_LENGTH;
  protected readonly maxLength = MAX_LENGTH;
  protected readonly minWords = MIN_WORDS;
  protected readonly maxWords = MAX_WORDS;
  protected readonly maxCount = MAX_COUNT;
  protected readonly separators = SEPARATORS;
  protected readonly scoreLabels = SCORE_LABELS;

  // --- Mode -------------------------------------------------------------
  protected readonly mode = signal<Mode>('password');

  // --- Password options -------------------------------------------------
  protected readonly length = signal(20);
  protected readonly lowercase = signal(true);
  protected readonly uppercase = signal(true);
  protected readonly numbers = signal(true);
  protected readonly symbols = signal(true);
  protected readonly avoidAmbiguous = signal(false);
  protected readonly requireEach = signal(true);

  // --- Passphrase options -----------------------------------------------
  protected readonly words = signal(5);
  protected readonly separator = signal<Separator>('-');
  protected readonly capitalize = signal(false);
  protected readonly includeNumber = signal(false);

  // --- Output -----------------------------------------------------------
  protected readonly count = signal(1);
  protected readonly results = signal<string[]>([]);
  protected readonly wordlistSize = signal(0);

  /** zxcvbn's verdict on the first result; null until its dictionaries land. */
  protected readonly strength = signal<StrengthReading | null>(null);
  protected readonly strengthLoading = signal(false);

  private wordlist: readonly string[] | null = null;
  /** Guards against an out-of-order strength reading overwriting a newer one. */
  private strengthToken = 0;

  protected readonly passwordOptions = computed<PasswordOptions>(() => ({
    length: this.length(),
    lowercase: this.lowercase(),
    uppercase: this.uppercase(),
    numbers: this.numbers(),
    symbols: this.symbols(),
    avoidAmbiguous: this.avoidAmbiguous(),
    requireEach: this.requireEach(),
  }));

  protected readonly passphraseOptions = computed<PassphraseOptions>(() => ({
    words: this.words(),
    separator: this.separator(),
    capitalize: this.capitalize(),
    includeNumber: this.includeNumber(),
  }));

  /** True when every character set has been switched off. */
  protected readonly noSetsSelected = computed(
    () => !this.lowercase() && !this.uppercase() && !this.numbers() && !this.symbols(),
  );

  protected readonly poolSize = computed(() => characterPool(this.passwordOptions()).length);

  protected readonly entropy = computed(() =>
    this.mode() === 'password'
      ? passwordEntropy(this.passwordOptions())
      : passphraseEntropy(this.passphraseOptions(), this.wordlistSize()),
  );

  protected readonly entropyLabel = computed(() => Math.round(this.entropy()));

  /**
   * The meter reads from entropy immediately and is replaced by zxcvbn's answer
   * once its dictionaries arrive, so it is never blank and never stalls the UI.
   */
  protected readonly score = computed<StrengthScore>(
    () => this.strength()?.score ?? scoreFromEntropy(this.entropy()),
  );

  protected readonly primary = computed(() => this.results()[0] ?? '');
  protected readonly extras = computed(() => this.results().slice(1));

  /**
   * Only the settings travel in a shared link — never a generated value. A link
   * that pinned someone else's password would be both useless (the point is a
   * fresh secret) and dangerous (it would sit in history, chat logs and
   * referrers). The same reasoning as the UUID generator, with higher stakes.
   */
  protected readonly shared = syncToolState({
    key: 'password-generator',
    snapshot: () => ({
      mode: this.mode(),
      length: this.length(),
      lowercase: this.lowercase(),
      uppercase: this.uppercase(),
      numbers: this.numbers(),
      symbols: this.symbols(),
      avoidAmbiguous: this.avoidAmbiguous(),
      requireEach: this.requireEach(),
      words: this.words(),
      separator: this.separator(),
      capitalize: this.capitalize(),
      includeNumber: this.includeNumber(),
      count: this.count(),
    }),
    restore: (state) => {
      if (state.mode === 'password' || state.mode === 'passphrase') {
        this.mode.set(state.mode);
      }
      this.restoreNumber(state.length, MIN_LENGTH, MAX_LENGTH, this.length);
      this.restoreNumber(state.words, MIN_WORDS, MAX_WORDS, this.words);
      this.restoreNumber(state.count, 1, MAX_COUNT, this.count);
      this.restoreBoolean(state.lowercase, this.lowercase);
      this.restoreBoolean(state.uppercase, this.uppercase);
      this.restoreBoolean(state.numbers, this.numbers);
      this.restoreBoolean(state.symbols, this.symbols);
      this.restoreBoolean(state.avoidAmbiguous, this.avoidAmbiguous);
      this.restoreBoolean(state.requireEach, this.requireEach);
      this.restoreBoolean(state.capitalize, this.capitalize);
      this.restoreBoolean(state.includeNumber, this.includeNumber);
      if (SEPARATORS.some((option) => option.value === state.separator)) {
        this.separator.set(state.separator as Separator);
      }
    },
  });

  constructor() {
    // Generation is deliberately confined to the browser. Every route here is
    // prerendered to static HTML at build time, and this library happily falls
    // back to Node's crypto — so generating in a constructor would bake one
    // password into the page and serve that same secret to every visitor.
    afterNextRender(() => {
      void this.generate();
    });
  }

  // --- Options handling -------------------------------------------------
  protected setMode(mode: Mode): void {
    if (this.mode() === mode) {
      return;
    }
    this.mode.set(mode);
    void this.generate();
  }

  protected onLengthInput(event: Event): void {
    this.applyNumber(event, MIN_LENGTH, MAX_LENGTH, this.length);
  }

  protected onWordsInput(event: Event): void {
    this.applyNumber(event, MIN_WORDS, MAX_WORDS, this.words);
  }

  protected onCountInput(event: Event): void {
    this.applyNumber(event, 1, MAX_COUNT, this.count);
  }

  protected setSeparator(value: Separator): void {
    this.separator.set(value);
    void this.generate();
  }

  protected toggle(option: 'lowercase' | 'uppercase' | 'numbers' | 'symbols' | 'avoidAmbiguous' | 'requireEach' | 'capitalize' | 'includeNumber'): void {
    this[option].update((value) => !value);
    void this.generate();
  }

  // --- Generation -------------------------------------------------------
  protected async generate(): Promise<void> {
    const total = this.count();

    if (this.mode() === 'password') {
      if (this.noSetsSelected()) {
        this.results.set([]);
        this.strength.set(null);
        return;
      }
      const options = this.passwordOptions();
      this.results.set(
        Array.from({ length: total }, () => generatePassword(options)).filter(Boolean),
      );
    } else {
      const wordlist = await this.ensureWordlist();
      const options = this.passphraseOptions();
      this.results.set(
        Array.from({ length: total }, () => generatePassphrase(options, wordlist)).filter(Boolean),
      );
    }

    void this.measureStrength();
  }

  /**
   * The EFF wordlist is ~88 KB of pure data, so it is fetched the first time
   * passphrase mode is used rather than shipped with the tool's chunk.
   */
  private async ensureWordlist(): Promise<readonly string[]> {
    if (!this.wordlist) {
      const module = await import('./eff-wordlist');
      this.wordlist = module.EFF_WORDLIST;
      this.wordlistSize.set(module.EFF_WORDLIST.length);
    }
    return this.wordlist;
  }

  private async measureStrength(): Promise<void> {
    const value = this.primary();
    if (!value) {
      this.strength.set(null);
      return;
    }

    const token = ++this.strengthToken;
    this.strengthLoading.set(true);
    try {
      const reading = await estimateStrength(value);
      // A slower earlier request must not clobber a newer result.
      if (token === this.strengthToken) {
        this.strength.set(reading);
      }
    } catch {
      // The meter falls back to the entropy band, so a failed dictionary
      // download degrades quietly rather than breaking the tool.
      if (token === this.strengthToken) {
        this.strength.set(null);
      }
    } finally {
      if (token === this.strengthToken) {
        this.strengthLoading.set(false);
      }
    }
  }

  // --- Output -----------------------------------------------------------
  protected copyOne(value: string): void {
    void this.clipboard.copy(value, {
      message: this.mode() === 'password' ? 'Password copied' : 'Passphrase copied',
    });
  }

  protected copyAll(): void {
    const all = this.results();
    void this.clipboard.copy(all.join('\n'), { message: `${all.length} copied to clipboard` });
  }

  protected download(): void {
    const blob = new Blob([this.results().join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.mode()}s.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // --- Helpers ----------------------------------------------------------
  private applyNumber(
    event: Event,
    min: number,
    max: number,
    target: { set(value: number): void },
  ): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    target.set(Math.min(max, Math.max(min, Math.round(parsed))));
    void this.generate();
  }

  private restoreNumber(
    value: unknown,
    min: number,
    max: number,
    target: { set(next: number): void },
  ): void {
    if (typeof value === 'number' && Number.isFinite(value)) {
      target.set(Math.min(max, Math.max(min, Math.round(value))));
    }
  }

  private restoreBoolean(value: unknown, target: { set(next: boolean): void }): void {
    if (typeof value === 'boolean') {
      target.set(value);
    }
  }
}
