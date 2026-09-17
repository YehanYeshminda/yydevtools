import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { NgIcon } from '@ng-icons/core';

import { ClipboardService } from '../../core/clipboard.service';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';
import { buildFragment, open, parseFragment, seal, type LinkParts } from './crypto';

/** The windows the Worker will accept, and how to describe them. */
const EXPIRIES = [
  { value: '1h', label: '1 hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
] as const;

type Expiry = (typeof EXPIRIES)[number]['value'];

/**
 * Ceiling on the plaintext.
 *
 * The Worker caps the base64 ciphertext at 64 KB; encryption and base64 both
 * add to the length, so this leaves comfortable room underneath. It is a tool
 * for a password or a key, not a file transfer.
 */
const MAX_SECRET = 32 * 1024;

type Mode = 'write' | 'read';

@Component({
  selector: 'app-secret-link',
  imports: [ToolPage, ToolContent, Spinner, MatButtonModule, NgIcon],
  templateUrl: './secret-link.html',
  styleUrls: ['../tool-shell.css', './secret-link.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecretLinkTool {
  private readonly clipboard = inject(ClipboardService);

  protected readonly expiries = EXPIRIES;
  protected readonly maxSecret = MAX_SECRET;

  /**
   * Which half of the tool to show, taken from the fragment.
   *
   * Read through the router rather than off `location` once at start-up: a
   * fragment-only change does not reload the page, so a one-shot read left
   * someone who pasted a link into an already-open tab looking at the wrong
   * half of the tool. During the prerender there is no fragment, so the page
   * ships as the writing form, which is the right default.
   */
  private readonly fragment = toSignal(inject(ActivatedRoute).fragment);
  private readonly router = inject(Router);
  private readonly link = computed<LinkParts | null>(() => parseFragment(this.fragment() ?? ''));
  protected readonly mode = computed<Mode>(() => (this.link() ? 'read' : 'write'));

  // --- Writing ----------------------------------------------------------
  protected readonly secret = signal('');
  protected readonly expiry = signal<Expiry>('24h');
  protected readonly created = signal('');

  // --- Reading ----------------------------------------------------------
  protected readonly revealed = signal<string | null>(null);

  // --- Shared -----------------------------------------------------------
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly length = computed(() => this.secret().length);
  protected readonly tooLong = computed(() => this.length() > MAX_SECRET);
  protected readonly canCreate = computed(
    () => this.secret().trim() !== '' && !this.tooLong() && !this.busy(),
  );

  protected onSecretInput(event: Event): void {
    this.secret.set((event.target as HTMLTextAreaElement).value);
  }

  protected setExpiry(value: Expiry): void {
    this.expiry.set(value);
  }

  // --- Writing ----------------------------------------------------------
  protected async create(): Promise<void> {
    if (!this.canCreate()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      // Encrypt first, so what leaves this tab is already opaque.
      const sealed = await seal(this.secret());
      const response = await fetch('/api/secret/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ciphertext: sealed.ciphertext,
          iv: sealed.iv,
          ttl: this.expiry(),
        }),
      });
      if (!response.ok) {
        throw new Error(await messageFrom(response));
      }
      const { id } = (await response.json()) as { id: string };
      const url = new URL(location.href);
      url.hash = buildFragment({ id, key: sealed.key });
      this.created.set(url.toString());
      // The plaintext has done its job; there is no reason to keep it on screen.
      this.secret.set('');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The link could not be created.');
    } finally {
      this.busy.set(false);
    }
  }

  protected copyLink(): void {
    void this.clipboard.copy(this.created(), { label: 'Link' });
  }

  protected writeAnother(): void {
    this.created.set('');
    this.error.set(null);
  }

  // --- Reading ----------------------------------------------------------

  /**
   * Fetches and decrypts, on a click rather than on load.
   *
   * This is the whole reason the read is a button: chat clients and mail
   * scanners fetch the URLs they are shown, and anything that happened
   * automatically here would burn the secret before the recipient saw it.
   */
  protected async reveal(): Promise<void> {
    const link = this.link();
    if (!link || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const response = await fetch('/api/secret/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: link.id }),
      });
      if (!response.ok) {
        throw new Error(await messageFrom(response));
      }
      const blob = (await response.json()) as { ciphertext: string; iv: string };
      this.revealed.set(await open(blob.ciphertext, blob.iv, link.key));
    } catch (error) {
      this.error.set(
        error instanceof Error && error.message
          ? error.message
          : 'This secret could not be decrypted. The link may be incomplete.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected copySecret(): void {
    void this.clipboard.copy(this.revealed() ?? '', { label: 'Secret' });
  }

  /** Leaves the reading half for the writing one, dropping the fragment. */
  protected writeInstead(): void {
    this.revealed.set(null);
    this.error.set(null);
    // Through the router, so the fragment signal above sees it go.
    void this.router.navigate([], { fragment: undefined, replaceUrl: true });
  }
}

async function messageFrom(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) {
      return body.error.message;
    }
  } catch {
    // No JSON body; fall through to something generic.
  }
  return 'The server could not handle that request.';
}
