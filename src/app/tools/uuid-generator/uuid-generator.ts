import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';

export type UuidVersion = 'v4' | 'v7';

const MIN_COUNT = 1;
const MAX_COUNT = 500;

@Component({
  selector: 'app-uuid-generator',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './uuid-generator.html',
  styleUrls: ['../tool-shell.css', './uuid-generator.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UuidGeneratorTool {
  private readonly snackBar = inject(MatSnackBar);

  protected readonly maxCount = MAX_COUNT;

  // --- Options ----------------------------------------------------------
  protected readonly version = signal<UuidVersion>('v4');
  protected readonly count = signal(5);
  protected readonly uppercase = signal(false);
  protected readonly hyphens = signal(true);
  protected readonly braces = signal(false);

  /** Canonical, unformatted UUIDs. Formatting is applied on display. */
  private readonly raw = signal<string[]>([]);

  protected readonly uuids = computed(() => this.raw().map((uuid) => this.format(uuid)));

  constructor() {
    this.generate();
  }

  // --- Options handling -------------------------------------------------
  protected selectVersion(version: UuidVersion): void {
    if (this.version() === version) {
      return;
    }
    this.version.set(version);
    this.generate();
  }

  protected onCountInput(event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    this.count.set(Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.round(parsed))));
  }

  protected toggleUppercase(): void {
    this.uppercase.update((value) => !value);
  }

  protected toggleHyphens(): void {
    this.hyphens.update((value) => !value);
  }

  protected toggleBraces(): void {
    this.braces.update((value) => !value);
  }

  // --- Generation -------------------------------------------------------
  protected generate(): void {
    const make = this.version() === 'v7' ? uuidV7 : uuidV4;
    this.raw.set(Array.from({ length: this.count() }, make));
  }

  private format(uuid: string): string {
    let value = this.hyphens() ? uuid : uuid.replace(/-/g, '');
    if (this.uppercase()) {
      value = value.toUpperCase();
    }
    return this.braces() ? `{${value}}` : value;
  }

  // --- Output -----------------------------------------------------------
  protected async copyOne(uuid: string): Promise<void> {
    await navigator.clipboard.writeText(uuid);
    this.snackBar.open('UUID copied to clipboard', undefined, { duration: 2000 });
  }

  protected async copyAll(): Promise<void> {
    const all = this.uuids();
    if (!all.length) {
      return;
    }
    await navigator.clipboard.writeText(all.join('\n'));
    this.snackBar.open(`${all.length} UUIDs copied to clipboard`, undefined, { duration: 2000 });
  }

  protected download(): void {
    const blob = new Blob([this.uuids().join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `uuids-${this.version()}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}

// --- Pure helpers -------------------------------------------------------
function uuidV4(): string {
  return crypto.randomUUID();
}

/**
 * UUID v7: a 48-bit big-endian Unix timestamp in milliseconds, then 74 random
 * bits, with the version and variant fields set. Sorts chronologically, which
 * makes it a friendlier database key than v4.
 */
function uuidV7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const timestamp = Date.now();
  bytes[0] = (timestamp / 2 ** 40) & 0xff;
  bytes[1] = (timestamp / 2 ** 32) & 0xff;
  bytes[2] = (timestamp / 2 ** 24) & 0xff;
  bytes[3] = (timestamp / 2 ** 16) & 0xff;
  bytes[4] = (timestamp / 2 ** 8) & 0xff;
  bytes[5] = timestamp & 0xff;

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
