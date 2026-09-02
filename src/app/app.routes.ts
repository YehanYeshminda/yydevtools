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
        'What YYDevTools is and how it works: a free, no-sign-up collection of ' +
        'developer and PDF tools that run in your browser, and how your files are handled.',
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
    path: 'tools/xml-viewer',
    loadComponent: () => import('./tools/xml-viewer/xml-viewer').then((m) => m.XmlViewerTool),
    title: 'XML Viewer, Formatter & XPath Tester — YYDevTools',
    data: {
      description:
        'Format, validate and explore XML as a tree, and query it with XPath. Runs entirely in ' +
        'your browser — nothing is uploaded. Free, with no sign-up.',
    },
  },
  {
    path: 'tools/url-encoder',
    loadComponent: () => import('./tools/url-encoder/url-encoder').then((m) => m.UrlEncoderTool),
    title: 'URL Encoder / Decoder — YYDevTools',
    data: {
      description:
        'Percent-encode or decode URLs and query values, and break any URL into its ' +
        'protocol, host, path and parameters. Runs in your browser — nothing is uploaded.',
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
    path: 'tools/word-counter',
    loadComponent: () => import('./tools/word-counter/word-counter').then((m) => m.WordCounterTool),
    title: 'Word Counter — Count Words & Characters Online — YYDevTools',
    data: {
      description:
        'Count words, characters, sentences and paragraphs as you type, with reading time and ' +
        'keyword density. Free, runs in your browser, nothing is uploaded.',
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
    path: 'tools/html-preview',
    loadComponent: () => import('./tools/html-preview/html-preview').then((m) => m.HtmlPreviewTool),
    title: 'HTML Preview — Live HTML Editor & Viewer — YYDevTools',
    data: {
      description:
        'Write or paste HTML and see it rendered live in a sandboxed frame, with an ' +
        'optional scripts toggle. Runs in your browser — nothing is uploaded.',
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
    path: 'tools/jwt-editor',
    loadComponent: () => import('./tools/jwt-editor/jwt-editor').then((m) => m.JwtEditorTool),
    title: 'JWT Editor — Edit and re-sign a JSON Web Token — YYDevTools',
    data: {
      description:
        'Edit a JSON Web Token’s header and payload and re-sign it into a new, valid token with ' +
        'an HMAC secret or a PKCS#8 private key (HS/RS/PS/ES). Signing runs in your browser with ' +
        'Web Crypto — the token and key are never sent anywhere. Free, no sign-up.',
    },
  },
  {
    path: 'tools/image-converter',
    loadComponent: () =>
      import('./tools/image-converter/image-converter').then((m) => m.ImageConverterTool),
    title: 'Image Converter — HEIC, JPEG, PNG, WebP & AVIF — YYDevTools',
    data: {
      description:
        'Convert images between HEIC, JPEG, PNG, WebP and AVIF in bulk. Runs entirely in your ' +
        'browser — your photos are never uploaded. Free, with no sign-up.',
    },
  },
  {
    path: 'tools/exif-viewer',
    loadComponent: () => import('./tools/exif-viewer/exif-viewer').then((m) => m.ExifViewerTool),
    title: 'EXIF Viewer & Metadata Remover — YYDevTools',
    data: {
      description:
        'See the hidden metadata in a photo — camera, timestamp and GPS location — then remove ' +
        'it without re-compressing the image. Nothing is uploaded.',
    },
  },
  {
    path: 'tools/image-compressor',
    loadComponent: () =>
      import('./tools/image-compressor/image-compressor').then((m) => m.ImageCompressorTool),
    title: 'Image Compressor — YYDevTools',
    data: {
      description:
        'Compress JPEG, PNG and HEIC images to JPEG or WebP in bulk — by quality or to a ' +
        'target file size — and download them as a zip. Compare before and after, and see ' +
        'or strip the Exif metadata. Runs in your browser; your images are never uploaded.',
    },
  },
  {
    path: 'tools/image-pdf',
    loadComponent: () => import('./tools/image-pdf/image-pdf').then((m) => m.ImagePdfTool),
    title: 'Image to PDF & PDF to Image — JPG ⇄ PDF — YYDevTools',
    data: {
      description:
        'Convert JPG, PNG and WebP images to a single PDF, or turn every page of a PDF into a ' +
        'PNG or JPG image. Reorder pages, pick the page size and resolution. Everything runs ' +
        'in your browser — nothing is uploaded. Free, no sign-up.',
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
    path: 'tools/pdf-organizer',
    loadComponent: () =>
      import('./tools/pdf-organizer/pdf-organizer').then((m) => m.PdfOrganizerTool),
    title: 'PDF Organizer — Reorder, rotate and delete PDF pages — YYDevTools',
    data: {
      description:
        'Organize a PDF page by page: see every page as a thumbnail, drag to reorder, rotate, ' +
        'delete, insert blank pages and combine several files into one. Runs in your browser, ' +
        'so your documents never leave your device. Free, no sign-up.',
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
        'Run text recognition on a scanned PDF to make it searchable and selectable. Short ' +
        'English documents are recognised entirely in your browser and never uploaded; longer ' +
        'documents and fifteen languages use our hosted service. Free, no account required.',
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
    path: 'tools/csv-viewer',
    loadComponent: () => import('./tools/csv-viewer/csv-viewer').then((m) => m.CsvViewerTool),
    title: 'CSV Viewer — Open and search CSV files online — YYDevTools',
    data: {
      description:
        'Open a CSV as a searchable table with the delimiter detected automatically, see what ' +
        'each column holds, and export to JSON. Nothing is uploaded. Free, no sign-up.',
    },
  },
  {
    path: 'tools/word-viewer',
    loadComponent: () => import('./tools/word-viewer/word-viewer').then((m) => m.WordViewerTool),
    title: 'Word Viewer — Open DOCX in your browser — YYDevTools',
    data: {
      description:
        'Open and read a Word .docx document in your browser with its layout, tables and images ' +
        'intact, and copy the text out. The file is never uploaded. Free, no sign-up.',
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
        'Extract selected pages from a PDF, or split it into one file per page and get them ' +
        'back as a single zip. Runs in your browser, so your document stays on your device.',
    },
  },
  {
    path: 'tools/hash-generator',
    loadComponent: () =>
      import('./tools/hash-generator/hash-generator').then((m) => m.HashGeneratorTool),
    title: 'Hash & HMAC Generator — YYDevTools',
    data: {
      description:
        'Compute MD5, CRC32, SHA-1/256/384/512 and keyed HMAC digests of text or a batch of ' +
        'files, export a sha256sum-style checksum list, and verify a digest you were given. ' +
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
    path: 'tools/password-generator',
    loadComponent: () =>
      import('./tools/password-generator/password-generator').then((m) => m.PasswordGeneratorTool),
    title: 'Password Generator — Strong Passwords & Passphrases — YYDevTools',
    data: {
      description:
        'Generate strong random passwords and memorable EFF passphrases in your browser, ' +
        'with a strength meter and crack-time estimate. Nothing is uploaded. Free, no sign-up.',
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
        'Make a QR code for a link, Wi-Fi network, contact card, email, SMS, phone number, ' +
        'location or calendar event, adjust the size, colours and error correction, and ' +
        'download it as PNG or SVG. Generated in your browser. Free, no sign-up.',
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
    path: 'guides',
    loadComponent: () => import('./guides/guides').then((m) => m.Guides),
    title: 'Guides — YYDevTools',
    data: {
      description:
        'Plain-English explainers on the ideas behind the tools — JWTs, Base64, hashing, cron ' +
        'schedules, UUIDs and image compression. Free, and written to be read on their own.',
    },
  },
  {
    path: 'guides/jwt-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'JSON Web Tokens explained — YYDevTools',
    data: {
      slug: 'jwt-explained',
      description:
        'A plain-English guide to JSON Web Tokens: how the header, payload and signature fit ' +
        'together, why decoding is not verifying, and the classic JWT forgery attacks.',
    },
  },
  {
    path: 'guides/base64-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'Base64 explained — YYDevTools',
    data: {
      slug: 'base64-explained',
      description:
        'How Base64 turns binary into safe text, roughly how the encoding works, why it grows ' +
        'your data by a third, what data URIs are, and why Base64 is not encryption.',
    },
  },
  {
    path: 'guides/hashing-vs-encryption-vs-encoding',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'Hashing vs encryption vs encoding — YYDevTools',
    data: {
      slug: 'hashing-vs-encryption-vs-encoding',
      description:
        'Encoding is for compatibility, encryption is for secrecy, hashing is for integrity. ' +
        'How to tell the three apart, where HMAC fits, and when to reach for each.',
    },
  },
  {
    path: 'guides/cron-expressions-guide',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'Cron expressions: a practical guide — YYDevTools',
    data: {
      slug: 'cron-expressions-guide',
      description:
        'Read and write cron schedules with confidence: the five fields, the asterisks, slashes ' +
        'and ranges, worked examples, and the timezone gotcha that fires jobs at the wrong hour.',
    },
  },
  {
    path: 'guides/uuid-versions-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'UUIDs explained: v4 vs v7 — YYDevTools',
    data: {
      slug: 'uuid-versions-explained',
      description:
        'UUID version 4 vs version 7: why v4 is random, how v7 embeds a timestamp so ids sort by ' +
        'creation time, and why that ordering matters for database index performance.',
    },
  },
  {
    path: 'guides/compress-images-for-web',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'How to compress images for the web — YYDevTools',
    data: {
      slug: 'compress-images-for-web',
      description:
        'Compress images for the web without visible loss: JPEG vs WebP, how the quality slider ' +
        'really works, resizing before compressing, and stripping the GPS metadata in photos.',
    },
  },
  {
    path: 'guides/password-storage-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'How passwords should be stored — YYDevTools',
    data: {
      slug: 'password-storage-explained',
      description:
        'Why passwords are hashed rather than encrypted, what a salt prevents, why bcrypt and ' +
        'Argon2 are deliberately slow, and how to read what a breach announcement really says.',
    },
  },
  {
    path: 'guides/https-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'What actually happens when you load an HTTPS page — YYDevTools',
    data: {
      slug: 'https-explained',
      description:
        'The TLS handshake in plain English: how a browser and server agree on keys in public, ' +
        'what certificates prove, and what the padlock does and does not tell you.',
    },
  },
  {
    path: 'guides/image-formats-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'JPEG, PNG, WebP, AVIF and HEIC compared — YYDevTools',
    data: {
      slug: 'image-formats-explained',
      description:
        'What each image format throws away and when to use it: how JPEG decides what to discard, ' +
        'why PNG is huge for photos, what WebP and AVIF changed, and why iPhones produce HEIC.',
    },
  },
  {
    path: 'guides/photo-metadata-privacy',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'What your photos reveal: EXIF metadata and GPS — YYDevTools',
    data: {
      slug: 'photo-metadata-privacy',
      description:
        'Photos record the camera, the exact time and often the coordinates where they were taken. ' +
        'What is in there, when sharing strips it, and how to remove it without degrading the image.',
    },
  },
  {
    path: 'news',
    loadComponent: () => import('./news/news').then((m) => m.News),
    title: 'Tech News — YYDevTools',
    data: {
      description:
        'Today’s technology news, gathered from many independent publishers for a spread of ' +
        'perspectives on software, hardware, security and the wider tech industry. Free, no sign-up.',
      // Deliberately not indexed, for two reasons that both point the same way.
      // The headlines are fetched after hydration, so what a crawler receives is
      // a loading shell of about 90 words — a thin page by any measure. And the
      // content, once it arrives, is other publishers' headlines and summaries;
      // an aggregation of someone else's writing is exactly what search quality
      // guidelines mean by scraped content with little added value. It stays for
      // readers, who get a useful digest; it just is not offered for indexing.
      noindex: true,
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
