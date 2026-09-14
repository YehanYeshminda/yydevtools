/**
 * What a file *is*, from its bytes rather than its name.
 *
 * A browser fills in `File.type` from the OS registry, which is blank for
 * anything the machine has no app for and follows the extension anyway, so it
 * is no witness at all when the question is "why will this .jpg not open".
 * Nearly every binary format starts with a fixed signature, and the ones that
 * do not (ZIP-based Office files, legacy OLE documents) carry a recognisable
 * name a little way in. This reads those and says what it found — and, when
 * the extension tells a different story, says that too.
 *
 * Pure and dependency-free so it can be unit-tested on plain byte arrays.
 */

export type Family =
  | 'image'
  | 'pdf'
  | 'office'
  | 'archive'
  | 'audio'
  | 'video'
  | 'font'
  | 'executable'
  | 'data'
  | 'text'
  | 'unknown';

export interface FileKind {
  /** Plain name, e.g. "PDF document". */
  name: string;
  /** Extensions this kind normally carries, lower-case, no dot. */
  extensions: string[];
  mime: string;
  family: Family;
}

export interface Sniffed {
  kind: FileKind;
  /** The extension in the file name, lower-case, or '' when it has none. */
  extension: string;
  /** Set when the name and the bytes disagree — the finding people came for. */
  mismatch: string | null;
  /** The first 16 bytes as spaced hex: the evidence for the verdict. */
  header: string;
  /** Anything else worth knowing: macros, line endings, an encoding. */
  notes: string[];
}

interface Signature extends FileKind {
  /** Bytes (or a latin-1 string) expected at `at`, default 0. */
  sig: string | number[];
  at?: number;
}

const text = (name: string, extensions: string[], mime = 'text/plain'): FileKind => ({
  name,
  extensions,
  mime,
  family: 'text',
});

const UNKNOWN: FileKind = {
  name: 'Unknown binary data',
  extensions: [],
  mime: '',
  family: 'unknown',
};
const EMPTY: FileKind = { name: 'Empty file', extensions: [], mime: '', family: 'unknown' };

/**
 * Fixed signatures, most specific first. ZIP, OLE and ISO-BMFF (`ftyp`) are
 * handled separately because one signature covers many formats.
 */
