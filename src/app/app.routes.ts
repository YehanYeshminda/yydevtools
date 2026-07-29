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
    title: 'YYDevTools — Free developer utilities',
    data: {
      description:
        'A free collection of fast developer and PDF tools that run in your browser. ' +
        'No account, nothing to install, and most tools never upload your files.',
    },
  },
  {
    path: 'about',
    loadComponent: () => import('./about/about').then((m) => m.About),
    title: 'About — YYDevTools',
    data: {
      description:
        'What YYDevTools is, what it stands for, and what is inside: free, fast, ' +
        'sign-up-free utilities that do their work in your browser.',
    },
  },
  {
    path: 'privacy',
    loadComponent: () => import('./privacy/privacy').then((m) => m.Privacy),
    title: 'Privacy Policy — YYDevTools',
    data: {
      description:
        'How YYDevTools handles your data: what stays in your browser, what the ' +
        'hosted PDF tools send onward, and how advertising cookies are used.',
    },
  },
  {
    path: 'contact',
    loadComponent: () => import('./contact/contact').then((m) => m.Contact),
    title: 'Contact — YYDevTools',
    data: {
      description:
        'Get in touch with YYDevTools: email for questions and privacy requests, or open a ' +
        'GitHub issue to report a bug or suggest a new tool.',
    },
  },
  {
    path: 'tools/base64-converter',
    loadComponent: () => import('./tools/base64/base64').then((m) => m.Base64Tool),
    title: 'Base64 Converter — YYDevTools',
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
    title: 'JSON Formatter, YAML Converter & JSONPath — YYDevTools',
    data: {
      description:
        'Format, validate and minify JSON, convert between JSON and YAML, and query with JSONPath — ' +
        'with clear error messages. Runs in your browser, so your data never leaves your machine. ' +
        'Free, no sign-up.',
    },
  },
  {
    path: 'tools/json-to-types',
    loadComponent: () =>
      import('./tools/json-to-types/json-to-types').then((m) => m.JsonToTypesTool),
    title: 'JSON to TypeScript, Python, Rust, Kotlin, Java & more — YYDevTools',
    data: {
      description:
        'Paste JSON and generate TypeScript, C#, Python dataclasses, Go, Zod, Rust serde structs, ' +
        'Kotlin data classes, Java records, JSON Schema or Pydantic v2 models — nested types, ' +
        'optional properties and nullables inferred. Free, runs in your browser.',
    },
  },
  {
    path: 'tools/markdown-editor',
    loadComponent: () =>
      import('./tools/markdown-editor/markdown-editor').then((m) => m.MarkdownEditorTool),
    title: 'Markdown Editor — YYDevTools',
    data: {
      description:
        'Write Markdown with a live side-by-side preview and export the result. ' +
        'Free, runs in your browser, no account needed.',
    },
  },
  {
    path: 'tools/jwt-decoder',
    loadComponent: () => import('./tools/jwt-decoder/jwt-decoder').then((m) => m.JwtDecoderTool),
    title: 'JWT Decoder & Signature Verifier — YYDevTools',
    data: {
      description:
        'Decode a JSON Web Token and inspect its header, payload and claims, then verify the ' +
        'signature with an HMAC secret or a public key (HS/RS/PS/ES). Everything runs in your ' +
        'browser and is never sent anywhere. Free, no sign-up.',
    },
  },
  {
    path: 'tools/image-compressor',
    loadComponent: () =>
      import('./tools/image-compressor/image-compressor').then((m) => m.ImageCompressorTool),
    title: 'Image Compressor — YYDevTools',
    data: {
      description:
        'Compress PNG and JPEG images to JPEG or WebP and see the size saved. Runs ' +
        'in your browser — your images are never uploaded. Free, no sign-up.',
    },
  },
  {
    path: 'tools/pdf-merge',
    loadComponent: () => import('./tools/pdf-merge/pdf-merge').then((m) => m.PdfMergeTool),
    title: 'PDF Merge — YYDevTools',
    data: {
      description:
        'Combine several PDF files into one document, in the order you choose. Merging ' +
        'happens in your browser, so your files stay on your device. Free.',
    },
  },
  {
    path: 'tools/pdf-convert',
    loadComponent: () => import('./tools/pdf-convert/pdf-convert').then((m) => m.PdfConvertTool),
    title: 'PDF Convert — YYDevTools',
    data: {
      description:
        'Convert a PDF into an editable Word, Excel, PowerPoint or rich-text file. ' +
        'Free, with a monthly allowance and no account required.',
    },
  },
  {
    path: 'tools/pdf-ocr',
    loadComponent: () => import('./tools/pdf-ocr/pdf-ocr').then((m) => m.PdfOcrTool),
    title: 'PDF OCR — YYDevTools',
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
    title: 'PDF Compress — YYDevTools',
    data: {
      description:
        'Shrink a PDF by downsampling the images inside it, with real, measured size ' +
        'savings. Free, with a monthly allowance and no account required.',
    },
  },
  {
    path: 'tools/pdf-viewer',
    loadComponent: () => import('./tools/pdf-viewer/pdf-viewer').then((m) => m.PdfViewerTool),
    title: 'PDF Viewer — YYDevTools',
    data: {
      description:
        'Open and read a PDF with thumbnails, search and zoom. The file is rendered ' +
        'locally and never uploaded. Free, with no sign-up.',
    },
  },
  {
    path: 'tools/pdf-split',
    loadComponent: () => import('./tools/pdf-split/pdf-split').then((m) => m.PdfSplitTool),
    title: 'PDF Split — YYDevTools',
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
    title: 'Hash & HMAC Generator — YYDevTools',
    data: {
      description:
        'Compute MD5, CRC32, SHA-1/256/384/512 and keyed HMAC digests of text or a file. ' +
        'Hashing happens in your browser. Free, with no sign-up.',
    },
  },
  {
    path: 'tools/uuid-generator',
    loadComponent: () =>
      import('./tools/uuid-generator/uuid-generator').then((m) => m.UuidGeneratorTool),
    title: 'UUID Generator — YYDevTools',
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
    title: 'Timestamp Converter — YYDevTools',
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
    title: 'Color Converter — HEX, RGB, HSL, OKLCH & LAB — YYDevTools',
    data: {
      description:
        'Convert colours between HEX, RGB, HSL, OKLCH and LAB, generate a perceptual tint/shade ' +
        'ramp and colour harmonies, and check WCAG contrast ratios. Free, runs in your browser.',
    },
  },
  {
    path: 'tools/text-diff',
    loadComponent: () => import('./tools/text-diff/text-diff').then((m) => m.TextDiffTool),
    title: 'Text Diff — Compare two texts — YYDevTools',
    data: {
      description:
        'Compare two blocks of text line by line, in a split or unified view, with options to ' +
        'ignore case and whitespace. Runs entirely in your browser. Free, no sign-up.',
    },
  },
  {
    path: 'tools/regex-tester',
    loadComponent: () =>
      import('./tools/regex-tester/regex-tester').then((m) => m.RegexTesterTool),
    title: 'Regex Tester — YYDevTools',
    data: {
      description:
        'Test a JavaScript regular expression live, with match highlighting, capture groups and ' +
        'flags. Runs in your browser, nothing is uploaded. Free, no sign-up.',
    },
  },
  {
    path: 'tools/cron-explainer',
    loadComponent: () =>
      import('./tools/cron-explainer/cron-explainer').then((m) => m.CronExplainerTool),
    title: 'Cron Expression Explainer — YYDevTools',
    data: {
      description:
        'Read a cron expression in plain English and preview its next scheduled run times. ' +
        'Runs in your browser. Free, no sign-up.',
    },
  },
  {
    path: 'tools/qr-generator',
    loadComponent: () => import('./tools/qr-generator/qr-generator').then((m) => m.QrGeneratorTool),
    title: 'QR Code Generator — YYDevTools',
    data: {
      description:
        'Turn text, a link or Wi-Fi details into a QR code, adjust the size and error correction, ' +
        'and download it as PNG or SVG. Generated in your browser. Free, no sign-up.',
    },
  },
  {
    path: 'tools/case-converter',
    loadComponent: () =>
      import('./tools/case-converter/case-converter').then((m) => m.CaseConverterTool),
    title: 'Case Converter & Slugify — YYDevTools',
    data: {
      description:
        'Convert text between camelCase, snake_case, kebab-case, PascalCase, CONSTANT_CASE, Title ' +
        'Case and a URL slug. Runs in your browser. Free, no sign-up.',
    },
  },
  {
    path: 'tools/sql-formatter',
    loadComponent: () =>
      import('./tools/sql-formatter/sql-formatter').then((m) => m.SqlFormatterTool),
    title: 'SQL Formatter — YYDevTools',
    data: {
      description:
        'Format and beautify SQL for Postgres, MySQL, SQL Server, SQLite, BigQuery and more, with ' +
        'adjustable indentation and keyword case. Runs in your browser. Free, no sign-up.',
    },
  },
  {
    path: 'tools/code-formatter',
    loadComponent: () =>
      import('./tools/code-formatter/code-formatter').then((m) => m.CodeFormatterTool),
    title: 'Code Formatter — HTML, CSS, JS, TypeScript, XML & more — YYDevTools',
    data: {
      description:
        'Beautify HTML, CSS, SCSS, JavaScript, TypeScript, JSON, Markdown, YAML, GraphQL and XML ' +
        'with Prettier, with adjustable indentation and quote style. Runs in your browser, nothing ' +
        'is uploaded. Free, no sign-up.',
    },
  },
  {
    // A real page rather than a redirect to "/": redirecting made every unknown
    // URL answer 200 with the homepage, which Search Console reports as a soft
    // 404. The Worker serves this one with a genuine 404 status.
    path: '404',
    loadComponent: () => import('./not-found/not-found').then((m) => m.NotFound),
    title: 'Page not found — YYDevTools',
    data: { description: 'That page does not exist.', noindex: true },
  },
  { path: '**', redirectTo: '404' },
];
