import { Tool, ToolCategory } from './tool.model';

export const TOOL_CATEGORIES: ToolCategory[] = ['Developer', 'Converter', 'Document'];

/**
 * The catalog of free utilities. Keep this list as the single source of truth —
 * the homepage grid, search and category filter are all derived from it, and the
 * shared backend exposes the same catalog at GET /api/tools.
 */
export const TOOLS: Tool[] = [
  {
    slug: 'json-formatter',
    name: 'JSON Formatter',
    description: 'Format, validate and minify JSON in your browser.',
    icon: 'data_object',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'jwt-decoder',
    name: 'JWT Decoder',
    description: 'Decode and inspect JWT headers, payloads and claims.',
    icon: 'key',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'hash-generator',
    name: 'Hash Generator',
    description: 'Compute SHA-1, SHA-256, SHA-384 and SHA-512 digests of text or a file.',
    icon: 'tag',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'uuid-generator',
    name: 'UUID Generator',
    description: 'Generate random v4 or time-ordered v7 UUIDs in bulk.',
    icon: 'fingerprint',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'color-converter',
    name: 'Color Converter',
    description: 'Convert HEX, RGB and HSL, and check WCAG contrast ratios.',
    icon: 'palette',
    category: 'Developer',
    ready: true,
  },
  {
    slug: 'base64-converter',
    name: 'Base64 Converter',
    description: 'Encode and decode text or files to and from Base64.',
    icon: 'swap_horiz',
    category: 'Converter',
    ready: true,
  },
  {
    slug: 'image-compressor',
    name: 'Image Compressor',
    description: 'Shrink PNG and JPEG images to JPEG or WebP, right in your browser.',
    icon: 'compress',
    category: 'Converter',
    ready: true,
  },
  {
    slug: 'timestamp-converter',
    name: 'Timestamp Converter',
    description: 'Convert between Unix timestamps and human-readable dates.',
    icon: 'schedule',
    category: 'Converter',
    ready: true,
  },
  {
    slug: 'markdown-editor',
    name: 'Markdown Editor',
    description: 'Write Markdown with a live, side-by-side preview.',
    icon: 'edit_note',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-convert',
    name: 'PDF Convert',
    description: 'Turn a PDF into an editable Word, Excel, PowerPoint or rich-text file.',
    icon: 'sync_alt',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-ocr',
    name: 'PDF OCR',
    description: 'Make a scanned PDF searchable and selectable with text recognition.',
    icon: 'document_scanner',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-compress',
    name: 'PDF Compress',
    description: 'Shrink a PDF by downsampling the images inside it, with real size savings.',
    icon: 'compress',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-viewer',
    name: 'PDF Viewer',
    description: 'Open and read a PDF with thumbnails, search and zoom — no upload.',
    icon: 'picture_as_pdf',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-merge',
    name: 'PDF Merge',
    description: 'Combine several PDF files into a single document.',
    icon: 'picture_as_pdf',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-split',
    name: 'PDF Split',
    description: 'Extract selected pages from a PDF, or split it into one file per page.',
    icon: 'content_cut',
    category: 'Document',
    ready: true,
  },
];
