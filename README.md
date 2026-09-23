# YYDevTools — [yydevtools.com](https://yydevtools.com)

A collection of fast, privacy-friendly developer and document utilities that run
in your browser. No accounts, no watermarks — and nothing you paste or open is
uploaded, with one honest exception: three PDF operations (convert, OCR of long
documents, compress) that genuinely cannot run client-side are proxied to
self-hosted services. Everything else never leaves your device.

Built with Angular 21 (standalone, zoneless, signals) and Angular Material,
served as prerendered static pages by a Cloudflare Worker.

## Tools

The catalog lives in [`src/app/tools/tools.data.ts`](src/app/tools/tools.data.ts) —
the homepage grid, search, command palette and this table all come from it.

### Developer

| Tool | Description |
| --- | --- |
| **JSON Formatter** | Format, validate and minify JSON, convert to/from YAML and query with JSONPath. |
| **JSON to Types** | Turn JSON into TypeScript, Python, Rust, Kotlin, Java, JSON Schema and more. |
| **JWT Decoder** | Decode JWT headers and claims, and verify the signature. |
| **JWT Editor** | Edit a JWT's claims and re-sign it into a new, valid token (HS/RS/PS/ES). |
| **Hash Generator** | MD5, CRC32, SHA and keyed HMAC digests of text or many files, plus checksum verification. |
| **Text Diff** | Compare two blocks of text line by line, in a split or unified view. |
| **JSON Diff** | Compare two JSON payloads by structure: reordered keys are not changes, type changes are, and every difference comes with its path. |
| **Regex Tester** | Test a regular expression live, with match highlighting and capture groups. |
| **Cron Explainer** | Read a cron expression in plain English and preview its next run times. |
| **QR Code Generator** | QR codes for links, Wi-Fi, contact cards, events or locations — as PNG or SVG. |
| **Barcode Generator** | Code 128, EAN-13, EAN-8, UPC-A, Code 39 and ITF-14, with check digits calculated. |
| **Slug Generator** | A list of titles into URL slugs — accents folded, length capped, collisions numbered. |
| **Colour Palette Extractor** | The dominant colours of a photo or logo, with the share each one covers. |
| **Email Template Generator** | Plain text into an HTML email that survives Outlook, or a .eml, Word or RTF file. |
| **Invoice & Receipt Generator** | Fill in an invoice or receipt with a live preview and your logo, and download the PDF. |
| **PDF Visual Diff** | Compare two PDFs page by page and see which pixels moved. |
| **Text Cleaner** | Strip invisible characters, straighten curly quotes, trim, sort and de-duplicate lines. |
| **Lorem Ipsum Generator** | Generate placeholder text by paragraph, sentence, word or list item, as text, HTML or Markdown. |
| **Case Converter** | Convert text between camelCase, snake_case, kebab-case, PascalCase and a slug. |
| **SQL Formatter** | Format and beautify SQL for a dozen dialects. |
| **Code Formatter** | Beautify HTML, CSS, JS, TypeScript, JSON, Markdown, YAML, GraphQL and XML. |
| **XML Viewer** | Format, validate and explore XML as a tree, and query it with XPath — using the browser’s own parser. |
| **HTML Preview** | Render HTML live in a sandboxed frame — phone/tablet/full widths, full-screen, a captured console, a Prettier Format button and a light/dark backdrop. |
| **UUID Generator** | Random v4 or time-ordered v7 UUIDs in bulk. |
| **Certificate Decoder** | Decode an X.509 certificate or chain — subject, issuer, expiry, key, SANs, fingerprints, extensions. *(hosted)* |
| **Key Generator** | Generate an RSA or EC key pair in the browser — the private key never leaves the device. |
| **One-Time Secret** | Send a password or key as a link that opens once. Encrypted in your browser; the key never reaches the server. |
| **Password Generator** | Strong random passwords or EFF passphrases, with a strength and crack-time check. |
| **Color Converter** | Convert HEX, RGB, HSL, OKLCH and LAB, generate palettes and check WCAG contrast. |
| **Favicon Generator** | One logo in, every icon out: favicon.ico, the PNG sizes for tabs, iOS and Android, a maskable icon, the manifest and the head tags. |

### Converters

| Tool | Description |
| --- | --- |
| **Number Base Converter** | Binary, octal, decimal, hex and any base up to 36, with a clickable bit view. |
| **Base64 Converter** | Encode and decode text or files to and from Base64. |
| **JSON ↔ CSV Converter** | Turn a JSON array into a spreadsheet-ready CSV or a CSV into JSON objects, nested fields included. |
| **URL Encoder / Decoder** | Percent-encode or decode URLs and query values, and break a URL into its parts. |
| **Image Compressor** | Shrink JPEG, PNG and HEIC images in bulk — by quality or to a target size, with Exif control. |
| **Background Remover** | Cut the background out of a photo and save a transparent PNG, or put the subject on a colour. Runs in your browser. |
| **Passport Photo Maker** | Crop to an official passport or ID size with head-position guides, then print one or a sheet. |
| **Image Converter** | Convert between HEIC, JPEG, PNG, WebP and AVIF in bulk — iPhone photos included — without uploading them. |
| **Video Trimmer & GIF Maker** | Cut a clip, drop the sound, pull out the audio as an MP3, or turn it into a GIF. ffmpeg runs in your browser. |
| **Image Resizer & Cropper** | Crop with a draggable box, resize to exact pixels or a file size, and save as JPEG, PNG or WebP. |
| **Image Viewer** | Open an image from a file or pasted Base64, and zoom in or check its transparency. |
| **EXIF Viewer** | See the camera, timestamp and GPS location hidden in a photo, then strip it out without re-compressing. |
| **Pomodoro Timer & Stopwatch** | Focus sessions with automatic breaks, or a stopwatch with laps. Keeps running across the site. |
| **Unit Converter** | Length, weight, temperature, volume, speed, area, data and time, with every unit at once. |
| **Age & Date Difference Calculator** | An age from a date of birth, or the span between two dates, in calendar units and totals. |
| **Timestamp Converter** | Convert between Unix timestamps and human-readable dates. |