const SIGNATURES: Signature[] = [
  {
    sig: '%PDF-',
    name: 'PDF document',
    extensions: ['pdf'],
    mime: 'application/pdf',
    family: 'pdf',
  },
  {
    sig: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    name: 'PNG image',
    extensions: ['png'],
    mime: 'image/png',
    family: 'image',
  },
  {
    sig: [0xff, 0xd8, 0xff],
    name: 'JPEG image',
    extensions: ['jpg', 'jpeg', 'jpe', 'jfif'],
    mime: 'image/jpeg',
    family: 'image',
  },
  { sig: 'GIF8', name: 'GIF image', extensions: ['gif'], mime: 'image/gif', family: 'image' },
  {
    sig: 'WEBP',
    at: 8,
    name: 'WebP image',
    extensions: ['webp'],
    mime: 'image/webp',
    family: 'image',
  },
  {
    sig: 'WAVE',
    at: 8,
    name: 'WAV audio',
    extensions: ['wav'],
    mime: 'audio/wav',
    family: 'audio',
  },
  {
    sig: 'AVI ',
    at: 8,
    name: 'AVI video',
    extensions: ['avi'],
    mime: 'video/x-msvideo',
    family: 'video',
  },
  {
    sig: 'AIFF',
    at: 8,
    name: 'AIFF audio',
    extensions: ['aif', 'aiff'],
    mime: 'audio/aiff',
    family: 'audio',
  },
  { sig: 'BM', name: 'BMP image', extensions: ['bmp'], mime: 'image/bmp', family: 'image' },
  {
    sig: 'II*\0',
    name: 'TIFF image',
    extensions: ['tif', 'tiff'],
    mime: 'image/tiff',
    family: 'image',
  },
  {
    sig: 'MM\0*',
    name: 'TIFF image',
    extensions: ['tif', 'tiff'],
    mime: 'image/tiff',
    family: 'image',
  },
  {
    sig: [0, 0, 1, 0],
    name: 'Windows icon',
    extensions: ['ico'],
    mime: 'image/x-icon',
    family: 'image',
  },
  {
    sig: [0, 0, 2, 0],
    name: 'Windows cursor',
    extensions: ['cur'],
    mime: 'image/x-icon',
    family: 'image',
  },
  {
    sig: '8BPS',
    name: 'Photoshop document',
    extensions: ['psd'],
    mime: 'image/vnd.adobe.photoshop',
    family: 'image',
  },
  {
    sig: [0x1f, 0x8b],
    name: 'gzip archive',
    extensions: ['gz', 'tgz'],
    mime: 'application/gzip',
    family: 'archive',
  },
  {
    sig: 'BZh',
    name: 'bzip2 archive',
    extensions: ['bz2'],
    mime: 'application/x-bzip2',
    family: 'archive',
  },
  {
    sig: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00],
    name: 'xz archive',
    extensions: ['xz'],
    mime: 'application/x-xz',
    family: 'archive',
  },
  {
    sig: [0x28, 0xb5, 0x2f, 0xfd],
    name: 'Zstandard archive',
    extensions: ['zst'],
    mime: 'application/zstd',
    family: 'archive',
  },
  {
    sig: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c],
    name: '7-Zip archive',
    extensions: ['7z'],
    mime: 'application/x-7z-compressed',
    family: 'archive',
  },
  {
    sig: 'Rar!\x1a\x07',
    name: 'RAR archive',
    extensions: ['rar'],
    mime: 'application/vnd.rar',
    family: 'archive',
  },
  {
    sig: 'ustar',
    at: 257,
    name: 'tar archive',
    extensions: ['tar'],
    mime: 'application/x-tar',
    family: 'archive',
  },
  {
    sig: 'SQLite format 3\0',
    name: 'SQLite database',
    extensions: ['sqlite', 'db', 'sqlite3'],
    mime: 'application/vnd.sqlite3',
    family: 'data',
  },
  {
    sig: 'PAR1',
    name: 'Parquet data',
    extensions: ['parquet'],
    mime: 'application/vnd.apache.parquet',
    family: 'data',
  },
  {
    sig: [0xd4, 0xc3, 0xb2, 0xa1],
    name: 'Packet capture',
    extensions: ['pcap', 'cap'],
    mime: 'application/vnd.tcpdump.pcap',
    family: 'data',
  },
  {
    sig: [0xa1, 0xb2, 0xc3, 0xd4],
    name: 'Packet capture',
    extensions: ['pcap', 'cap'],
    mime: 'application/vnd.tcpdump.pcap',
    family: 'data',
  },
  {
    sig: [0x0a, 0x0d, 0x0d, 0x0a],
    name: 'Packet capture (pcapng)',
    extensions: ['pcapng'],
    mime: 'application/x-pcapng',
    family: 'data',
  },
  {
    sig: 'DICM',
    at: 128,
    name: 'DICOM medical image',
    extensions: ['dcm', 'dicom'],
    mime: 'application/dicom',
    family: 'data',
  },
  {
    sig: 'CD001',
    at: 0x8001,
    name: 'ISO disc image',
    extensions: ['iso'],
    mime: 'application/x-iso9660-image',
    family: 'data',
  },
  {
    sig: 'MZ',
    name: 'Windows program or DLL',
    extensions: ['exe', 'dll', 'sys', 'scr', 'ocx', 'cpl', 'msi'],
    mime: 'application/vnd.microsoft.portable-executable',
    family: 'executable',
  },
  {
    sig: '\x7fELF',
    name: 'Linux executable or library',
    extensions: ['so', 'elf', 'o', 'bin'],
    mime: 'application/x-elf',
    family: 'executable',
  },
  {
    sig: [0xfe, 0xed, 0xfa, 0xce],
    name: 'macOS executable',
    extensions: ['dylib', 'bundle'],
    mime: 'application/x-mach-binary',
    family: 'executable',
  },
  {
    sig: [0xfe, 0xed, 0xfa, 0xcf],
    name: 'macOS executable',
    extensions: ['dylib', 'bundle'],
    mime: 'application/x-mach-binary',
    family: 'executable',
  },
  {
    sig: [0xcf, 0xfa, 0xed, 0xfe],
    name: 'macOS executable',
    extensions: ['dylib', 'bundle'],
    mime: 'application/x-mach-binary',
    family: 'executable',
  },
  {
    sig: [0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00],
    name: 'Windows shortcut',
    extensions: ['lnk'],
    mime: 'application/x-ms-shortcut',
    family: 'executable',
  },
  {
    sig: '\0asm',
    name: 'WebAssembly module',
    extensions: ['wasm'],
    mime: 'application/wasm',
    family: 'executable',
  },
  {
    sig: 'dex\n',
    name: 'Android Dalvik executable',
    extensions: ['dex'],
    mime: 'application/octet-stream',
    family: 'executable',
  },
  { sig: 'wOFF', name: 'WOFF web font', extensions: ['woff'], mime: 'font/woff', family: 'font' },
  {
    sig: 'wOF2',
    name: 'WOFF2 web font',
    extensions: ['woff2'],
    mime: 'font/woff2',
    family: 'font',
  },
  { sig: 'OTTO', name: 'OpenType font', extensions: ['otf'], mime: 'font/otf', family: 'font' },
  {
    sig: [0, 1, 0, 0],
    name: 'TrueType font',
    extensions: ['ttf'],
    mime: 'font/ttf',
    family: 'font',
  },
  {
    sig: 'ttcf',
    name: 'TrueType font collection',
    extensions: ['ttc'],
    mime: 'font/collection',
    family: 'font',
  },
  { sig: 'ID3', name: 'MP3 audio', extensions: ['mp3'], mime: 'audio/mpeg', family: 'audio' },
  { sig: 'fLaC', name: 'FLAC audio', extensions: ['flac'], mime: 'audio/flac', family: 'audio' },
  {
    sig: 'OggS',
    name: 'Ogg container (Vorbis, Opus or Theora)',
    extensions: ['ogg', 'oga', 'ogv', 'opus'],
    mime: 'application/ogg',
    family: 'audio',
  },
  {
    sig: 'MThd',
    name: 'MIDI music',
    extensions: ['mid', 'midi'],
    mime: 'audio/midi',
    family: 'audio',
  },
  { sig: 'FLV', name: 'Flash video', extensions: ['flv'], mime: 'video/x-flv', family: 'video' },
  {
    sig: [0x30, 0x26, 0xb2, 0x75],
    name: 'Windows Media (ASF)',
    extensions: ['wmv', 'wma', 'asf'],
    mime: 'video/x-ms-asf',
    family: 'video',
  },
  {
    sig: '{\\rtf',
    name: 'Rich Text document',
    extensions: ['rtf'],
    mime: 'application/rtf',
    family: 'text',
  },
  {
    sig: '%!PS',
    name: 'PostScript',
    extensions: ['ps', 'eps'],
    mime: 'application/postscript',
    family: 'text',
  },
  {
    sig: [0x30, 0x82],
    name: 'DER-encoded ASN.1 (certificate, key or PKCS bundle)',
    extensions: ['der', 'cer', 'crt', 'p12', 'pfx', 'p7b', 'key'],
    mime: 'application/pkix-cert',
    family: 'data',
  },
];

