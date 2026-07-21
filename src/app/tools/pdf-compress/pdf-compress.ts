import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { HostedPdfTool } from '../../core/hosted-pdf-tool';

type Level = 'LOW' | 'MEDIUM' | 'HIGH';

interface LevelOption {
  value: Level;
  label: string;
  hint: string;
}

/**
 * Adobe's levels describe how *much* is thrown away, so HIGH is the smallest
 * file and the softest images. The labels lead with the outcome, since that is
 * what people are choosing between.
 */
const LEVELS: LevelOption[] = [
  { value: 'LOW', label: 'Best quality', hint: 'Barely touches image detail. Smallest saving.' },
  { value: 'MEDIUM', label: 'Balanced', hint: 'A good default for sharing and email.' },
  { value: 'HIGH', label: 'Smallest file', hint: 'Noticeably softer images. Best for drafts.' },
];

@Component({
  selector: 'app-pdf-compress',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './pdf-compress.html',
  styleUrls: ['../tool-shell.css', './pdf-compress.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfCompressTool extends HostedPdfTool {
  protected readonly levels = LEVELS;
  protected readonly level = signal<Level>('MEDIUM');

  private result: Uint8Array | null = null;
  protected readonly resultSize = signal(0);

  protected readonly hasResult = computed(() => this.resultSize() > 0);

  /**
   * Negative when the output grew — which happens on PDFs that are already
   * optimised, or that are mostly vector content with nothing to downsample.
   */
  protected readonly savedBytes = computed(() => this.fileSize() - this.resultSize());

  protected readonly savedPercent = computed(() => {
    const original = this.fileSize();
    return original > 0 ? Math.round((this.savedBytes() / original) * 100) : 0;
  });

  protected readonly levelHint = computed(
    () => LEVELS.find((entry) => entry.value === this.level())?.hint ?? '',
  );

  protected override clear(): void {
    super.clear();
    this.result = null;
    this.resultSize.set(0);
  }

  protected selectLevel(level: Level): void {
    this.level.set(level);
    // The old result no longer reflects the selected level.
    this.result = null;
    this.resultSize.set(0);
  }

  protected async compress(): Promise<void> {
    const level = this.level();
    const bytes = await this.runHosted((input) => this.service.compress(input, level));
    if (bytes) {
      this.result = bytes;
      this.resultSize.set(bytes.byteLength);
    }
  }

  protected save(): void {
    if (this.result) {
      this.download(this.result, `${this.stem()}-compressed.pdf`);
    }
  }
}
