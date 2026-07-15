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
    slug: 'markdown-editor',
    name: 'Markdown Editor',
    description: 'Write Markdown with a live, side-by-side preview.',
    icon: 'edit_note',
    category: 'Document',
    ready: true,
  },
  {
    slug: 'pdf-merge',
    name: 'PDF Merge',
    description: 'Combine several PDF files into a single document.',
    icon: 'picture_as_pdf',
    category: 'Document',
    ready: false,
  },
];