/** Every extension that belongs to a binary kind — text claiming one is a lie. */
const BINARY_EXTENSIONS = new Set<string>();

/** `ftyp` brands. Anything else with a `ftyp` box is treated as MP4. */
const BRANDS: [RegExp, FileKind][] = [
  [
    /^(heic|heix|hevc|hevx|mif1|msf1)/,
    { name: 'HEIC image', extensions: ['heic', 'heif'], mime: 'image/heic', family: 'image' },
  ],
  [
    /^(avif|avis)/,
    { name: 'AVIF image', extensions: ['avif'], mime: 'image/avif', family: 'image' },
  ],
  [
    /^qt  /,
    {
      name: 'QuickTime video',
      extensions: ['mov', 'qt'],
      mime: 'video/quicktime',
      family: 'video',
    },
  ],
  [/^M4A /, { name: 'M4A audio', extensions: ['m4a'], mime: 'audio/mp4', family: 'audio' }],
  [/^3g/, { name: '3GP video', extensions: ['3gp', '3g2'], mime: 'video/3gpp', family: 'video' }],
];
const MP4: FileKind = {
  name: 'MP4 video',
  extensions: ['mp4', 'm4v'],
  mime: 'video/mp4',
  family: 'video',
};

/** Names that identify what a ZIP really is, searched in its local and central headers. */
const ZIP_MEMBERS: [string, FileKind][] = [
  [
    'word/',
    {
      name: 'Word document (.docx)',
      extensions: ['docx', 'docm', 'dotx', 'dotm'],
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      family: 'office',
    },
  ],
  [
    'xl/',
    {
      name: 'Excel workbook (.xlsx)',
      extensions: ['xlsx', 'xlsm', 'xltx', 'xltm'],
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      family: 'office',
    },
  ],
  [
    'ppt/',
    {
      name: 'PowerPoint presentation (.pptx)',
      extensions: ['pptx', 'pptm', 'potx', 'ppsx'],
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      family: 'office',
    },
  ],
  [
    'mimetypeapplication/epub+zip',
    { name: 'EPUB e-book', extensions: ['epub'], mime: 'application/epub+zip', family: 'archive' },
  ],
  [
    'mimetypeapplication/vnd.oasis.opendocument.text',
    {
      name: 'OpenDocument text',
      extensions: ['odt'],
      mime: 'application/vnd.oasis.opendocument.text',
      family: 'archive',
    },
  ],
  [
    'mimetypeapplication/vnd.oasis.opendocument.spreadsheet',
    {
      name: 'OpenDocument spreadsheet',
      extensions: ['ods'],
      mime: 'application/vnd.oasis.opendocument.spreadsheet',
      family: 'archive',
    },
  ],
  [
    'mimetypeapplication/vnd.oasis.opendocument.presentation',
    {
      name: 'OpenDocument presentation',
      extensions: ['odp'],
      mime: 'application/vnd.oasis.opendocument.presentation',
      family: 'archive',
    },
  ],
  [
    'AndroidManifest.xml',
    {
      name: 'Android app package',
      extensions: ['apk'],
      mime: 'application/vnd.android.package-archive',
      family: 'executable',
    },
  ],
  [
    'classes.dex',
    {
      name: 'Android app package',
      extensions: ['apk'],
      mime: 'application/vnd.android.package-archive',
      family: 'executable',
    },
  ],
  [
    'META-INF/MANIFEST.MF',
    {
      name: 'Java archive',
      extensions: ['jar', 'war', 'ear'],
      mime: 'application/java-archive',
      family: 'executable',
    },
  ],
];
const ZIP: FileKind = {
  name: 'ZIP archive',
  extensions: ['zip'],
  mime: 'application/zip',
  family: 'archive',
};

