import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';

export interface Row {
  key: string;
  label: string;
  value: string;
}

export type ParseResult =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; epochMs: number; interpretation: string; rows: Row[] };

/** Anything at or beyond this is read as milliseconds, below it as seconds. */
const MS_THRESHOLD = 1e11;

@Component({
  selector: 'app-timestamp-converter',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './timestamp-converter.html',
  styleUrls: ['../tool-shell.css', './timestamp-converter.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimestampConverterTool {
  private readonly snackBar = inject(MatSnackBar);

  /** Ticks once a second so the "now" panel and relative times stay current. */
  protected readonly now = signal(Date.now());

  protected readonly input = signal('');

  protected readonly result = computed<ParseResult>(() => parse(this.input().trim(), this.now()));

  protected readonly nowSeconds = computed(() => Math.floor(this.now() / 1000));
  protected readonly nowIso = computed(() => new Date(this.now()).toISOString());
  protected readonly timeZone = computed(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local time zone',
  );

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLInputElement).value);
  }

  protected useNow(): void {
    this.input.set(String(Math.floor(Date.now() / 1000)));
  }

  protected clear(): void {
    this.input.set('');
  }

  protected async copy(value: string, label: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    this.snackBar.open(`${label} copied to clipboard`, undefined, { duration: 2000 });
  }
}

// --- Pure helpers -------------------------------------------------------

/**
 * Accepts a Unix timestamp (seconds or milliseconds) or anything `Date` can
 * parse — ISO 8601, RFC 2822, `2026-07-21 14:30`, and so on.
 */
function parse(raw: string, nowMs: number): ParseResult {
  if (raw === '') {
    return { kind: 'empty' };
  }

  let epochMs: number;
  let interpretation: string;

  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    const isMillis = Math.abs(numeric) >= MS_THRESHOLD;
    epochMs = isMillis ? numeric : numeric * 1000;
    interpretation = isMillis
      ? 'Read as a Unix timestamp in milliseconds.'
      : 'Read as a Unix timestamp in seconds.';
  } else {
    epochMs = Date.parse(raw);
    interpretation = 'Read as a date string.';
  }

  if (!Number.isFinite(epochMs)) {
    return {
      kind: 'error',
      message: 'Not a Unix timestamp or a date this browser can parse.',
    };
  }

  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) {
    return { kind: 'error', message: 'That timestamp is outside the range JavaScript can represent.' };
  }

  const seconds = Math.floor(epochMs / 1000);
  const rows: Row[] = [
    { key: 'seconds', label: 'Unix (s)', value: String(seconds) },
    { key: 'millis', label: 'Unix (ms)', value: String(epochMs) },
    { key: 'iso', label: 'ISO 8601 (UTC)', value: date.toISOString() },
    { key: 'utc', label: 'UTC', value: date.toUTCString() },
    { key: 'local', label: 'Local', value: date.toString() },
    { key: 'localShort', label: 'Local (short)', value: date.toLocaleString() },
    { key: 'relative', label: 'Relative', value: relative(epochMs, nowMs) },
  ];

  return { kind: 'ok', epochMs, interpretation, rows };
}

const RELATIVE_UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'year', ms: 365.25 * 24 * 3600 * 1000 },
  { unit: 'month', ms: 30.44 * 24 * 3600 * 1000 },
  { unit: 'week', ms: 7 * 24 * 3600 * 1000 },
  { unit: 'day', ms: 24 * 3600 * 1000 },
  { unit: 'hour', ms: 3600 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
  { unit: 'second', ms: 1000 },
];

function relative(epochMs: number, nowMs: number): string {
  const delta = epochMs - nowMs;
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const { unit, ms } of RELATIVE_UNITS) {
    if (Math.abs(delta) >= ms) {
      return formatter.format(Math.round(delta / ms), unit);
    }
  }
  return formatter.format(0, 'second');
}
