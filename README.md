# yydevtools

A collection of fast, privacy-friendly developer utilities that run entirely in
your browser. No uploads, no accounts — your data never leaves your device.

Built with Angular 21 (standalone, zoneless, signals) and Angular Material.

## Tools

| Tool | Description |
| --- | --- |
| **JSON Formatter** | Format, validate and minify JSON. |
| **JWT Decoder** | Decode and inspect JWT headers, payloads and claims. |
| **Base64 Converter** | Encode/decode text or files to and from Base64, with live image/PDF preview when decoding. |
| **Image Compressor** | Shrink PNG and JPEG images to JPEG or WebP. |
| **Markdown Editor** | Write Markdown with a live, side-by-side preview. |
| **PDF Merge** | Combine several PDFs into a single document, with a reorderable queue. |

Everything is processed client-side — file tools use the `FileReader`, Canvas and
`pdf-lib` APIs directly in the browser.

## Development

Install dependencies and start the dev server:

```bash
npm install
npm start
```

Then open `http://localhost:4200/`. The app reloads automatically as you edit
source files.

## Building

Create a production build:

```bash
npm run build
```

The optimized output is written to `dist/yydevtools/browser`.

## Deployment (Cloudflare Pages)

The app is a static single-page application, deployed to Cloudflare Pages.

- **Build command:** `npm run build`
- **Build output directory:** `dist/yydevtools/browser`

A [`public/_redirects`](public/_redirects) file provides the SPA fallback so that
deep links (e.g. `/tools/pdf-merge`) resolve to `index.html`. It is copied to the
build output automatically.

To deploy manually with the Wrangler CLI:

```bash
npm run build
npx wrangler pages deploy dist/yydevtools/browser --project-name=yydevtools
```

## Tech stack

- [Angular 21](https://angular.dev/) — standalone components, zoneless change
  detection, signals and native control flow
- [Angular Material](https://material.angular.dev/)
- [pdf-lib](https://pdf-lib.js.org/) for client-side PDF manipulation
