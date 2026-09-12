import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HostedPdfTool } from '../../core/hosted-pdf-tool';
import { OfficeServicesClient } from '../../core/office-services.client';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { Spinner } from '../../shared/spinner/spinner';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { ToolContent } from '../../shared/tool-content/tool-content';

/**
 * Protect PDF and Unlock PDF are one component under two routes. They share
 * every step but the last — pick a file, type a password, download — and the
 * two slugs exist so each has its own landing page, not because the tools
 * differ. The route's `data.mode` decides which one this is.
 */
@Component({
  selector: 'app-pdf-protect',
  imports: [ToolPage, Dropzone, ToolContent, RouterLink, MatButtonModule, NgIcon, Spinner],
  templateUrl: './pdf-protect.html',
  styleUrls: ['../tool-shell.css', './pdf-protect.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfProtectTool extends HostedPdfTool {
  protected readonly hostedService = 'office' as const;
  private readonly office = inject(OfficeServicesClient);

  protected readonly unlock = inject(ActivatedRoute).snapshot.data['mode'] === 'unlock';
  protected readonly slug = this.unlock ? 'pdf-unlock' : 'pdf-protect';

  protected readonly password = signal('');
  protected readonly owner = signal('');
  protected readonly reveal = signal(false);

  protected readonly ready = computed(() => this.canRun() && this.password() !== '');

  protected onPassword(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  protected onOwner(event: Event): void {
    this.owner.set((event.target as HTMLInputElement).value);
  }

  protected toggleReveal(): void {
    this.reveal.update((on) => !on);
  }

  protected async run(): Promise<void> {
    const password = this.password();
    const result = await this.runHosted((bytes) =>
      this.unlock
        ? this.office.unlockPdf(bytes, password)
        : this.office.protectPdf(bytes, password, this.owner()),
    );
    if (result) {
      this.download(result, `${this.stem()}-${this.unlock ? 'unlocked' : 'protected'}.pdf`);
    }
  }

  protected override clear(): void {
    super.clear();
    this.password.set('');
    this.owner.set('');
  }
}
