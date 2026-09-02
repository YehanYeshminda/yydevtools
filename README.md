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
| **Regex Tester** | Test a regular expression live, with match highlighting and capture groups. |
| **Cron Explainer** | Read a cron expression in plain English and preview its next run times. |
| **QR Code Generator** | QR codes for links, Wi-Fi, contact cards, events or locations — as PNG or SVG. |
| **Case Converter** | Convert text between camelCase, snake_case, kebab-case, PascalCase and a slug. |
| **SQL Formatter** | Format and beautify SQL for a dozen dialects. |
| **Code Formatter** | Beautify HTML, CSS, JS, TypeScript, JSON, Markdown, YAML, GraphQL and XML. |
| **XML Viewer** | Format, validate and explore XML as a tree, and query it with XPath — using the browser’s own parser. |
| **HTML Preview** | Render HTML live in a sandboxed frame — phone/tablet/full widths, full-screen, a captured console, a Prettier Format button and a light/dark backdrop. |
| **UUID Generator** | Random v4 or time-ordered v7 UUIDs in bulk. |
| **Password Generator** | Strong random passwords or EFF passphrases, with a strength and crack-time check. |
| **Color Converter** | Convert HEX, RGB, HSL, OKLCH and LAB, generate palettes and check WCAG contrast. |

### Converters

| Tool | Description |
| --- | --- |
| **Base64 Converter** | Encode and decode text or files to and from Base64. |
| **URL Encoder / Decoder** | Percent-encode or decode URLs and query values, and break a URL into its parts. |
| **Image Compressor** | Shrink JPEG, PNG and HEIC images in bulk — by quality or to a target size, with Exif control. |
| **Image Converter** | Convert between HEIC, JPEG, PNG, WebP and AVIF in bulk — iPhone photos included — without uploading them. |
| **EXIF Viewer** | See the camera, timestamp and GPS location hidden in a photo, then strip it out without re-compressing. |
| **Timestamp Converter** | Convert between Unix timestamps and human-readable dates. |

### Documents

| Tool | Description |
| --- | --- |
| **Word & Character Counter** | Count words, characters, sentences and paragraphs live, with reading time and keyword density. |
| **Markdown Editor** | Write Markdown with a live, side-by-side preview. |
| **Image ↔ PDF** | Combine JPG/PNG/WebP images into one PDF, or turn every PDF page back into an image. |
| **PDF Convert** | Turn a PDF into an editable Word or rich-text file. *(hosted)* |
| **PDF OCR** | Make a scanned PDF searchable — short English files entirely in the browser. *(long files hosted)* |
| **PDF Compress** | Shrink a PDF by downsampling the images inside it. *(hosted)* |
| **CSV Viewer** | Open a CSV as a searchable table with the delimiter detected, and export it as JSON. |
| **Word Viewer** | Open and read a .docx with its layout, tables and images intact, and copy the text out. |
| **PDF Viewer** | Open and read a PDF with thumbnails, search and zoom. |
| **PDF Organizer** | Reorder, rotate and delete PDF pages visually, and combine files. |
| **PDF Merge** | Combine several PDF files into a single document. |
| **PDF Split** | Extract selected pages from a PDF, or split it into one file per page. |

Client-side tools use the Web Crypto, Canvas, `FileReader`, WASM codec and
`pdf-lib`/pdf.js APIs directly in the browser. The three *(hosted)* operations
are proxied by the Worker to self-hosted Fly.io services (Ghostscript, ocrmypdf,
LibreOffice), rate-limited per IP via Upstash Redis.

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
- Cloudflare Workers (static assets + API) with self-hosted Fly.io services for
  the three operations that cannot run in a browser
