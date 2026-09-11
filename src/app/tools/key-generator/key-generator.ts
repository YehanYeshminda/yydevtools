import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { downloadText } from '../../core/download';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { KEY_CHOICES, type KeyAlgorithm, type KeyPairPem, generateKeyPair } from './key-pair';

/**
 * Generates an RSA or EC key pair in the browser.
 *
 * Deliberately not wired to `syncToolState`: a private key is the one thing on
 * this site that must not be mirrored into session storage or survive into a
 * URL, for the same reason the JWT Decoder opts out. Every pair is a fresh one.
 */
@Component({
  selector: 'app-key-generator',
  imports: [ToolPage, ToolContent, MatButtonModule, NgIcon],
  templateUrl: './key-generator.html',
  styleUrls: ['../tool-shell.css', './key-generator.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyGeneratorTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly choices = KEY_CHOICES;
  protected readonly algorithm = signal<KeyAlgorithm>('ec-p256');
  protected readonly pair = signal<KeyPairPem | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected choose(algorithm: KeyAlgorithm): void {
    this.algorithm.set(algorithm);
    // The old pair belongs to the old algorithm; leaving it on screen under a
    // new label is the kind of small lie that gets a wrong key deployed.
    this.pair.set(null);
  }

  protected async generate(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      // RSA 4096 can take a couple of seconds and blocks the thread; yield
      // first so the button's busy state actually paints before it starts.
      await new Promise((resolve) => setTimeout(resolve, 0));
      this.pair.set(await generateKeyPair(this.algorithm()));
    } catch {
      this.error.set(
        'Your browser could not generate that key pair. Try a different algorithm — some browsers restrict the larger RSA sizes.',
      );
      this.pair.set(null);
    } finally {
      this.busy.set(false);
    }
  }

  protected copy(text: string, what: string): void {
    void this.clipboard.copy(text, { message: `${what} copied to clipboard` });
  }

  protected download(text: string, name: string): void {
    downloadText(text, name, 'application/x-pem-file');
  }

  protected clear(): void {
    this.pair.set(null);
    this.error.set(null);
  }
}