/** OLE compound files name their streams in UTF-16LE; these are the tell-tales. */
const OLE_STREAMS: [string, FileKind][] = [
  [
    'WordDocument',
    {
      name: 'Legacy Word document (.doc)',
      extensions: ['doc', 'dot'],
      mime: 'application/msword',
      family: 'data',
    },
  ],
  [
    'Workbook',
    {
      name: 'Legacy Excel workbook (.xls)',
      extensions: ['xls', 'xlt'],
      mime: 'application/vnd.ms-excel',
      family: 'data',
    },
  ],
  [
    'PowerPoint Document',
    {
      name: 'Legacy PowerPoint presentation (.ppt)',
      extensions: ['ppt', 'pps'],
      mime: 'application/vnd.ms-powerpoint',
      family: 'data',
    },
  ],
  [
    '__substg1.0_',
    {
      name: 'Outlook message',
      extensions: ['msg'],
      mime: 'application/vnd.ms-outlook',
      family: 'data',
    },
  ],
];
const OLE: FileKind = {
  name: 'OLE compound document',
  extensions: ['doc', 'xls', 'ppt', 'msg', 'msi'],
  mime: 'application/x-ole-storage',
  family: 'data',
};

/** Text-family extensions the sniffer cannot tell apart from bytes, and does not try to. */
const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'log',
  'json',
  'jsonl',
  'ndjson',
  'xml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'env',
  'html',
  'htm',
  'css',
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'jsx',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'php',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'bat',
  'cmd',
  'sql',
  'svg',
  'pem',
  'crt',
  'cer',
  'key',
  'csr',
  'pub',
  'srt',
  'vtt',
  'ics',
  'vcf',
  'rss',
  'atom',
  'xsd',
  'xsl',
  'xslt',
  'plist',
  'graphql',
  'gql',
  'proto',
  'tex',
  'bib',
  'rtf',
  'ps',
  'eps',
  'lock',
  'gitignore',
  'editorconfig',
  'dockerfile',
  'makefile',
]);

for (const entry of [
  ...SIGNATURES,
  ...BRANDS.map(([, kind]) => kind),
  MP4,
  ...ZIP_MEMBERS.map(([, kind]) => kind),
  ZIP,
  ...OLE_STREAMS.map(([, kind]) => kind),
  OLE,
]) {
  for (const extension of entry.extensions) {
    if (!TEXT_EXTENSIONS.has(extension)) {
      BINARY_EXTENSIONS.add(extension);
    }
  }
}

const latin1 = new TextDecoder('latin1');

