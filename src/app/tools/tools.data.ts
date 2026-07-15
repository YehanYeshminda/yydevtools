import { Tool, ToolCategory } from './tool.model';

export const TOOL_CATEGORIES: ToolCategory[] = ['AI', 'Developer', 'Converter', 'Document'];

/**
 * The catalog of free utilities. Keep this list as the single source of truth —
 * the homepage grid, search and category filter are all derived from it, and the
 * shared backend exposes the same catalog at GET /api/tools.
 */
export const TOOLS: Tool[] = [
  {
    slug: 'ai-prompt-generator',
    name: 'AI Prompt Generator',
    description: 'Turn a rough idea into a structured, high-quality prompt.',
    icon: 'auto_awesome',
    category: 'AI',
    ready: false,
  },
  {
    slug: 'prompt-improver',
    name: 'Prompt Improver',
    description: 'Rewrite and sharpen an existing prompt for better results.',
    icon: 'auto_fix_high',
    category: 'AI',
    ready: false,
  },
  {
    slug: 'resume-prompt-generator',
    name: 'Resume Prompt Generator',
    description: 'Generate tailored prompts to build and refine your resume.',
    icon: 'contact_page',
    category: 'AI',
    ready: false,
  },
  {
    slug: 'email-generator',
    name: 'Email Generator',
    description: 'Draft clear, on-tone emails from a short brief.',
    icon: 'mail',
    category: 'AI',
    ready: false,
  },
  {
    slug: 'regex-generator',
    name: 'Regex Generator',
    description: 'Describe a pattern in plain English and get the regex.',
    icon: 'pattern',
    category: 'Developer',
    ready: false,
  },
  {
    slug: 'sql-generator',
    name: 'SQL Generator',
    description: 'Turn plain-language questions into ready-to-run SQL.',
    icon: 'storage',
    category: 'Developer',
    ready: false,
  },
  {
    slug: 'json-formatter',
    name: 'JSON Formatter',
    description: 'Format, validate and minify JSON in your browser.',
    icon: 'data_object',
    category: 'Developer',
    ready: false,
  },
  {
    slug: 'jwt-decoder',
    name: 'JWT Decoder',
    description: 'Decode and inspect JWT headers, payloads and claims.',
    icon: 'key',
    category: 'Developer',
    ready: false,
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
    description: 'Shrink PNG and JPEG images without a visible quality loss.',
    icon: 'compress',
    category: 'Converter',
    ready: false,
  },
  {
    slug: 'markdown-editor',
    name: 'Markdown Editor',
    description: 'Write Markdown with a live, side-by-side preview.',
    icon: 'edit_note',
    category: 'Document',
    ready: false,
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
