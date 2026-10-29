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
import { downloadText } from '../../core/download';
import { syncToolState } from '../../core/tool-state';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { ShareLink } from '../../shared/share-link/share-link';
import { ToolContent } from '../../shared/tool-content/tool-content';
import {
  NAMESPACES,
  createUuidV7Generator,
  describeUuid,
  formatUuid,
  parseUuid,
  uuidV4,
  uuidV5,
  type UuidFormat,
} from './uuid';

export type UuidVersion = 'v4' | 'v7' | 'v5';
type Namespace = keyof typeof NAMESPACES | 'custom';

const MIN_COUNT = 1;
const MAX_COUNT = 500;
const MAX_NAMES = 500;

const FORMATS: readonly { value: UuidFormat; label: string }[] = [
  { value: 'standard', label: 'Standard (8-4-4-4-12)' },
  { value: 'compact', label: 'No hyphens (32 hex digits)' },
  { value: 'braces', label: 'Braces {…}, as .NET and the registry write it' },
  { value: 'urn', label: 'URN (urn:uuid:…)' },
  { value: 'base64url', label: 'Base64url (22 characters)' },
];

const NAMESPACE_OPTIONS: readonly { value: Namespace; label: string }[] = [
  { value: 'dns', label: 'DNS (domain names)' },
  { value: 'url', label: 'URL' },
  { value: 'oid', label: 'OID (ISO object identifiers)' },
  { value: 'x500', label: 'X.500 distinguished names' },
  { value: 'custom', label: 'Custom namespace UUID' },
];

@Component({
  selector: 'app-uuid-generator',
  imports: [ToolPage, ToolContent, ShareLink, MatButtonModule, NgIcon],
  templateUrl: './uuid-generator.html',
  styleUrls: ['../tool-shell.css', './uuid-generator.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UuidGeneratorTool {
  private readonly clipboard = inject(ClipboardService);
  private readonly nextV7 = createUuidV7Generator();
  /** Drops a slower v5 run that an edit has already overtaken. */
  private run = 0;

  protected readonly maxCount = MAX_COUNT;
  protected readonly formats = FORMATS;
  protected readonly namespaces = NAMESPACE_OPTIONS;

  // --- Options ----------------------------------------------------------
  protected readonly version = signal<UuidVersion>('v4');
  protected readonly count = signal(5);
  protected readonly format = signal<UuidFormat>('standard');
  protected readonly uppercase = signal(false);
  protected readonly namespace = signal<Namespace>('dns');
  protected readonly customNamespace = signal('');
  protected readonly names = signal('example.com');

  /** Canonical, unformatted UUIDs. Formatting is applied on display. */
  private readonly raw = signal<string[]>([]);
  protected readonly error = signal('');

  protected readonly inspectText = signal('');

  /**
   * Only the settings travel, plus the v5 names, which are the input of a
   * deterministic result. Generated random UUIDs deliberately do not: a link
   * that pinned someone else's would be worse than useless.
   */
  protected readonly shared = syncToolState({
    key: 'uuid-generator',
    snapshot: () => ({
      version: this.version(),
      count: this.count(),
      format: this.format(),
      uppercase: this.uppercase(),
      namespace: this.namespace(),
      customNamespace: this.customNamespace(),
      names: this.names(),
      inspect: this.inspectText(),
    }),
    // ponytail: links from before the format menu carried hyphens/braces
    // toggles; those keys are filtered out now, so such a link opens in the
    // standard format. Map them here if old links ever matter.
    restore: (state) => {
      if (state.version === 'v4' || state.version === 'v7' || state.version === 'v5') {
        this.version.set(state.version);
      }
      if (typeof state.count === 'number' && Number.isFinite(state.count)) {
        this.count.set(Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.round(state.count))));
      }
      if (FORMATS.some((f) => f.value === state.format)) this.format.set(state.format!);
      if (typeof state.uppercase === 'boolean') this.uppercase.set(state.uppercase);
      if (NAMESPACE_OPTIONS.some((n) => n.value === state.namespace)) {
        this.namespace.set(state.namespace!);
      }
      if (typeof state.customNamespace === 'string') {
        this.customNamespace.set(state.customNamespace);
      }
      if (typeof state.names === 'string') this.names.set(state.names);
      if (typeof state.inspect === 'string') this.inspectText.set(state.inspect);
      this.generate();
    },
  });

  protected readonly uuids = computed(() =>
    this.raw().map((uuid) => formatUuid(uuid, this.format(), this.uppercase())),
  );

  /** What the pasted UUID turns out to be, or null when the box is empty. */
  protected readonly inspected = computed(() => {
    const text = this.inspectText().trim();
    if (!text) return null;
    const bytes = parseUuid(text);
    return bytes ? describeUuid(bytes) : ('invalid' as const);
  });

  constructor() {
    // Generation is confined to the browser. The page is prerendered at build
    // time, so generating in the constructor baked one batch into the static
    // HTML and served those same "unique" ids to every visitor who copied
    // them before the app hydrated. A restored session generates itself.
    afterNextRender(() => {
      if (!this.raw().length) this.generate();
    });
  }

  // --- Options handling -------------------------------------------------
  protected selectVersion(version: UuidVersion): void {
    if (this.version() === version) return;
    this.version.set(version);
    this.generate();
  }

  protected onCountInput(event: Event): void {
    const parsed = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(parsed)) return;
    this.count.set(Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.round(parsed))));
  }

  protected onFormat(event: Event): void {
    this.format.set((event.target as HTMLSelectElement).value as UuidFormat);
  }

  protected toggleUppercase(): void {
    this.uppercase.update((value) => !value);
  }

  protected onNamespace(event: Event): void {
    this.namespace.set((event.target as HTMLSelectElement).value as Namespace);
    this.generate();
  }

  protected onCustomNamespace(event: Event): void {
    this.customNamespace.set((event.target as HTMLInputElement).value);
    this.generate();
  }

  protected onNames(event: Event): void {
    this.names.set((event.target as HTMLTextAreaElement).value);
    this.generate();
  }

  protected onInspect(event: Event): void {
    this.inspectText.set((event.target as HTMLInputElement).value);
  }

  // --- Generation -------------------------------------------------------
  protected generate(): void {
    const run = ++this.run;
    this.error.set('');
    if (this.version() === 'v5') {
      void this.generateV5(run);
      return;
    }
    const make = this.version() === 'v7' ? this.nextV7 : uuidV4;
    this.raw.set(Array.from({ length: this.count() }, () => make()));
  }

  private async generateV5(run: number): Promise<void> {
    const namespace =
      this.namespace() === 'custom'
        ? this.customNamespace()
        : NAMESPACES[this.namespace() as keyof typeof NAMESPACES];
    const names = this.names()
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .slice(0, MAX_NAMES);

    if (!parseUuid(namespace)) {
      this.raw.set([]);
      this.error.set('The custom namespace must itself be a UUID, such as one you generated here.');
      return;
    }
    const out = await Promise.all(names.map((name) => uuidV5(name, namespace)));
    if (run === this.run) this.raw.set(out);
  }

  // --- Output -----------------------------------------------------------
  protected copyOne(uuid: string): void {
    void this.clipboard.copy(uuid, { message: 'UUID copied to clipboard' });
  }

  protected copyAll(): void {
    const all = this.uuids();
    void this.clipboard.copy(all.join('\n'), {
      message: `${all.length} UUIDs copied to clipboard`,
    });
  }

  protected download(): void {
    downloadText(this.uuids().join('\n'), `uuids-${this.version()}.txt`);
  }
}