export function sniff(bytes: Uint8Array, name: string): Sniffed {
  const extension = extensionOf(name);
  const header = Array.from(bytes.subarray(0, 16), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join(' ');
  const notes: string[] = [];

  if (bytes.length === 0) {
    return { kind: EMPTY, extension, mismatch: null, header, notes };
  }

  let kind = sniffBinary(bytes, notes);
  if (!kind) {
    kind = sniffText(bytes, notes);
  }

  return {
    kind: kind ?? UNKNOWN,
    extension,
    mismatch: mismatchFor(kind ?? UNKNOWN, extension),
    header,
    notes,
  };
}

export function extensionOf(name: string): string {
  const match = /\.([^./\\]+)$/.exec(name);
  return match ? match[1].toLowerCase() : '';
}

function sniffBinary(bytes: Uint8Array, notes: string[]): FileKind | null {
  if (starts(bytes, 'PK\x03\x04') || starts(bytes, 'PK\x05\x06') || starts(bytes, 'PK\x07\x08')) {
    return sniffZip(bytes, notes);
  }
  if (starts(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return sniffOle(bytes);
  }
  if (bytes.length >= 12 && matches(bytes, 4, 'ftyp')) {
    const brand = latin1.decode(bytes.subarray(8, 12));
    return BRANDS.find(([pattern]) => pattern.test(brand))?.[1] ?? MP4;
  }
  if (starts(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    const head = latin1.decode(bytes.subarray(0, 64));
    return head.includes('webm')
      ? { name: 'WebM video', extensions: ['webm'], mime: 'video/webm', family: 'video' }
      : {
          name: 'Matroska video',
          extensions: ['mkv', 'mka'],
          mime: 'video/x-matroska',
          family: 'video',
        };
  }
  if (starts(bytes, [0xca, 0xfe, 0xba, 0xbe])) {
    // Java class files and fat Mach-O binaries share a magic number. A class
    // file carries its major version (45 and up) here; a fat header carries a
    // count of architectures, which is never that large.
    const word = ((bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7]) >>> 0;
    return word >= 45
      ? {
          name: 'Java class file',
          extensions: ['class'],
          mime: 'application/java-vm',
          family: 'executable',
        }
      : {
          name: 'macOS universal executable',
          extensions: ['dylib'],
          mime: 'application/x-mach-binary',
          family: 'executable',
        };
  }
  // MP3 without an ID3 tag starts straight at a frame sync.
  if (
    bytes.length > 2 &&
    bytes[0] === 0xff &&
    (bytes[1] & 0xe6) === 0xe2 &&
    (bytes[1] & 0x18) !== 0x08
  ) {
    return { name: 'MP3 audio', extensions: ['mp3'], mime: 'audio/mpeg', family: 'audio' };
  }
  for (const entry of SIGNATURES) {
    if (matches(bytes, entry.at ?? 0, entry.sig)) {
      // RIFF/FORM containers are identified by the tag at offset 8, but only
      // when the outer tag is there too — "WAVE" at 8 in a random file is not a WAV.
      if (entry.at === 8 && !(starts(bytes, 'RIFF') || starts(bytes, 'FORM'))) {
        continue;
      }
      return entry;
    }
  }
  return null;
}

function sniffZip(bytes: Uint8Array, notes: string[]): FileKind {
  // Member names sit uncompressed in the local headers at the front and the
  // central directory at the back; 64 KB of each covers any real package.
  const window = 64 * 1024;
  const front = latin1.decode(bytes.subarray(0, window));
  const back = bytes.length > window ? latin1.decode(bytes.subarray(bytes.length - window)) : '';
  const names = front + back;

  const found = ZIP_MEMBERS.find(([member]) => names.includes(member))?.[1] ?? ZIP;
  if (found.family === 'office' && names.includes('vbaProject.bin')) {
    notes.push(
      'Contains macros (a vbaProject.bin part). If you did not expect a macro-enabled file, do not enable content.',
    );
  }
  return found;
}

function sniffOle(bytes: Uint8Array): FileKind {
  const window = latin1.decode(bytes.subarray(0, 64 * 1024));
  for (const [stream, kind] of OLE_STREAMS) {
    if (window.includes(stream.split('').join('\0'))) {
      return kind;
    }
  }
  return OLE;
}

function sniffText(bytes: Uint8Array, notes: string[]): FileKind | null {
  const sample = bytes.subarray(0, 8192);
  let encoding = 'UTF-8';
  let body: string;

  if (starts(bytes, [0xef, 0xbb, 0xbf])) {
    encoding = 'UTF-8 with BOM';
    body = new TextDecoder('utf-8').decode(sample);
  } else if (starts(bytes, [0xff, 0xfe])) {
    encoding = 'UTF-16 LE';
    body = new TextDecoder('utf-16le').decode(sample);
  } else if (starts(bytes, [0xfe, 0xff])) {
    encoding = 'UTF-16 BE';
    body = new TextDecoder('utf-16be').decode(sample);
  } else {
    if (sample.includes(0)) {
      return null;
    }
    body = new TextDecoder('utf-8').decode(sample);
    if (body.includes('�')) {
      // Not valid UTF-8, but no NULs either: almost always a legacy 8-bit file.
      encoding = 'Windows-1252 or Latin-1';
      body = latin1.decode(sample);
    }
  }

  let control = 0;
  for (const char of body) {
    const code = char.charCodeAt(0);
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f) {
      control++;
    }
  }
  if (control / Math.max(body.length, 1) > 0.02) {
    return null;
  }

  const crlf = (body.match(/\r\n/g) ?? []).length;
  const lf = (body.match(/(?<!\r)\n/g) ?? []).length;
  if (crlf && lf) {
    notes.push('Mixed line endings: some lines end in CRLF and some in LF.');
  } else if (crlf) {
    notes.push('Windows line endings (CRLF).');
  } else if (lf) {
    notes.push('Unix line endings (LF).');
  }

  const kind = classifyText(body.replace(/^﻿/, ''), bytes);
  return { ...kind, name: `${kind.name} (${encoding})` };
}

function classifyText(body: string, bytes: Uint8Array): FileKind {
  const head = body.slice(0, 1024);
  const trimmed = head.trimStart();

  if (/^-----BEGIN [A-Z ]+-----/.test(trimmed)) {
    return text(
      'PEM-encoded certificate or key',
      ['pem', 'crt', 'cer', 'key', 'csr', 'pub'],
      'application/x-pem-file',
    );
  }
  if (trimmed.startsWith('#!')) {
    return text('Script', ['sh', 'bash', 'py', 'rb', 'pl'], 'text/x-script');
  }
  if (/^<\?xml/i.test(trimmed) || /^<svg[\s>]/i.test(trimmed)) {
    if (/<svg[\s>]/i.test(head)) {
      return text('SVG image', ['svg'], 'image/svg+xml');
    }
    if (/<(rss|feed)[\s>]/i.test(head)) {
      return text('RSS or Atom feed', ['rss', 'atom', 'xml'], 'application/rss+xml');
    }
    return text('XML document', ['xml', 'xsd', 'xsl', 'xslt', 'plist'], 'application/xml');
  }
  if (/^<!doctype html|^<html[\s>]/i.test(trimmed)) {
    return text('HTML document', ['html', 'htm'], 'text/html');
  }
  if (/^[[{]/.test(trimmed) && bytes.length <= 4 * 1024 * 1024) {
    try {
      JSON.parse(new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, ''));
      return text('JSON', ['json'], 'application/json');
    } catch {
      // Falls through: a brace-led file that is not JSON is still text.
    }
  }
  return text('Plain text', [], 'text/plain');
}

function mismatchFor(kind: FileKind, extension: string): string | null {
  if (!extension) {
    return null;
  }
  if (kind.family === 'text' || kind.family === 'unknown') {
    return BINARY_EXTENSIONS.has(extension)
      ? `The name says .${extension}, but the contents are ${article(kind.name)}, not a ${extension.toUpperCase()} file.`
      : null;
  }
  if (kind.extensions.length === 0 || kind.extensions.includes(extension)) {
    return null;
  }
  return `The name says .${extension}, but the contents are ${article(kind.name)}. Renaming it to .${kind.extensions[0]} will let the right program open it.`;
}

function article(noun: string): string {
  if (/^(Plain text|JSON)/.test(noun)) {
    return noun.replace(/^Plain text/, 'plain text');
  }
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
}

function starts(bytes: Uint8Array, sig: string | number[]): boolean {
  return matches(bytes, 0, sig);
}

function matches(bytes: Uint8Array, at: number, sig: string | number[]): boolean {
  const expected = typeof sig === 'string' ? Array.from(sig, (char) => char.charCodeAt(0)) : sig;
  if (bytes.length < at + expected.length) {
    return false;
  }
  for (let i = 0; i < expected.length; i++) {
    if (bytes[at + i] !== expected[i]) {
      return false;
    }
  }
  return true;
}
