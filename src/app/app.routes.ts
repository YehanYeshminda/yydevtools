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
    path: 'terms',
    loadComponent: () => import('./terms/terms').then((m) => m.Terms),
    title: 'Terms of Use — YYDevTools',
    data: {
      description:
        'The terms for using YYDevTools: the tools are free and provided as-is, your ' +
        'content stays yours, and what counts as acceptable use of the hosted services.',
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
    path: 'tools/favicon-generator',
    loadComponent: () =>
      import('./tools/favicon-generator/favicon-generator').then((m) => m.FaviconGeneratorTool),
    title: 'Favicon Generator — Every icon size from one logo — YYDevTools',
    data: {
      description:
        'Make favicon.ico, PNG icons for tabs, iOS and Android, a maskable icon, the web manifest ' +
        'and the head tags from one logo. Runs in your browser — nothing is uploaded.',
    },
  },
  {
    path: 'tools/json-csv',
    loadComponent: () => import('./tools/json-csv/json-csv').then((m) => m.JsonCsvTool),
    title: 'JSON to CSV and CSV to JSON Converter — YYDevTools',
    data: {
      description:
        'Convert a JSON array to CSV for a spreadsheet, or a CSV file to JSON objects. Nested ' +
        'fields become dot columns and back. Runs in your browser — nothing is uploaded.',
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
        'Format, validate and minify JSON, convert to and from YAML, and query with JSONPath. ' +
        'Clear error messages. Runs in your browser — free, no sign-up.',
    },
  },
  {
    path: 'tools/json-to-types',
    loadComponent: () =>
      import('./tools/json-to-types/json-to-types').then((m) => m.JsonToTypesTool),
    title: 'JSON to TypeScript, Python, Rust, Kotlin & more — YYDevTools',
    data: {
      description:
        'Paste JSON and generate TypeScript, C#, Python, Go, Zod, Rust, Kotlin, Java, JSON ' +
        'Schema or Pydantic types, optionals and nullables inferred. Free, in-browser.',
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
        'Decode a JSON Web Token’s header, payload and claims, then verify the signature with ' +
        'an HMAC secret or public key (HS/RS/PS/ES). Runs in your browser, free.',
    },
  },
  {
    path: 'tools/jwt-editor',
    loadComponent: () => import('./tools/jwt-editor/jwt-editor').then((m) => m.JwtEditorTool),
    title: 'JWT Editor — Edit and re-sign a JSON Web Token — YYDevTools',
    data: {
      description:
        'Edit a JWT’s header and payload and re-sign it with an HMAC secret or PKCS#8 private ' +
        'key (HS/RS/PS/ES). Signing runs in your browser; nothing is sent anywhere.',
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
    path: 'tools/background-remover',
    loadComponent: () =>
      import('./tools/background-remover/background-remover').then((m) => m.BackgroundRemoverTool),
    title: 'Background Remover — Transparent PNG from a photo — YYDevTools',
    data: {
      description:
        'Remove the background from a photo and download a transparent PNG, or drop the subject ' +
        'onto a colour. The segmentation model runs in your browser, so nothing is uploaded.',
    },
  },
  {
    path: 'tools/passport-photo',
    loadComponent: () =>
      import('./tools/passport-photo/passport-photo').then((m) => m.PassportPhotoTool),
    title: 'Passport Photo Maker — Official ID photo sizes — YYDevTools',
    data: {
      description:
        'Crop a photo to UK, US, EU, Indian, Canadian, Chinese, Australian or Japanese passport ' +
        'size with head-position guides, then print one or a sheet. Runs in your browser, free.',
    },
  },
  {
    path: 'tools/video-trimmer',
    loadComponent: () =>
      import('./tools/video-trimmer/video-trimmer').then((m) => m.VideoTrimmerTool),
    title: 'Video Trimmer & GIF Maker — Cut a clip in your browser — YYDevTools',
    data: {
      description:
        'Trim a video, remove its sound, extract the audio as an MP3 or make a GIF. ffmpeg runs ' +
        'in your browser, so the video is never uploaded.',
    },
  },
  {
    path: 'tools/image-resize',
    loadComponent: () => import('./tools/image-resize/image-resize').then((m) => m.ImageResizeTool),
    title: 'Image Resizer & Cropper — Crop and resize online — YYDevTools',
    data: {
      description:
        'Crop an image with a draggable box or exact pixels, resize to a width, height or ' +
        'target file size, and save as JPEG, PNG or WebP. Nothing is uploaded.',
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
        'Compress JPEG, PNG and HEIC images to JPEG or WebP in bulk, by quality or to a ' +
        'target size, and download a zip. Compare before and after. Nothing is uploaded.',
    },
  },
  {
    path: 'tools/document-scanner',
    loadComponent: () => import('./tools/doc-scanner/doc-scanner').then((m) => m.DocScannerTool),
    title: 'Document Scanner — Photos of pages to a clean PDF — YYDevTools',
    data: {
      description:
        'Scan documents with your phone photos: drag the corners onto the page, it is ' +
        'straightened and cleaned to black and white, and saved as a PDF. Nothing is uploaded.',
    },
  },
  {
    path: 'tools/image-pdf',
    loadComponent: () => import('./tools/image-pdf/image-pdf').then((m) => m.ImagePdfTool),
    title: 'Image to PDF & PDF to Image — JPG ⇄ PDF — YYDevTools',
    data: {
      description:
        'Convert JPG, PNG and WebP images to one PDF, or turn every PDF page into a PNG or ' +
        'JPG. Reorder pages, pick size and resolution. Runs in your browser, free.',
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
    title: 'PDF Organizer — Reorder, rotate & delete pages — YYDevTools',
    data: {
      description:
        'Organize a PDF page by page: thumbnails, drag to reorder, rotate, delete, insert ' +
        'blank pages and combine files. Runs in your browser; documents never leave it.',
    },
  },
  {
    path: 'tools/office-to-pdf',
    loadComponent: () =>
      import('./tools/office-to-pdf/office-to-pdf').then((m) => m.OfficeToPdfTool),
    title: 'Office to PDF — YYDevTools',
    data: {
      description:
        'Convert Word, Excel or PowerPoint to PDF online with a real Office layout engine, so ' +
        'fonts, tables and page breaks land where they should. Free, no account.',
    },
  },
  {
    path: 'tools/pdf-watermark',
    loadComponent: () =>
      import('./tools/pdf-watermark/pdf-watermark').then((m) => m.PdfWatermarkTool),
    title: 'PDF Watermark & Page Numbers — Stamp a PDF online — YYDevTools',
    data: {
      description:
        'Add a text watermark like CONFIDENTIAL or DRAFT across every page of a PDF, and page ' +
        'numbers in the style and position you want. Live preview, nothing uploaded.',
    },
  },
  {
    path: 'tools/pdf-form-fill',
    loadComponent: () =>
      import('./tools/pdf-form-fill/pdf-form-fill').then((m) => m.PdfFormFillTool),
    title: 'PDF Form Fill & Flatten — Fill a PDF form online — YYDevTools',
    data: {
      description:
        'Fill the text fields, checkboxes, radio buttons and dropdowns of a PDF form in your ' +
        'browser, preview it, and download it editable or flattened. Never uploaded.',
    },
  },
  {
    path: 'tools/pdf-sign',
    loadComponent: () => import('./tools/pdf-sign/pdf-sign').then((m) => m.PdfSignTool),
    title: 'Sign PDF — Add your signature to a PDF online — YYDevTools',
    data: {
      description:
        'Sign a PDF in your browser: draw your signature, type your name or upload an image, ' +
        'drag it onto the page and download. Never uploaded. Free, no account.',
    },
  },
  {
    path: 'tools/pdf-redact',
    loadComponent: () => import('./tools/pdf-redact/pdf-redact').then((m) => m.PdfRedactTool),
    title: 'Redact PDF — Permanently remove text online — YYDevTools',
    data: {
      description:
        'Redact a PDF in your browser: find every occurrence of a name or number, or draw ' +
        'boxes, and download a copy with the covered content truly gone. Never uploaded.',
    },
  },
  {
    path: 'tools/pdf-protect',
    loadComponent: () => import('./tools/pdf-protect/pdf-protect').then((m) => m.PdfProtectTool),
    title: 'Protect PDF — Password-protect a PDF online — YYDevTools',
    data: {
      mode: 'protect',
      description:
        'Add a password to a PDF online with AES-256 encryption: an open password and an ' +
        'optional owner password. Free, no account; the file is deleted after processing.',
    },
  },
  {
    path: 'tools/pdf-unlock',
    loadComponent: () => import('./tools/pdf-protect/pdf-protect').then((m) => m.PdfProtectTool),
    title: 'Unlock PDF — Remove a PDF password online — YYDevTools',
    data: {
      mode: 'unlock',
      description:
        'Remove the password and editing restrictions from a PDF you know the password for. ' +
        'Free, no account, the file is deleted after processing.',
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
        'Make a scanned PDF searchable and selectable. Short English documents are recognised ' +
        'in your browser and never uploaded; longer ones use our service.',
    },
  },
  {
    path: 'tools/pdf-compress',
    loadComponent: () => import('./tools/pdf-compress/pdf-compress').then((m) => m.PdfCompressTool),
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
        'each column holds, and export to JSON. Nothing is uploaded. Free.',
    },
  },
  {
    path: 'tools/word-viewer',
    loadComponent: () => import('./tools/word-viewer/word-viewer').then((m) => m.WordViewerTool),
    title: 'Word Viewer — Open DOCX in your browser — YYDevTools',
    data: {
      description:
        'Open and read a Word .docx document in your browser with its layout, tables and images ' +
        'intact, and copy the text out. Free, no sign-up.',
    },
  },
  {
    path: 'tools/powerpoint-viewer',
    loadComponent: () =>
      import('./tools/powerpoint-viewer/powerpoint-viewer').then((m) => m.PowerpointViewerTool),
    title: 'PowerPoint Viewer — Open PPTX in your browser — YYDevTools',
    data: {
      description:
        'Open a PowerPoint .pptx presentation in your browser and read it slide by slide, with ' +
        'thumbnails, search and zoom. Free, no sign-up, no PowerPoint needed.',
    },
  },
  {
    path: 'tools/excel-viewer',
    loadComponent: () => import('./tools/excel-viewer/excel-viewer').then((m) => m.ExcelViewerTool),
    title: 'Excel Viewer — Open XLSX in your browser — YYDevTools',
    data: {
      description:
        'Open an Excel .xlsx workbook in your browser and read every sheet with formatting ' +
        'and number formats intact. Free, no sign-up, no Excel needed.',
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
        'Extract selected pages from a PDF, or split it into one file per page and get a ' +
        'single zip back. Runs in your browser, so your document stays on your device.',
    },
  },
  {
    path: 'tools/hash-generator',
    loadComponent: () =>
      import('./tools/hash-generator/hash-generator').then((m) => m.HashGeneratorTool),
    title: 'Hash & HMAC Generator — YYDevTools',
    data: {
      description:
        'Compute MD5, CRC32, SHA-1/256/384/512 and HMAC digests of text or files, export a ' +
        'sha256sum-style list, and verify a digest. Hashing runs in your browser, free.',
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
    path: 'tools/secret-link',
    loadComponent: () => import('./tools/secret-link/secret-link').then((m) => m.SecretLinkTool),
    title: 'One-Time Secret Link — Share a password safely — YYDevTools',
    data: {
      description:
        'Share a password or API key as a link that works exactly once. Encrypted in your ' +
        'browser with AES-256-GCM; the key travels in the URL fragment and never reaches a server.',
    },
  },
  {
    path: 'tools/password-generator',
    loadComponent: () =>
      import('./tools/password-generator/password-generator').then((m) => m.PasswordGeneratorTool),
    title: 'Password Generator — Passwords & Passphrases — YYDevTools',
    data: {
      description:
        'Generate strong random passwords and memorable EFF passphrases in your browser, with ' +
        'a strength meter and crack-time estimate. Nothing uploaded. Free.',
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
    path: 'tools/file-inspector',
    loadComponent: () =>
      import('./tools/file-inspector/file-inspector').then((m) => m.FileInspectorTool),
    title: 'What is this file? — File Inspector & Metadata Cleaner — YYDevTools',
    data: {
      description:
        'Find out what a file really is from its bytes, get its MD5 and SHA checksums, see the ' +
        'author and history a PDF or Office file carries, and download a clean copy. Nothing is uploaded.',
    },
  },
  {
    path: 'tools/color-converter',
    loadComponent: () =>
      import('./tools/color-converter/color-converter').then((m) => m.ColorConverterTool),
    title: 'Color Converter — HEX, RGB, HSL, OKLCH & LAB — YYDevTools',
    data: {
      description:
        'Convert colours between HEX, RGB, HSL, OKLCH and LAB, build tint and shade ramps and ' +
        'harmonies, and check WCAG contrast. Free, runs in your browser.',
    },
  },
  {
    path: 'tools/text-diff',
    loadComponent: () => import('./tools/text-diff/text-diff').then((m) => m.TextDiffTool),
    title: 'Text Diff — Compare two texts — YYDevTools',
    data: {
      description:
        'Compare two blocks of text line by line, in a split or unified view, with options to ' +
        'ignore case and whitespace. Runs entirely in your browser, free.',
    },
  },
  {
    path: 'tools/json-diff',
    loadComponent: () => import('./tools/json-diff/json-diff').then((m) => m.JsonDiffTool),
    title: 'JSON Diff — Compare two JSON documents by structure — YYDevTools',
    data: {
      description:
        'Semantic JSON diff: compare two JSON documents by key and value rather than by line, ' +
        'with the path of every added, removed and changed field. Runs in your browser, free.',
    },
  },
  {
    path: 'tools/regex-tester',
    loadComponent: () => import('./tools/regex-tester/regex-tester').then((m) => m.RegexTesterTool),
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
        'Make a QR code for a link, Wi-Fi network, contact card, email, SMS, phone, location ' +
        'or event; set size, colours and error correction; download PNG or SVG.',
    },
  },
  {
    path: 'tools/text-cleaner',
    loadComponent: () => import('./tools/text-cleaner/text-cleaner').then((m) => m.TextCleanerTool),
    title: 'Text Cleaner — Remove invisible characters and tidy lines — YYDevTools',
    data: {
      description:
        'Clean up pasted text: remove zero-width and invisible characters, straighten curly ' +
        'quotes, trim, sort and de-duplicate lines. Runs in your browser, free.',
    },
  },
  {
    path: 'tools/barcode-generator',
    loadComponent: () =>
      import('./tools/barcode-generator/barcode-generator').then((m) => m.BarcodeGeneratorTool),
    title: 'Barcode Generator — EAN, UPC, Code 128 & Code 39 — YYDevTools',
    data: {
      description:
        'Generate a Code 128, EAN-13, EAN-8, UPC-A, Code 39 or ITF-14 barcode and download it as ' +
        'SVG or PNG. Check digits calculated. Free, in your browser.',
    },
  },
  {
    path: 'tools/slug-generator',
    loadComponent: () =>
      import('./tools/slug-generator/slug-generator').then((m) => m.SlugGeneratorTool),
    title: 'Slug Generator — URL Slugs From a List of Titles — YYDevTools',
    data: {
      description:
        'Turn a list of titles into clean URL slugs, one per line. Accents folded, length ' +
        'capped on a word boundary, duplicates numbered. Free, in your browser.',
    },
  },
  {
    path: 'tools/pomodoro',
    loadComponent: () => import('./tools/pomodoro/pomodoro').then((m) => m.PomodoroTool),
    title: 'Pomodoro Timer & Stopwatch — YYDevTools',
    data: {
      description:
        'A Pomodoro timer with focus sessions and automatic breaks, plus a stopwatch with laps. ' +
        'Runs in your browser, free, with nothing to install.',
    },
  },
  {
    path: 'tools/unit-converter',
    loadComponent: () =>
      import('./tools/unit-converter/unit-converter').then((m) => m.UnitConverterTool),
    title: 'Unit Converter — Length, Weight, Temperature & more — YYDevTools',
    data: {
      description:
        'Convert length, weight, temperature, volume, speed, area, data and time between metric ' +
        'and imperial units, with every unit shown at once. Free, in your browser.',
    },
  },
  {
    path: 'tools/base-converter',
    loadComponent: () =>
      import('./tools/base-converter/base-converter').then((m) => m.BaseConverterTool),
    title: 'Number Base Converter — Binary, Octal, Decimal, Hex — YYDevTools',
    data: {
      description:
        'Convert a number between binary, octal, decimal, hexadecimal and any base up to 36, ' +
        'with a two’s-complement bit view you can click. Free, in your browser.',
    },
  },
  {
    path: 'tools/age-calculator',
    loadComponent: () =>
      import('./tools/age-calculator/age-calculator').then((m) => m.AgeCalculatorTool),
    title: 'Age Calculator & Date Difference — YYDevTools',
    data: {
      description:
        'Work out an age from a date of birth, or the difference between any two dates, in ' +
        'years, months and days and in total days, weeks, weekdays and hours. Free, in your browser.',
    },
  },
  {
    path: 'tools/lorem-ipsum',
    loadComponent: () => import('./tools/lorem-ipsum/lorem-ipsum').then((m) => m.LoremIpsumTool),
    title: 'Lorem Ipsum Generator — Placeholder text — YYDevTools',
    data: {
      description:
        'Generate Lorem Ipsum placeholder text by paragraph, sentence, word or list item, as ' +
        'plain text, HTML or Markdown. Runs in your browser, free.',
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
        'Format and beautify SQL for Postgres, MySQL, SQL Server, SQLite, BigQuery and more, ' +
        'with adjustable indentation and keyword case. Runs in your browser, free.',
    },
  },
  {
    path: 'tools/code-formatter',
    loadComponent: () =>
      import('./tools/code-formatter/code-formatter').then((m) => m.CodeFormatterTool),
    title: 'Code Formatter — HTML, CSS, JS, TypeScript & more — YYDevTools',
    data: {
      description:
        'Beautify HTML, CSS, SCSS, JavaScript, TypeScript, JSON, Markdown, YAML, GraphQL and ' +
        'XML with Prettier; set indentation and quote style. Runs in your browser.',
    },
  },
  {
    path: 'guides',
    loadComponent: () => import('./guides/guides').then((m) => m.Guides),
    title: 'Guides — YYDevTools',
    data: {
      description:
        'Plain-English explainers on the ideas behind the tools: JWTs, Base64, hashing, cron ' +
        'schedules, UUIDs and image compression. Free, and readable on their own.',
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
        'together, why decoding is not verifying, and the classic forgery attacks.',
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
        'Read and write cron schedules with confidence: the five fields, asterisks, slashes ' +
        'and ranges, worked examples, and the timezone gotcha that misfires jobs.',
    },
  },
  {
    path: 'guides/uuid-versions-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'UUIDs explained: v4 vs v7 — YYDevTools',
    data: {
      slug: 'uuid-versions-explained',
      description:
        'UUID v4 vs v7: why v4 is random, how v7 embeds a timestamp so ids sort by creation ' +
        'time, and why that ordering matters for database index performance.',
    },
  },
  {
    path: 'guides/compress-images-for-web',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'How to compress images for the web — YYDevTools',
    data: {
      slug: 'compress-images-for-web',
      description:
        'Compress images for the web without visible loss: JPEG vs WebP, how the quality ' +
        'slider really works, resizing first, and stripping GPS metadata from photos.',
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
        'Argon2 are deliberately slow, and how to read a breach announcement.',
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
        'What each image format throws away and when to use it: how JPEG decides what to ' +
        'discard, why PNG is huge for photos, what WebP and AVIF changed, and HEIC.',
    },
  },
  {
    path: 'guides/photo-metadata-privacy',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'What your photos reveal: EXIF metadata and GPS — YYDevTools',
    data: {
      slug: 'photo-metadata-privacy',
      description:
        'Photos record the camera, the exact time and often the coordinates where they were ' +
        'taken. What is in there, when sharing strips it, and how to remove it.',
    },
  },
  {
    path: 'guides/regex-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'Regex explained: reading, writing and when not to — YYDevTools',
    data: {
      slug: 'regex-explained',
      description:
        'How a regex engine matches, why greedy and lazy quantifiers differ, the pattern shape ' +
        'that can hang a server, and the problems a regex should never be used on.',
    },
  },
  {
    path: 'guides/character-encoding-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'Character encoding: Unicode, UTF-8 and mojibake — YYDevTools',
    data: {
      slug: 'character-encoding-explained',
      description:
        'Why é arrives as Ã©, what a code point is, how UTF-8 stores one, and the encoding ' +
        'mistakes that break CSV files, URLs, database columns and string comparisons.',
    },
  },
  {
    path: 'guides/certificates-and-the-chain-of-trust',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'Certificates and the chain of trust — YYDevTools',
    data: {
      slug: 'certificates-and-the-chain-of-trust',
      description:
        'What a TLS certificate contains, why the chain has intermediates, how little a ' +
        'certificate authority really verifies, and what browser warnings mean.',
    },
  },
  {
    path: 'tools/certificate-decoder',
    loadComponent: () =>
      import('./tools/certificate-decoder/certificate-decoder').then(
        (m) => m.CertificateDecoderTool,
      ),
    title: 'Certificate Decoder — Read an SSL certificate — YYDevTools',
    data: {
      description:
        'Decode an X.509 SSL/TLS certificate or chain: subject, issuer, expiry, public key, ' +
        'SANs, key usage, fingerprints and extensions. Paste PEM or upload .crt/.der.',
    },
  },
  {
    path: 'tools/key-generator',
    loadComponent: () =>
      import('./tools/key-generator/key-generator').then((m) => m.KeyGeneratorTool),
    title: 'Key Generator — RSA & EC key pairs — YYDevTools',
    data: {
      description:
        'Generate an RSA or EC key pair with your browser’s own Web Crypto. The private key is ' +
        'created on your device and never uploaded. Free, no sign-up.',
    },
  },
  {
    path: 'guides/pdf-internals-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'What is actually inside a PDF — YYDevTools',
    data: {
      slug: 'pdf-internals-explained',
      description:
        'A PDF is drawing instructions, not a document. Why text extraction breaks, where the ' +
        'megabytes go, and why a black rectangle does not redact anything.',
    },
  },
  {
    path: 'guides/colour-on-the-web-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'Colour on the web: hex, HSL and OKLCH explained — YYDevTools',
    data: {
      slug: 'colour-on-the-web-explained',
      description:
        'What a hex code really is, why averaging colours in sRGB looks muddy, why HSL ' +
        'lightness is not comparable across hues, and what OKLCH fixes.',
    },
  },
  {
    path: 'guides/csv-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'CSV explained: delimiters, quoting and Excel — YYDevTools',
    data: {
      slug: 'csv-explained',
      description:
        'What a CSV really is, why the delimiter is not always a comma, the quoting rule most ' +
        'hand-written parsers break, and the five ways Excel silently corrupts one.',
    },
  },
  {
    path: 'guides/docx-files-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'Inside a Word file: why .docx is a ZIP — YYDevTools',
    data: {
      slug: 'docx-files-explained',
      description:
        'Rename a .docx to .zip and look inside: XML for the text, a separate file for styles, ' +
        'and a metadata file that knows who edited it. What that structure explains.',
    },
  },
  {
    path: 'guides/favicons-and-app-icons-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'Favicons and app icons: every size explained — YYDevTools',
    data: {
      slug: 'favicons-and-app-icons-explained',
      description:
        'Why a website is asked for its icon in seven sizes, which file each browser and phone ' +
        'really picks, what "maskable" means, and why a new icon refuses to show up.',
    },
  },
  {
    path: 'guides/xlsx-files-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'Inside an .xlsx file: shared strings and serial dates — YYDevTools',
    data: {
      slug: 'xlsx-files-explained',
      description:
        'A spreadsheet is a ZIP of XML with a string table and a date system that is deliberately ' +
        'wrong. Why Excel eats leading zeros and mangles long numbers.',
    },
  },
  {
    path: 'guides/qr-codes-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'How a QR code works, and why yours will not scan — YYDevTools',
    data: {
      slug: 'qr-codes-explained',
      description:
        'What the three big squares are for, how a code survives being scratched, why uppercase ' +
        'URLs make smaller codes, and the printing mistakes that stop a scan.',
    },
  },
  {
    path: 'guides/markdown-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'Markdown explained: one syntax, many dialects — YYDevTools',
    data: {
      slug: 'markdown-explained',
      description:
        'Why the same file renders differently on GitHub and in your notes app, which rules are ' +
        'actually standard, and the five bits of syntax that trip everyone up.',
    },
  },
  {
    path: 'guides/unix-time-and-time-zones-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'Unix time, UTC and time zones explained — YYDevTools',
    data: {
      slug: 'unix-time-and-time-zones-explained',
      description:
        'What the epoch really counts, how to tell seconds from milliseconds, why a time zone is ' +
        'not an offset, and the one rule that prevents most date bugs.',
    },
  },
  {
    path: 'guides/sql-dialects-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'SQL dialects: Postgres, MySQL and SQL Server compared — YYDevTools',
    data: {
      slug: 'sql-dialects-explained',
      description:
        'Quoting, string concatenation, LIMIT versus TOP, upserts, GROUP BY strictness and NULL ' +
        'rules. What the standard says and where each database goes its own way.',
    },
  },
  {
    path: 'guides/json-schema-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'JSON Schema explained — YYDevTools',
    data: {
      slug: 'json-schema-explained',
      description:
        'How to write a schema that actually rejects bad data, why additionalProperties and ' +
        'format catch everyone out, and the difference between anyOf and oneOf.',
    },
  },
  {
    path: 'guides/ocr-explained',
    loadComponent: () => import('./guides/guide/guide').then((m) => m.GuideArticle),
    title: 'How OCR works, and why it still gets things wrong — YYDevTools',
    data: {
      slug: 'ocr-explained',
      description:
        'The pipeline that turns a picture of a page into text, why 0 and O are the least of ' +
        'your problems, and what a searchable PDF really contains.',
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