### Documents

| Tool | Description |
| --- | --- |
| **Word & Character Counter** | Count words, characters, sentences and paragraphs live, with reading time and keyword density. |
| **Markdown Editor** | Write Markdown with a live, side-by-side preview. |
| **Document Scanner** | Turn photos of pages into a straight, clean PDF — drag the corners, pick a look, download. |
| **Image ↔ PDF** | Combine JPG/PNG/WebP images into one PDF, or turn every PDF page back into an image. |
| **Office to PDF** | Convert a Word, Excel or PowerPoint file to PDF, laid out as Office would. *(hosted)* |
| **PDF Watermark & Page Numbers** | Stamp text across every page and add page numbers, with a live preview. |
| **PDF Form Fill & Flatten** | Fill a PDF form's fields with a live preview, then download it editable or flattened. |
| **Sign PDF** | Draw, type or upload a signature and place it on a page. |
| **PDF Editor** | Click a line of text in a PDF, type over it, and keep the original fonts. |
| **Redact PDF** | Black out a phrase everywhere or draw boxes, and get a PDF with the content truly removed. |
| **Protect PDF** / **Unlock PDF** | Lock a PDF with an AES-256 password, or remove a password you know. *(hosted)* |
| **PDF Convert** | Turn a PDF into an editable Word or rich-text file. *(hosted)* |
| **PDF OCR** | Make a scanned PDF searchable — short English files entirely in the browser. *(long files hosted)* |
| **PDF Compress** | Shrink a PDF by downsampling the images inside it. *(hosted)* |
| **File Inspector** | What is this file? Its real type from the bytes, its checksums, and the author, company and history a PDF or Office file carries — with a button to strip them. |
| **CSV Viewer** | Open a CSV as a searchable table with the delimiter detected, and export it as JSON. |
| **Word Viewer** | Open and read a .docx with its layout, tables and images intact, and copy the text out. |
| **Excel Viewer** | Open an .xlsx workbook and read its sheets with formatting intact. *(hosted)* |
| **PowerPoint Viewer** | Open a .pptx deck and read it slide by slide. *(hosted)* |
| **PDF Viewer** | Open and read a PDF with thumbnails, search and zoom. |
| **PDF Organizer** | Reorder, rotate and delete PDF pages visually, and combine files. |
| **PDF Merge** | Combine several PDF files into a single document. |
| **PDF Split** | Extract selected pages from a PDF, or split it into one file per page. |

Client-side tools use the Web Crypto, Canvas, `FileReader`, WASM codec and
`pdf-lib`/pdf.js APIs directly in the browser. The *(hosted)* operations are
proxied by the Worker to self-hosted Fly.io services (Ghostscript, ocrmypdf,
LibreOffice, and an ASP.NET Core service for the Office formats, PDF passwords
and certificate parsing), rate-limited per IP via Upstash Redis.

## Development

Requires Node ≥ 20.

```bash
npm install
npm start
```

Then open `http://localhost:4200/`.

Run the unit tests with:

```bash
npm test
```

That is Angular's unit-test builder on top of vitest. It is the runner to use:
it compiles components, provides a DOM and initialises `TestBed`, which the
component specs need. Bare `npx vitest run` still executes the pure-logic specs,
but skips none of them silently — it fails outright on anything using `TestBed`.

## Building

```bash
npm run build
```

This prerenders **every route to its own HTML file** (`outputMode: "static"`),
writes the output to `dist/yydevtools/browser` and regenerates `sitemap.xml`
from what was actually prerendered.

## Deployment (Cloudflare Workers)

The Worker (config in [`wrangler.jsonc`](wrangler.jsonc), code in
[`worker/`](worker/index.ts)) serves the prerendered pages as static assets and
handles `/api/*` (the hosted PDF operations and the cached news feed). There is
no SPA fallback: unmatched paths get the prerendered `/404` page with a real
404 status.

```bash
npm run build
npx wrangler deploy
```

Service URLs are plain vars in `wrangler.jsonc`; their shared secrets are set
with `npx wrangler secret put <NAME>` and are never committed.

## Tech stack

- [Angular 21](https://angular.dev/) — standalone components, zoneless change
  detection, signals and native control flow
- [Angular Material](https://material.angular.dev/) + [ng-icons](https://ng-icons.github.io/ng-icons/)
- [pdf-lib](https://pdf-lib.js.org/) and a vendored [pdf.js](https://mozilla.github.io/pdf.js/) for client-side PDF work
- mozjpeg / libwebp WASM codecs for image compression
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) running
  [U²-Net](https://github.com/xuebinqin/U-2-Net) (Apache-2.0, see
  `public/models/NOTICE.txt`) for background removal, in a worker, on-device
- Cloudflare Workers (static assets + API) with self-hosted Fly.io services for
  the three operations that cannot run in a browser
