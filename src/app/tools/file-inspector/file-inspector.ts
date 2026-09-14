import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { downloadBytes, fileStem } from '../../core/download';
import { toolForFile } from '../../core/drop-targets';
import { FileHandoff } from '../../core/file-handoff';
import { formatBytes } from '../../core/format';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Skeleton } from '../../shared/skeleton/skeleton';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { HashWorkerClient, type Digest } from '../hash-generator/hash-worker.client';
import { TOOLS } from '../tools.data';
import { sniff, type Sniffed } from './sniff';

/** Hashing is linear and the document parsers hold the whole file; this is plenty. */
const MAX_INPUT_BYTES = 100 * 1024 * 1024;

interface Group {
  name: string;
  sensitive: boolean;
  fields: { label: string; value: string }[];
}

/** The cleaned copy, built up front so the button can say what it removes. */
interface Stripped {
  bytes: Uint8Array;
  name: string;
  /** What the copy no longer carries, in plain words. */
  summary: string;
}

@Component({
  selector: 'app-file-inspector',
  imports: [ToolPage, ToolContent, Dropzone, Skeleton, MatButtonModule, NgIcon],
  templateUrl: './file-inspector.html',
  // The findings layout is the EXIF viewer's: same two columns, same grouped
  // tables, same risk card. Sharing the sheet keeps the two inspectors looking
  // like one family instead of drifting apart.
  styleUrls: ['../tool-shell.css', '../exif-viewer/exif-viewer.css', './file-inspector.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileInspectorTool implements OnDestroy {
  private readonly snackBar = inject(MatSnackBar);
  private readonly clipboard = inject(ClipboardService);
  private readonly handoff = inject(FileHandoff);
  private readonly hasher = new HashWorkerClient();

  protected readonly formatBytes = formatBytes;

  // --- State ------------------------------------------------------------
  protected readonly name = signal('');
  protected readonly size = signal(0);
  /** What the browser claimed, from the OS registry — shown beside the truth. */
  protected readonly browserType = signal('');
  protected readonly sniffed = signal<Sniffed | null>(null);
  protected readonly digests = signal<Digest[] | null>(null);
  protected readonly groups = signal<Group[]>([]);
  /** Plain-English notes about what the file gives away. */
  protected readonly warnings = signal<string[]>([]);
  protected readonly pages = signal<number | null>(null);
  protected readonly stripped = signal<Stripped | null>(null);
  /** Why there is no clean copy on offer, when there is metadata but no button. */
  protected readonly stripNote = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  /** The viewer this file belongs in, if the site has one. */
  protected readonly opener = signal<{ slug: string; name: string } | null>(null);

  protected readonly hasFile = computed(() => this.name() !== '');
  protected readonly fieldCount = computed(() =>
    this.groups().reduce((total, group) => total + group.fields.length, 0),
  );
  protected readonly identifying = computed(() =>
    this.groups()
      .filter((group) => group.sensitive)
      .reduce((total, group) => total + group.fields.length, 0),
  );

  private file: File | null = null;

  ngOnDestroy(): void {
    this.hasher.terminate();
  }

  // --- Input ------------------------------------------------------------
  protected async inspect(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) {
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.snackBar.open(
        `"${file.name}" is too large (max ${formatBytes(MAX_INPUT_BYTES)}).`,
        'Dismiss',
        {
          duration: 6000,
        },
      );
      return;
    }

    this.reset();
    this.file = file;
    this.loading.set(true);
    this.name.set(file.name);
    this.size.set(file.size);
    this.browserType.set(file.type);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const found = sniff(bytes, file.name);
      this.sniffed.set(found);

      // The viewer is chosen from what the bytes are, not what the name claims:
      // a PDF saved as .jpg belongs in the PDF Viewer, not the image tools.
      const slug = toolForFile(`file.${found.kind.extensions[0] ?? ''}`, found.kind.mime);
      const tool = slug !== 'file-inspector' ? TOOLS.find((entry) => entry.slug === slug) : null;
      this.opener.set(tool ? { slug: tool.slug, name: tool.name } : null);

      // Hashes and metadata are independent, and hashing a large file is the
      // slow part, so neither waits for the other.
      void this.hasher
        .digest(bytes, '')
        .then((digests) => this.digests.set(digests))
        .catch(() => this.digests.set([]));

      await this.readMetadata(found, file, bytes);
    } catch {
      this.error.set('This file could not be read.');
    } finally {
      this.loading.set(false);
    }
  }

  protected reset(): void {
    this.file = null;
    this.name.set('');
    this.size.set(0);
    this.browserType.set('');
    this.sniffed.set(null);
    this.digests.set(null);
    this.groups.set([]);
    this.warnings.set([]);
    this.pages.set(null);
    this.stripped.set(null);
    this.stripNote.set(null);
    this.error.set(null);
    this.opener.set(null);
  }

  // --- Actions ----------------------------------------------------------
  protected copy(digest: Digest): void {
    void this.clipboard.copy(digest.hex, { message: `${digest.algorithm} copied to clipboard` });
  }

  protected copyAll(): void {
    const lines = [
      `# ${this.name()}`,
      `Type: ${this.sniffed()?.kind.name ?? ''}`,
      `Size: ${this.size()} bytes`,
      '',
    ];
    for (const digest of this.digests() ?? []) {
      lines.push(`${digest.algorithm}: ${digest.hex}`);
    }
    for (const group of this.groups()) {
      lines.push('', `# ${group.name}`);
      for (const field of group.fields) {
        lines.push(`${field.label}: ${field.value}`);
      }
    }
    void this.clipboard.copy(lines.join('\n').trim(), { message: 'Report copied to clipboard' });
  }

  protected downloadClean(): void {
    const clean = this.stripped();
    if (clean) {
      downloadBytes(
        clean.bytes,
        clean.name,
        this.sniffed()?.kind.mime || 'application/octet-stream',
      );
    }
  }

  protected openInTool(): void {
    const target = this.opener();
    if (this.file && target) {
      this.handoff.sendFile(this.file, target.slug);
    }
  }

  // --- Internals --------------------------------------------------------
  private async readMetadata(found: Sniffed, file: File, bytes: Uint8Array): Promise<void> {
    switch (found.kind.family) {
      case 'image':
        return this.readImage(file, bytes);
      case 'pdf':
        return this.readPdf(file, bytes);
      case 'office':
        return this.readOffice(file, bytes);
      default:
        return;
    }
  }

  private async readImage(file: File, bytes: Uint8Array): Promise<void> {
    const [{ load }, { report, stripMetadata }] = await Promise.all([
      import('exifreader'),
      import('../../core/image/metadata'),
    ]);
    let tags: unknown;
    try {
      tags = await load(file, { async: true, expanded: false });
    } catch {
      return; // No readable metadata is the good outcome.
    }
    const found = report(tags as never);
    this.groups.set(found.groups);
    this.warnings.set(found.warnings);
    if (found.count === 0) {
      return;
    }
    const clean = stripMetadata(bytes);
    if (clean) {
      this.stripped.set({
        bytes: clean,
        name: cleanName(file.name, 'image'),
        summary: `Removes ${formatBytes(bytes.byteLength - clean.byteLength)} of metadata by editing the container. The pixels are copied across untouched, so nothing is re-compressed.`,
      });
    } else if (found.identifying > 0) {
      this.stripNote.set(
        'This image format cannot be cleaned without re-encoding it. Convert it to JPEG or PNG with the Image Converter first, then bring it back.',
      );
    }
  }

  private async readPdf(file: File, bytes: Uint8Array): Promise<void> {
    const { readPdfMetadata, stripPdfMetadata } = await import('./pdf-metadata');
    const meta = await readPdfMetadata(bytes);
    if (!meta) {
      this.warnings.set([
        'This PDF is damaged or unusual enough that its document information could not be read.',
      ]);
      return;
    }
    this.pages.set(meta.pages);
    if (meta.encrypted) {
      this.warnings.set([
        'This PDF is password-protected. Its document information is encrypted with the rest of the file and cannot be read or removed here; unlock it first with Unlock PDF.',
      ]);
      return;
    }
    this.setFields('Document information', meta.fields);
    if (meta.fields.length === 0 && !meta.hasXmp) {
      return;
    }
    this.warnings.set(describe(meta.fields));
    const clean = await stripPdfMetadata(bytes);
    if (clean) {
      this.stripped.set({
        bytes: clean,
        name: cleanName(file.name, 'document'),
        summary: `Empties the document information dictionary and removes the XMP metadata stream${meta.hasXmp ? ' this file carries' : ', if any'}. The pages are re-saved exactly as they are.`,
      });
    }
  }

  private async readOffice(file: File, bytes: Uint8Array): Promise<void> {
    const { readOfficeMetadata, stripOfficeMetadata } = await import('./office-metadata');
    const meta = readOfficeMetadata(bytes);
    if (!meta) {
      return;
    }
    this.setFields('Document properties', meta.fields);
    const pages = meta.fields.find((field) => field.label === 'Pages' || field.label === 'Slides');
    if (pages) {
      this.pages.set(Number(pages.value) || null);
    }

    const warnings = describe(meta.fields);
    if (meta.comments || meta.revisions) {
      const parts = [];
      if (meta.comments) {
        parts.push(`${meta.comments} comment${meta.comments === 1 ? '' : 's'}`);
      }
      if (meta.revisions) {
        parts.push(`${meta.revisions} tracked change${meta.revisions === 1 ? '' : 's'}`);
      }
      const by = meta.authors.length ? ` by ${meta.authors.join(', ')}` : '';
      warnings.push(
        `Contains ${parts.join(' and ')}${by}. These are part of the document body and stay in the clean copy; accept or delete them in Word to remove the names.`,
      );
    }
    if (meta.hasThumbnail) {
      warnings.push(
        'Carries a thumbnail image of the first page, which shows its content even in a file browser.',
      );
    }
    this.warnings.set(warnings);

    const clean = stripOfficeMetadata(bytes);
    if (clean) {
      this.stripped.set({
        bytes: clean,
        name: cleanName(file.name, 'document'),
        summary: `Removes the author, editor, company, dates and editing time${meta.hasThumbnail ? ', and the thumbnail' : ''}. Every other part of the package is copied across byte for byte.`,
      });
    }
  }

  private setFields(
    name: string,
    fields: { label: string; value: string; identifying: boolean }[],
  ): void {
    const sensitive = fields.filter((field) => field.identifying);
    const technical = fields.filter((field) => !field.identifying);
    const groups: Group[] = [];
    if (sensitive.length) {
      groups.push({ name: `${name} — identifying`, sensitive: true, fields: sensitive });
    }
    if (technical.length) {
      groups.push({ name, sensitive: false, fields: technical });
    }
    this.groups.set(groups);
  }
}

/** One sentence per identifying field, for the risk card. */
function describe(fields: { label: string; value: string; identifying: boolean }[]): string[] {
  return fields
    .filter((field) => field.identifying)
    .map((field) => `${field.label}: ${field.value}`);
}

function cleanName(name: string, fallback: string): string {
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  return `${fileStem(name, fallback)}-clean${extension}`;
}
