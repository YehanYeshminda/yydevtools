import { Tool, ToolCategory } from './tool.model';

export const TOOL_CATEGORIES: ToolCategory[] = ['Developer', 'Converter', 'Document'];

/**
 * The catalog of free utilities. Keep this list as the single source of truth —
 * the homepage grid, search, the command palette and the category filter are
 * all derived from it, and the README's tool table is written from it too.
 */
export const TOOLS: Tool[] = [
  {
    slug: 'json-formatter',
    name: 'JSON Formatter',
    description: 'Format, validate and minify JSON, convert to/from YAML and query with JSONPath.',
    icon: 'matDataObjectOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'json-to-types',
    name: 'JSON to Types',
    description: 'Turn JSON into TypeScript, Python, Rust, Kotlin, Java, JSON Schema and more.',
    icon: 'matCodeOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'jwt-decoder',
    name: 'JWT Decoder',
    description: 'Decode JWT headers and claims, and verify the signature.',
    icon: 'matKeyOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'jwt-editor',
    name: 'JWT Editor',
    description: 'Edit a JWT’s claims and re-sign it into a new, valid token (HS/RS/PS/ES).',
    icon: 'matTokenOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'hash-generator',
    name: 'Hash Generator',
    description:
      'Compute MD5, CRC32, SHA and keyed HMAC digests of text or many files, and verify a checksum.',
    icon: 'matTagOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'text-diff',
    name: 'Text Diff',
    description: 'Compare two blocks of text line by line, in a split or unified view.',
    icon: 'matDifferenceOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'regex-tester',
    name: 'Regex Tester',
    description: 'Test a regular expression live, with match highlighting and capture groups.',
    icon: 'matFindReplaceOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'cron-explainer',
    name: 'Cron Explainer',
    description: 'Read a cron expression in plain English and preview its next run times.',
    icon: 'matAlarmOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'qr-generator',
    name: 'QR Code Generator',
    description:
      'Make a QR code for a link, Wi-Fi network, contact card, event or location — as PNG or SVG.',
    icon: 'matQrCode2Outline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'case-converter',
    name: 'Case Converter',
    description: 'Convert text between camelCase, snake_case, kebab-case, PascalCase and a slug.',
    icon: 'matTextFieldsOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'sql-formatter',
    name: 'SQL Formatter',
    description: 'Format and beautify SQL for a dozen dialects, right in your browser.',
    icon: 'matStorageOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'code-formatter',
    name: 'Code Formatter',
    description: 'Beautify HTML, CSS, JS, TypeScript, JSON, Markdown, YAML, GraphQL and XML.',
    icon: 'matIntegrationInstructionsOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'html-preview',
    name: 'HTML Preview',
    description: 'Write or paste HTML and see it rendered live in a sandboxed preview.',
    icon: 'matVisibilityOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'uuid-generator',
    name: 'UUID Generator',
    description: 'Generate random v4 or time-ordered v7 UUIDs in bulk.',
    icon: 'matFingerprintOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'key-generator',
    name: 'Key Generator',
    description:
      'Generate an RSA or EC key pair in your browser — the private key never leaves your device.',
    icon: 'matVpnKeyOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'password-generator',
    name: 'Password Generator',
    description:
      'Create strong random passwords or memorable passphrases, with a strength and crack-time check.',
    icon: 'matPasswordOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'color-converter',
    name: 'Color Converter',
    description: 'Convert HEX, RGB, HSL, OKLCH and LAB, generate palettes and check WCAG contrast.',
    icon: 'matPaletteOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'base64-converter',
    name: 'Base64 Converter',
    description: 'Encode and decode text or files to and from Base64.',
    icon: 'matSwapHorizOutline',
    category: 'Converter',
    ready: true,
  },
  {
    slug: 'xml-viewer',
    name: 'XML Viewer',
    description: 'Format, validate and explore XML as a tree, and query it with XPath.',
    icon: 'matCodeOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'url-encoder',
    name: 'URL Encoder / Decoder',
    description: 'Percent-encode or decode URLs and query values, and break a URL into its parts.',
    icon: 'matLinkOutline',
    category: 'Converter',
    ready: true,
  },
  {
    slug: 'image-compressor',
    name: 'Image Compressor',
    description:
      'Shrink JPEG, PNG and HEIC images in bulk — by quality or to a target size, with Exif control.',
    icon: 'matCompressOutline',
    category: 'Converter',
    ready: true,
  },
  {
    slug: 'image-converter',
    name: 'Image Converter',
    description:
      'Convert images between HEIC, JPEG, PNG, WebP and AVIF in bulk, without uploading them.',
    icon: 'matSyncAltOutline',
    category: 'Converter',
    ready: true,
  },
  {
    slug: 'exif-viewer',
    name: 'EXIF Viewer',
    description:
      'See the camera, timestamp and GPS location hidden in a photo, then strip it out losslessly.',
    icon: 'matLocationOnOutline',
    category: 'Converter',
    ready: true,
  },
  {
    slug: 'timestamp-converter',
    name: 'Timestamp Converter',
    description: 'Convert between Unix timestamps and human-readable dates.',
    icon: 'matScheduleOutline',
    category: 'Converter',
    ready: true,
  },
  {
    slug: 'word-counter',
    name: 'Word & Character Counter',
    description:
      'Count words, characters, sentences and paragraphs live, with reading time and keyword density.',
    icon: 'matSubjectOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'markdown-editor',
    name: 'Markdown Editor',
    description: 'Write Markdown with a live, side-by-side preview.',
    icon: 'matEditNoteOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'image-pdf',
    name: 'Image ↔ PDF',
    description:
      'Combine JPG, PNG and WebP images into one PDF, or turn every PDF page back into an image.',
    icon: 'matPhotoLibraryOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'office-to-pdf',
    name: 'Office to PDF',
    description: 'Convert a Word, Excel or PowerPoint file to PDF, laid out as Office would.',
    icon: 'matPictureAsPdfOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-protect',
    name: 'Protect PDF',
    description: 'Lock a PDF with a password — AES-256, the strongest the format allows.',
    icon: 'matLockOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-unlock',
    name: 'Unlock PDF',
    description: 'Remove the password and restrictions from a PDF you know the password for.',
    icon: 'matLockOpenOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-convert',
    name: 'PDF Convert',
    description: 'Turn a PDF into an editable Word or rich-text file.',
    icon: 'matSyncAltOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-ocr',
    name: 'PDF OCR',
    description:
      'Make a scanned PDF searchable — short English files without uploading them at all.',
    icon: 'matDocumentScannerOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-compress',
    name: 'PDF Compress',
    description: 'Shrink a PDF by downsampling the images inside it, with real size savings.',
    icon: 'matCompressOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'csv-viewer',
    name: 'CSV Viewer',
    description:
      'Open a CSV as a searchable table, see what each column holds, and export it as JSON.',
    icon: 'matStorageOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'word-viewer',
    name: 'Word Viewer',
    description: 'Open and read a .docx document with its layout intact, and copy the text out.',
    icon: 'matDescriptionOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'powerpoint-viewer',
    name: 'PowerPoint Viewer',
    description: 'Open a .pptx deck and read it slide by slide, with thumbnails to jump around.',
    icon: 'matSlideshowOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'excel-viewer',
    name: 'Excel Viewer',
    description:
      'Open an .xlsx workbook and read its sheets, with formatting intact and columns widened to fit.',
    icon: 'matTableChartOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-viewer',
    name: 'PDF Viewer',
    description: 'Open and read a PDF with thumbnails, search and zoom — no upload.',
    icon: 'matPictureAsPdfOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-organizer',
    name: 'PDF Organizer',
    description:
      'Reorder, rotate and delete PDF pages visually, and combine files — all in one place.',
    icon: 'matDashboardCustomizeOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-merge',
    name: 'PDF Merge',
    description: 'Combine several PDF files into a single document.',
    icon: 'matPictureAsPdfOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-split',
    name: 'PDF Split',
    description: 'Extract selected pages from a PDF, or split it into one file per page.',
    icon: 'matContentCutOutline',
    category: 'Document',
    ready: true,
  },
];

/**
 * The tools that send a file to a service instead of doing the work in the tab.
 *
 * Three PDF operations genuinely cannot run client-side, and the two Office
 * viewers convert through `office-convert`. Every other tool is local.
 *
 * This exists so the "N of M tools run entirely in this tab" claim on the home
 * rail is derived rather than typed. It was typed, and it went stale: the page
 * still said "31 of 36" after the catalog reached 37.
 */
export const HOSTED_SLUGS: readonly string[] = [
  'pdf-convert',
  'pdf-ocr',
  'pdf-compress',
  'word-viewer',
  'excel-viewer',
];

/** How many tools never upload anything — the number the home rail quotes. */
export const LOCAL_TOOL_COUNT = TOOLS.filter(
  (tool) => !HOSTED_SLUGS.includes(tool.slug),
).length;
