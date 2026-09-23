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
    slug: 'json-diff',
    name: 'JSON Diff',
    description:
      'Compare two JSON payloads by structure: reordered keys are not changes, type changes are, and every difference comes with its path.',
    icon: 'matCompareArrowsOutline',
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
    slug: 'barcode-generator',
    name: 'Barcode Generator',
    description:
      'Make a Code 128, EAN-13, EAN-8, UPC-A, Code 39 or ITF-14 barcode, with the check digit worked out.',
    icon: 'matBarcodeOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'slug-generator',
    name: 'Slug Generator',
    description:
      'Turn a list of titles into URL slugs — accents folded, length capped, collisions numbered.',
    icon: 'matFormatListBulletedOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'email-template',
    name: 'Email Template Generator',
    description:
      'Turn a plain-text draft into an email that holds up in Outlook, or into a Word document.',
    icon: 'matMailOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'invoice-generator',
    name: 'Invoice & Receipt Generator',
    description:
      'Fill in an invoice or a receipt, watch it build live, add your logo and download the PDF.',
    icon: 'matReceiptLongOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-diff',
    name: 'PDF Visual Diff',
    description:
      'Compare two PDFs page by page and see exactly which pixels moved — without uploading either.',
    icon: 'matCompareOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'text-cleaner',
    name: 'Text Cleaner',
    description:
      'Strip invisible characters, straighten curly quotes, trim, sort and de-duplicate lines.',
    icon: 'matCleaningServicesOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'lorem-ipsum',
    name: 'Lorem Ipsum Generator',
    description:
      'Generate placeholder text by paragraph, sentence, word or list item, as text, HTML or Markdown.',
    icon: 'matNotesOutline',
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
    slug: 'certificate-decoder',
    name: 'Certificate Decoder',
    description:
      'Decode an X.509 certificate or chain — subject, issuer, expiry, key, SANs, fingerprints, extensions.',
    icon: 'matVerifiedUserOutline',
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
    slug: 'secret-link',
    name: 'One-Time Secret',
    description:
      'Send a password or key as a link that opens once. Encrypted in your browser; the key never reaches the server.',
    icon: 'matLockClockOutline',
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
    slug: 'favicon-generator',
    name: 'Favicon Generator',
    description:
      'One logo in, every icon out: favicon.ico, the PNG sizes for tabs, iOS and Android, a maskable icon, the manifest and the head tags.',
    icon: 'matAppsOutline',
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
    slug: 'palette-extractor',
    name: 'Colour Palette Extractor',
    description:
      'Pull the dominant colours out of a photo or a logo, with the share each one takes up.',
    icon: 'matColorizeOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'base-converter',
    name: 'Number Base Converter',
    description:
      'Convert between binary, octal, decimal, hexadecimal and any base up to 36, with a clickable bit view.',
    icon: 'matSyncAltOutline',
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
    slug: 'json-csv',
    name: 'JSON ↔ CSV Converter',
    description:
      'Turn a JSON array into a spreadsheet-ready CSV or a CSV into JSON objects, nested fields included.',
    icon: 'matTableChartOutline',
    category: 'Converter',
    ready: true,
  },
  {
    slug: 'background-remover',
    name: 'Background Remover',
    description:
      'Cut the background out of a photo and save a transparent PNG, or put the subject on a colour. The model runs in your browser.',
    icon: 'matAutoFixHighOutline',
    category: 'Converter',
    ready: true,
  },
  {
    slug: 'passport-photo',
    name: 'Passport Photo Maker',
    description:
      'Crop a photo to an official passport or ID size with head-position guides, then print one or a sheet.',
    icon: 'matBadgeOutline',
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
    slug: 'video-trimmer',
    name: 'Video Trimmer & GIF Maker',
    description:
      'Cut a clip, drop the sound, pull out the audio as an MP3, or turn it into a GIF. ffmpeg runs in your browser.',
    icon: 'matMovieOutline',
    category: 'Converter',
    ready: true,
  },
  {
    slug: 'image-resize',
    name: 'Image Resizer & Cropper',
    description:
      'Crop with a draggable box, resize to exact pixels or a file size, and save as JPEG, PNG or WebP.',
    icon: 'matCropOutline',
    category: 'Converter',
    ready: true,
  },
  {
    slug: 'image-viewer',
    name: 'Image Viewer',
    description:
      'Open an image from a file or pasted Base64 — fit, zoom and check its transparency.',
    icon: 'matImageOutline',
    category: 'Converter',
    ready: true,
  },
  {
    slug: 'image-ocr',
    name: 'Image OCR',
    description:
      'Copy the text out of a screenshot or photo — English, Sinhala or Tamil, without uploading it.',
    icon: 'matTextSnippetOutline',
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
    slug: 'pomodoro',
    name: 'Pomodoro Timer & Stopwatch',
    description:
      'Focus sessions with breaks that arrive on their own, or a plain stopwatch with laps.',
    icon: 'matTimerOutline',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'unit-converter',
    name: 'Unit Converter',
    description:
      'Convert length, weight, temperature, volume, speed, area, data and time, with every unit shown at once.',
    icon: 'matStraightenOutline',
    category: 'Converter',
    ready: true,
  },
  {
    slug: 'age-calculator',
    name: 'Age & Date Difference Calculator',
    description:
      'Work out an age, or the span between two dates, in years, months and days and in total days, weeks and hours.',
    icon: 'matEventOutline',
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
    slug: 'document-scanner',
    name: 'Document Scanner',
    description:
      'Turn photos of pages into a straight, clean PDF — drag the corners, pick a look, download.',
    icon: 'matDocumentScannerOutline',
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
    slug: 'pdf-watermark',
    name: 'PDF Watermark & Page Numbers',
    description:
      'Stamp text across every page and add page numbers, with a live preview — no upload.',
    icon: 'matBrandingWatermarkOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-form-fill',
    name: 'PDF Form Fill & Flatten',
    description:
      'Fill in a PDF form’s fields with a live preview, then download it editable or flattened.',
    icon: 'matFactCheckOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-sign',
    name: 'Sign PDF',
    description: 'Draw, type or upload a signature and place it on a PDF — nothing is uploaded.',
    icon: 'matHistoryEduOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-edit',
    name: 'PDF Editor',
    description:
      'Change the text already in a PDF — click a line, type over it, and keep the fonts.',
    icon: 'matEditNoteOutline',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-redact',
    name: 'Redact PDF',
    description:
      'Black out a phrase everywhere or draw boxes, and get a PDF with the content truly removed.',
    icon: 'matVisibilityOffOutline',
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
    slug: 'file-inspector',
    name: 'File Inspector',
    description:
      'What is this file? Its real type from the bytes, its checksums, and the author, company and history a PDF or Office file carries — with a button to strip them.',
    icon: 'matFingerprintOutline',
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
 * Three PDF operations genuinely cannot run client-side; the Office viewers,
 * Office to PDF, PDF password handling and certificate parsing go through
 * `office-convert`. Every other tool is local.
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
  'powerpoint-viewer',
  'office-to-pdf',
  'pdf-protect',
  'pdf-unlock',
  'certificate-decoder',
];

/** How many tools never upload anything — the number the home rail quotes. */
export const LOCAL_TOOL_COUNT = TOOLS.filter((tool) => !HOSTED_SLUGS.includes(tool.slug)).length;
