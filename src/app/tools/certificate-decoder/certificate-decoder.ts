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
import {
  CertificateInfo,
  CertificateReport,
  OfficeServicesClient,
} from '../../core/office-services.client';
import { Dropzone } from '../../shared/dropzone/dropzone';
import { Spinner } from '../../shared/spinner/spinner';
import { ToolContent } from '../../shared/tool-content/tool-content';
import { ToolPage } from '../../shared/tool-page/tool-page';

const MAX_INPUT_BYTES = 64 * 1024;
const DAY_MS = 86_400_000;

interface Row {
  label: string;
  value: string;
  warn?: boolean;
}

interface Card {
  title: string;
  kind: string;
  rows: Row[];
  extensions: CertificateInfo['extensions'];
}

/**
 * Decodes X.509 certificates. The ASN.1 walk happens on the C# service — a
 * hand-written TypeScript parser was the one thing worse than none — and this
 * side turns the report into something a person can read at a glance.
 */
@Component({
  selector: 'app-certificate-decoder',
  imports: [ToolPage, ToolContent, Dropzone, MatButtonModule, NgIcon, Spinner],
  templateUrl: './certificate-decoder.html',
  styleUrls: ['../tool-shell.css', './certificate-decoder.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CertificateDecoderTool {
  private readonly office = inject(OfficeServicesClient);

  protected readonly text = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly report = signal<CertificateReport | null>(null);

  protected readonly canDecode = computed(() => this.text().trim() !== '' && !this.busy());
  protected readonly cards = computed(() => this.report()?.certificates.map(describe) ?? []);

  constructor() {
    afterNextRender(() => this.office.warm());
  }

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }

  /** A .pem/.crt is text; a .der/.cer may be binary, which is wrapped as PEM here. */
  protected async acceptFiles(files: File[]): Promise<void> {
    const file = files[0];
    if (!file) {
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.error.set(`"${file.name}" is larger than a certificate file should be.`);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const asText = new TextDecoder().decode(bytes);
    this.text.set(asText.includes('-----BEGIN') ? asText : toPem(bytes));
    await this.decode();
  }

  protected async decode(): Promise<void> {
    const text = this.text().trim();
    if (!text || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.office.decodeCertificate(text);
      if (result.ok) {
        this.report.set(result.report);
      } else {
        this.report.set(null);
        this.error.set(result.failure.message);
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected clear(): void {
    this.text.set('');
    this.report.set(null);
    this.error.set(null);
  }
}

function describe(cert: CertificateInfo): Card {
  const now = Date.now();
  const notAfter = Date.parse(cert.notAfter);
  const notBefore = Date.parse(cert.notBefore);
  const daysLeft = Math.floor((notAfter - now) / DAY_MS);
  const expired = daysLeft < 0;
  const notYet = notBefore > now;

  const rows: Row[] = [
    { label: 'Subject', value: cert.subject },
    { label: 'Issuer', value: cert.selfSigned ? `${cert.issuer} (self-signed)` : cert.issuer },
    {
      label: 'Valid from',
      value: `${date(cert.notBefore)}${notYet ? ' — not yet valid' : ''}`,
      warn: notYet,
    },
    {
      label: 'Valid until',
      value: `${date(cert.notAfter)} — ${expired ? `expired ${-daysLeft} days ago` : `${daysLeft} days left`}`,
      warn: expired || daysLeft < 30,
    },
    { label: 'Serial number', value: cert.serialNumber },
    { label: 'Signature algorithm', value: cert.signatureAlgorithm },
    { label: 'Public key', value: publicKey(cert) },
  ];
  if (cert.subjectAlternativeNames.length) {
    rows.push({
      label: 'Subject alternative names',
      value: cert.subjectAlternativeNames.join(', '),
    });
  }
  if (cert.keyUsage.length) {
    rows.push({ label: 'Key usage', value: cert.keyUsage.join(', ') });
  }
  if (cert.extendedKeyUsage.length) {
    rows.push({ label: 'Extended key usage', value: cert.extendedKeyUsage.join(', ') });
  }
  if (cert.basicConstraints) {
    const { isCertificateAuthority, pathLength } = cert.basicConstraints;
    rows.push({
      label: 'Basic constraints',
      value: isCertificateAuthority
        ? `CA${pathLength === null ? '' : `, path length ${pathLength}`}`
        : 'Not a CA',
    });
  }
  rows.push({ label: 'SHA-256 fingerprint', value: colons(cert.fingerprints.sha256) });
  rows.push({ label: 'SHA-1 fingerprint', value: colons(cert.fingerprints.sha1) });
  if (cert.subjectKeyIdentifier) {
    rows.push({ label: 'Subject key identifier', value: colons(cert.subjectKeyIdentifier) });
  }
  if (cert.authorityKeyIdentifier) {
    rows.push({ label: 'Authority key identifier', value: colons(cert.authorityKeyIdentifier) });
  }

  const cn = /CN=([^,]+)/.exec(cert.subject)?.[1] ?? cert.subject;
  const kind = cert.basicConstraints?.isCertificateAuthority
    ? cert.selfSigned
      ? 'Root CA'
      : 'Intermediate CA'
    : 'End-entity certificate';
  return { title: cn, kind, rows, extensions: cert.extensions };
}

function publicKey(cert: CertificateInfo): string {
  const { algorithm, bits, curve } = cert.publicKey;
  const parts = [algorithm];
  if (curve) {
    parts.push(curve);
  }
  if (bits) {
    parts.push(`${bits}-bit`);
  }
  return parts.join(' ');
}

function date(iso: string): string {
  return iso
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' UTC')
    .replace(/Z$/, ' UTC');
}

function colons(hex: string): string {
  return (
    hex
      .toUpperCase()
      .match(/.{1,2}/g)
      ?.join(':') ?? hex
  );
}

function toPem(der: Uint8Array): string {
  let binary = '';
  for (const byte of der) {
    binary += String.fromCharCode(byte);
  }
  const body =
    btoa(binary)
      .match(/.{1,64}/g)
      ?.join('\n') ?? '';
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
}
