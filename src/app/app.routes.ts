import { Routes } from '@angular/router';

/**
 * Every route carries a `description` in its data bag; SeoService writes it into
 * the meta description, canonical and social tags during the prerender pass.
 * Keep each one unique and under ~160 characters — duplicates are the single
 * most common reason Search Console reports pages as low quality.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home').then((m) => m.Home),
    title: 'yydevtools — Free developer utilities',
    data: {
      description:
        'A free collection of fast developer and PDF tools that run in your browser. ' +
        'No account, nothing to install, and most tools never upload your files.',
    },
  },
  {
    path: 'about',
    loadComponent: () => import('./about/about').then((m) => m.About),
    title: 'About — yydevtools',
    data: {
      description:
        'What yydevtools is, what it stands for, and what is inside: free, fast, ' +
        'sign-up-free utilities that do their work in your browser.',
    },
  },
  {
    path: 'privacy',
    loadComponent: () => import('./privacy/privacy').then((m) => m.Privacy),
    title: 'Privacy Policy — yydevtools',
    data: {
      description:
        'How yydevtools handles your data: what stays in your browser, what the ' +
        'hosted PDF tools send onward, and how advertising cookies are used.',
    },
  },
  {
    path: 'tools/base64-converter',
    loadComponent: () => import('./tools/base64/base64').then((m) => m.Base64Tool),
    title: 'Base64 Converter — yydevtools',
    data: {
      description:
        'Encode and decode Base64 online, for text or files. Runs entirely in your ' +
        'browser — nothing is uploaded. Free, with no sign-up.',
    },
  },
  {
    path: 'tools/json-formatter',
    loadComponent: () =>
      import('./tools/json-formatter/json-formatter').then((m) => m.JsonFormatterTool),
    title: 'JSON Formatter — yydevtools',
    data: {
      description:
        'Format, validate and minify JSON online with clear error messages. Runs in ' +
        'your browser, so your data never leaves your machine. Free, no sign-up.',
    },
  },
  {
    path: 'tools/json-to-types',
    loadComponent: () =>
      import('./tools/json-to-types/json-to-types').then((m) => m.JsonToTypesTool),
    title: 'JSON to TypeScript & C# — yydevtools',
    data: {
      description:
        'Paste JSON and generate TypeScript interfaces or C# classes, with nested types, ' +
        'optional properties and nullables inferred. Free, runs in your browser.',
    },
  },
  {
    path: 'tools/markdown-editor',
    loadComponent: () =>
      import('./tools/markdown-editor/markdown-editor').then((m) => m.MarkdownEditorTool),
    title: 'Markdown Editor — yydevtools',
    data: {
      description:
        'Write Markdown with a live side-by-side preview and export the result. ' +
        'Free, runs in your browser, no account needed.',
    },
  },
  {
    path: 'tools/jwt-decoder',
    loadComponent: () => import('./tools/jwt-decoder/jwt-decoder').then((m) => m.JwtDecoderTool),
    title: 'JWT Decoder — yydevtools',
    data: {
      description:
        'Decode a JSON Web Token and inspect its header, payload and claims. Tokens ' +
        'are decoded in your browser and never sent anywhere. Free, no sign-up.',
    },
  },
  {
    path: 'tools/image-compressor',
    loadComponent: () =>
      import('./tools/image-compressor/image-compressor').then((m) => m.ImageCompressorTool),
    title: 'Image Compressor — yydevtools',
    data: {
      description:
        'Compress PNG and JPEG images to JPEG or WebP and see the size saved. Runs ' +
        'in your browser — your images are never uploaded. Free, no sign-up.',
    },
  },
  {
    path: 'tools/pdf-merge',
    loadComponent: () => import('./tools/pdf-merge/pdf-merge').then((m) => m.PdfMergeTool),
    title: 'PDF Merge — yydevtools',
    data: {
      description:
        'Combine several PDF files into one document, in the order you choose. Merging ' +
        'happens in your browser, so your files stay on your device. Free.',
    },
  },
  {
    path: 'tools/pdf-convert',
    loadComponent: () => import('./tools/pdf-convert/pdf-convert').then((m) => m.PdfConvertTool),
    title: 'PDF Convert — yydevtools',
    data: {
      description:
        'Convert a PDF into an editable Word, Excel, PowerPoint or rich-text file. ' +
        'Free, with a monthly allowance and no account required.',
    },
  },
  {
    path: 'tools/pdf-ocr',
    loadComponent: () => import('./tools/pdf-ocr/pdf-ocr').then((m) => m.PdfOcrTool),
    title: 'PDF OCR — yydevtools',
    data: {
      description:
        'Run text recognition on a scanned PDF to make it searchable and selectable. ' +
        'Free, with a monthly allowance and no account required.',
    },
  },
  {
    path: 'tools/pdf-compress',
    loadComponent: () =>
      import('./tools/pdf-compress/pdf-compress').then((m) => m.PdfCompressTool),
    title: 'PDF Compress — yydevtools',
    data: {
      description:
        'Shrink a PDF by downsampling the images inside it, with real, measured size ' +
        'savings. Free, with a monthly allowance and no account required.',
    },
  },
  {
    path: 'tools/pdf-viewer',
    loadComponent: () => import('./tools/pdf-viewer/pdf-viewer').then((m) => m.PdfViewerTool),
    title: 'PDF Viewer — yydevtools',
    data: {
      description:
        'Open and read a PDF with thumbnails, search and zoom. The file is rendered ' +
        'locally and never uploaded. Free, with no sign-up.',
    },
  },
  {
    path: 'tools/pdf-split',
    loadComponent: () => import('./tools/pdf-split/pdf-split').then((m) => m.PdfSplitTool),
    title: 'PDF Split — yydevtools',
    data: {
      description:
        'Extract selected pages from a PDF or split it into one file per page. Runs ' +
        'in your browser, so your document stays on your device. Free.',
    },
  },
  {
    path: 'tools/hash-generator',
    loadComponent: () =>
      import('./tools/hash-generator/hash-generator').then((m) => m.HashGeneratorTool),
    title: 'Hash Generator — yydevtools',
    data: {
      description:
        'Compute SHA-1, SHA-256, SHA-384 and SHA-512 checksums of text or a file. ' +
        'Hashing happens in your browser. Free, with no sign-up.',
    },
  },
  {
    path: 'tools/uuid-generator',
    loadComponent: () =>
      import('./tools/uuid-generator/uuid-generator').then((m) => m.UuidGeneratorTool),
    title: 'UUID Generator — yydevtools',
    data: {
      description:
        'Generate random v4 or time-ordered v7 UUIDs, one at a time or in bulk, using ' +
        'your browser’s cryptographic randomness. Free, no sign-up.',
    },
  },
  {
    path: 'tools/timestamp-converter',
    loadComponent: () =>
      import('./tools/timestamp-converter/timestamp-converter').then(
        (m) => m.TimestampConverterTool,
      ),
    title: 'Timestamp Converter — yydevtools',
    data: {
      description:
        'Convert between Unix timestamps and human-readable dates in local time or ' +
        'UTC, in both directions. Free, runs in your browser.',
    },
  },
  {
    path: 'tools/color-converter',
    loadComponent: () =>
      import('./tools/color-converter/color-converter').then((m) => m.ColorConverterTool),
    title: 'Color Converter — yydevtools',
    data: {
      description:
        'Convert colours between HEX, RGB and HSL and check WCAG contrast ratios for ' +
        'accessible text. Free, runs in your browser.',
    },
  },
  {
    // A real page rather than a redirect to "/": redirecting made every unknown
    // URL answer 200 with the homepage, which Search Console reports as a soft
    // 404. The Worker serves this one with a genuine 404 status.
    path: '404',
    loadComponent: () => import('./not-found/not-found').then((m) => m.NotFound),
    title: 'Page not found — yydevtools',
    data: { description: 'That page does not exist.', noindex: true },
  },
  { path: '**', redirectTo: '404' },
];
