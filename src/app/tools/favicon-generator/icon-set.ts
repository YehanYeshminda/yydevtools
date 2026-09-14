/**
 * The icon set a website needs, and the two small files that go with it.
 *
 * Sizes are the ones browsers and launchers actually request: 16/32/48 for the
 * tab (bundled into one .ico as well), 180 for iOS home screens, 192 and 512
 * for Android and the manifest, plus a maskable 512 whose artwork sits inside
 * the 80% safe zone so a circular or squircle mask does not clip it.
 */
export interface IconSpec {
  name: string;
  size: number;
  /** Paint the background colour: iOS and maskable icons cannot be transparent. */
  fill: boolean;
  /** How much of the tile the artwork may cover. */
  scale: number;
}

export const ICON_SPECS: readonly IconSpec[] = [
  { name: 'favicon-16.png', size: 16, fill: false, scale: 1 },
  { name: 'favicon-32.png', size: 32, fill: false, scale: 1 },
  { name: 'favicon-48.png', size: 48, fill: false, scale: 1 },
  { name: 'apple-touch-icon.png', size: 180, fill: true, scale: 0.86 },
  { name: 'icon-192.png', size: 192, fill: false, scale: 1 },
  { name: 'icon-512.png', size: 512, fill: false, scale: 1 },
  { name: 'icon-maskable-512.png', size: 512, fill: true, scale: 0.8 },
];

/** The sizes that go into favicon.ico. */
export const ICO_SIZES: readonly number[] = [16, 32, 48];

/** ICO with PNG-compressed entries — understood by every browser in support. */
export function encodeIco(entries: readonly { size: number; png: Uint8Array }[]): Uint8Array {
  const directorySize = 6 + entries.length * 16;
  const total = directorySize + entries.reduce((sum, entry) => sum + entry.png.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, entries.length, true);

  let offset = directorySize;
  entries.forEach(({ size, png }, index) => {
    const at = 6 + index * 16;
    out[at] = size >= 256 ? 0 : size;
    out[at + 1] = size >= 256 ? 0 : size;
    view.setUint16(at + 4, 1, true); // colour planes
    view.setUint16(at + 6, 32, true); // bits per pixel
    view.setUint32(at + 8, png.length, true);
    view.setUint32(at + 12, offset, true);
    out.set(png, offset);
    offset += png.length;
  });
  return out;
}

export interface SiteOptions {
  name: string;
  shortName: string;
  theme: string;
  background: string;
  /** The source was an SVG, so the vector itself is shipped as well. */
  svg: boolean;
}

export function manifestJson(options: SiteOptions): string {
  const icons: Record<string, string>[] = [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
  if (options.svg) {
    icons.push({ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' });
  }
  return `${JSON.stringify(
    {
      name: options.name,
      short_name: options.shortName,
      start_url: '/',
      display: 'standalone',
      background_color: options.background,
      theme_color: options.theme,
      icons,
    },
    null,
    2,
  )}\n`;
}

/** The lines to paste into <head>. Order matters: the SVG, when present, wins in modern browsers. */
export function headSnippet(options: SiteOptions): string {
  const lines = [
    '<link rel="icon" href="/favicon.ico" sizes="32x32">',
    ...(options.svg ? ['<link rel="icon" type="image/svg+xml" href="/icon.svg">'] : []),
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
    `<meta name="theme-color" content="${options.theme}">`,
  ];
  return `${lines.join('\n')}\n`;
}

/** iOS and Android truncate around 12 characters; take the first words that fit. */
export function shortNameFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  let out = '';
  for (const word of words) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > 12) {
      break;
    }
    out = next;
  }
  return out || name.trim().slice(0, 12);
}
