# YYDevTools — progress & roadmap

Living notes on tool optimizations and what to build next. Everything here keeps
the app's core principle: **work runs in the browser, nothing is uploaded** unless
a task genuinely cannot be done client-side (only the three Fly-hosted PDF ops).

---

## Done — optimizations (this pass)

### 1. JSON to Types → five languages

`src/app/tools/json-to-types/`

- Added **Python (dataclasses)**, **Go (structs)** and **Zod** emitters alongside
  the existing TypeScript and C# output. One tool now covers five targets.
- The three inference passes (`infer` → `merge` → `collect`) were already
  language-agnostic; only the emit step is new per language.
- Added `dependenciesFirst()` so Python and Zod (which cannot reference a type
  declared later) emit their nested types before the types that use them.
- Go output aligns columns like `gofmt`; optional fields become
  `*T `json:"x,omitempty"``. Python orders required fields before defaulted
(`Optional[...] = None`) ones and sanitises non-identifier / keyword keys.
- Zod emits `const XSchema = z.object({...})` plus a `z.infer` type alias.
- Tests: `type-generator.spec.ts` (7 cases). Catalog description, route SEO,
  header copy and language toggle all updated.

### 2. JWT Decoder → signature verification

`src/app/tools/jwt-decoder/`

- New pure module `jwt-verify.ts` verifies the signature with WebCrypto — no
  library, no network. Supports **HS256/384/512** (shared secret),
  **RS/PS256/384/512** and **ES256/384/512** (PEM public key).
- The component runs verification in an `effect()` that re-checks whenever the
  token or key changes, with a request-id guard against stale async results.
  Result states: verified / does-not-match / unsupported-alg / error, plus idle
  when no key is entered.
- Tests: `jwt-verify.spec.ts` (5 cases, real HMAC round-trip). SEO + description
  updated.

### 3. Hash Generator → MD5, CRC32 and keyed HMAC

`src/app/tools/hash-generator/`

- New pure module `checksums.ts` implements **MD5** (RFC 1321) and **CRC32**
  (IEEE 802.3) — the two common checksums WebCrypto doesn't provide.
- Plain mode now emits CRC32 + MD5 + SHA-1/256/384/512. Entering an optional
  **HMAC key** switches the output to keyed HMAC-SHA digests (via WebCrypto
  `sign`). The last hashed bytes are retained so toggling the key re-hashes a
  picked file without re-reading it.
- Tests: `checksums.spec.ts` (11 cases against published vectors, incl. a
  multi-block MD5). Note text, SEO + description updated.

### 4. Hash Generator → off the main thread

`src/app/tools/hash-generator/`

- MD5 and CRC32 are pure JS and the SHA/HMAC loop walks the whole input, so a
  large file (up to the 250 MB cap) used to stall the UI. The digest work now
  runs in a worker via the existing `WorkerProxy<T>`.
- New `hash-codec.ts` holds the `hashApi` object (`digest(data, key)`, keyed
  when `key` is set) — the single source of truth both the worker
  (`hash.worker.ts`, `expose`) and the inline fallback (`hash-worker.client.ts`,
  for prerender / no-worker environments) run, so the two paths cannot drift.
  Mirrors the base64 stack exactly.
- Input is cloned into the worker, not transferred, so the component keeps its
  `lastData` copy to re-hash under a toggled HMAC key without re-reading the
  file. Component now `implements OnDestroy` and terminates the worker.

**Validation:** `tsc -p tsconfig.app.json` clean · `ng build --configuration
production` builds and prerenders all 20 routes (hash worker chunk emitted) ·
`vitest run` = 77 passed.

---

## Done — six new client-side tools (this pass)

All six of the section-B candidates shipped. Each is a `tools.data.ts` entry
(all `Developer` category) + a route in `app.routes.ts` carrying a unique SEO
`description` + a component under `src/app/tools/<slug>/`, mirroring the existing
tools. Pure logic sits in its own module with a `*.spec.ts` beside it wherever
the work isn't just a thin library call.

### 1. Text Diff — `tools/text-diff`

- `diff.ts`: line diff via a memoised longest-common-subsequence table
  (O(n·m) — fine for two revisions of a file), returning a flat row list plus
  add/remove/unchanged counts. Options to ignore case and whitespace; CRLF and a
  trailing newline are normalised.
- Component renders the one row list two ways — a **split** view (removals zipped
  with the additions that follow) and a **unified** view — with per-side line
  numbers, a swap and an identical-inputs short-circuit. Tests: `diff.spec.ts`
  (9 cases).

### 2. Regex Tester — `tools/regex-tester`

- `regex-match.ts`: safe `compile()` (empty pattern = idle, not an error) and a
  `run()` that mirrors `String.match` — first match without `g`, all matches
  with it — guarding the zero-width-match infinite loop and capping at 10k
  matches. Named capture groups are labelled by name.
- Component has flag chips (g/i/m/s/u/y), live match highlighting via `<mark>`
  segments, and a per-match capture-group breakdown. Tests: `regex-match.spec.ts`
  (10 cases).

### 3. Cron Explainer — `tools/cron-explainer`

- `cron-schedule.ts`: one `explainCron()` over **cronstrue** (plain-English
  description) + **cron-parser** (next N runs). If one library reads the
  expression and the other trips, it shows what it has; only a total failure is
  an error. Tests: `cron-schedule.spec.ts` (6 cases).
- Component: example presets, a Local/UTC zone toggle (runs formatted in the
  chosen zone with `Intl.DateTimeFormat`), and a refresh to re-pin "next runs"
  to the current instant.

### 4. QR Code Generator — `tools/qr-generator`

- Uses **qrcode** (its `browser` field maps to the DOM renderer and stubs `fs`).
  Rendering runs in an `effect()` guarded to the browser (needs a canvas) with a
  request-id guard against stale async results.
- Text/URL input, error-correction level (L/M/Q/H), size, quiet margin and
  fore/background colours; downloads as PNG (data URL) or SVG (`toString`), named
  from a slug of the content.

### 5. Case Converter — `tools/case-converter`

- `case.ts`: the whole job is `words()` — split across camelCase humps, acronym
  runs (`HTTPServer` → `http server`), separators and letter/number seams — then
  every case is a trivial join. Covers camel/Pascal/snake/CONSTANT/kebab/Title/
  sentence/lower/upper and a URL slug. Tests: `case.spec.ts` (all ten cases +
  `words` edge cases).
- Component shows every conversion at once, each with a copy button.

### 6. SQL Formatter — `tools/sql-formatter`

- Uses **sql-formatter**. A curated 11-dialect subset (the ones people search
  for), keyword case (UPPER/lower/preserve), indent width and a tabs toggle.
  Formats reactively in a `computed`, with copy.

`qrcode`, `cron-parser`, `cronstrue` and `nearley` (via sql-formatter) are
CommonJS, so they're added to `allowedCommonJsDependencies` in `angular.json` to
keep the build warning-free.

**Validation:** `tsc -p tsconfig.app.json` clean · `ng build --configuration
production` builds warning-free and prerenders all **26** routes · `npm run
build` writes a 25-URL sitemap · `vitest run` = **118 passed**, 19 skipped.

---

## Done — section C deepenings (this pass)

### 1. JSON to Types → ten languages

`src/app/tools/json-to-types/`

- Added five emitters to `type-generator.ts`: **Rust** (serde structs, snake_case
  fields with `#[serde(rename)]`, `Option<T>` + `skip_serializing_if` for
  absent-in-some-samples keys, `r#` raw idents for keywords), **Kotlin** (data
  classes, nullable optionals defaulting to `null`, back-tick escaping),
  **Java** (records, primitives boxed where they may be null, `List` import),
  **JSON Schema** (draft 2020-12 with `$defs`/`$ref`/`required`, nullable
  widening vs `anyOf`) and **Pydantic v2** (`BaseModel`, `from __future__ import
  annotations`, `Field(alias=…)` only when a key needs sanitising).
- The three inference passes are untouched; only the emit step is new per
  language, and Pydantic reuses `dependenciesFirst()`. Tests: `type-generator.spec.ts`
  now 15 cases. Toggle, header copy, catalog + SEO updated.

### 2. JSON Formatter → YAML both ways + JSONPath

`src/app/tools/json-formatter/`

- Added **To YAML** and **YAML → JSON** (the `yaml` package) and a **JSONPath**
  query field (`jsonpath-plus`). YAML indentation follows the indent toggle
  (tab falls back to two spaces) and honours "sort keys"; a query parses the
  input as JSON and prints the matched nodes as pretty JSON. Renderer errors now
  surface through the same snackbar path as parse errors.
- `yaml` is added to `allowedCommonJsDependencies`; `jsonpath-plus` is ESM.

### 3. Color Converter → OKLCH/LAB + palette

`src/app/tools/color-converter/`

- Extracted the colour maths into a pure, tested `color.ts`. Added **OKLCH** and
  **CIELAB (D65)** conversion + parsing (`oklch()`/`oklab()`/`lab()`/`lch()`
  inputs, plus OKLCH/LAB output rows), on top of the existing HEX/RGB/HSL.
- New **palette**: a ten-step tint/shade ramp whose lightness is set per step in
  OKLCH (so it reads as one family, not a naïve RGB lighten), and a set of
  **harmonies** (complementary, ±30° analogous, ±120° triadic) by rotating the
  OKLCH hue. Each swatch is clickable to load it as the foreground. Tests:
  `color.spec.ts` (15 cases, incl. round-trips and reference values). The WCAG
  luminance keeps its own `0.03928` linearizer; the colour spaces use the sRGB
  `0.04045` one.

### 4. New tool — Code Formatter (`tools/code-formatter`)

- Prettier standalone formats **HTML, CSS, SCSS, LESS, JavaScript, TypeScript,
  JSON, Markdown, YAML, GraphQL and XML**. The engine and its per-language
  plugins (~1 MB) are `import()`-ed on first format, and only the plugins the
  chosen language needs are fetched — each emits its own lazy chunk. Options:
  indent width, tabs, and (for the JS family) semicolons and quote style.
  XML uses `@prettier/plugin-xml`, whose CJS transitive `@xml-tools/parser` is
  added to `allowedCommonJsDependencies`.
- New `tools.data.ts` entry + route with unique SEO, mirroring the SQL formatter.

**Validation:** `tsc -p tsconfig.app.json` clean · `ng build --configuration
production` builds **warning-free** and prerenders all **27** routes (Prettier
plugin chunks emitted) · `npm run build` writes a **26**-URL sitemap · `vitest
run` = **141 passed**, 19 skipped (needs Node ≥ 20 — the JWT verifier's tests
use `crypto.subtle`, which the Node 18 shell here does not provide).

---

## Done — section D cross-cutting polish (this pass)

### 1. Shared copy-to-clipboard affordance

`src/app/core/clipboard.service.ts`

- One root `ClipboardService.copy(text, { label?, message?, errorMessage? })` now
  owns the write, the confirmation snackbar and the failure case. Empty input is
  a no-op; a blocked or over-full clipboard shows a dismissable error instead of
  throwing — behaviour only Base64 used to have, now everywhere.
- All 13 tools that inlined `navigator.clipboard.writeText` + their own snackbar
  were migrated to it (base64, json-formatter, json-to-types, jwt-decoder,
  hash-generator, timestamp-converter, color-converter, case-converter,
  code-formatter, sql-formatter, uuid-generator, markdown-editor). Tools that
  also raise error snackbars (base64, hash-generator, json-formatter) keep their
  `MatSnackBar` for those; the rest dropped the dependency entirely.

### 2. Global ⌘K / Ctrl-K command palette

`src/app/shared/command-palette/`

- A quick-jump over the whole catalog, mounted once in the app shell so the
  shortcut works from every page (superseding Home's old local Ctrl-K, which only
  focused its on-page search — that handler was removed). Escape or a backdrop
  click closes; focus is captured on open and restored on close, and background
  scroll is locked while open.
- Empty query shows **Favourites** then **Recently used** shortcuts above **All
  tools**; typing collapses to a single ranked list (name-prefix > name >
  description > category). Navigation is the ARIA combobox + listbox pattern:
  DOM focus stays on the input and the active row is tracked with
  `aria-activedescendant`, so ↑/↓/Home/End/Enter drive a highlight the input
  owns. The overlay only exists in the DOM while open, so it never appears in the
  prerendered HTML.
- The ranking + grouping is a pure, tested module (`command-palette.search.ts`),
  kept out of the component. Tests: `command-palette.search.spec.ts` (13 cases).

### 3. Recently-used tools

`src/app/core/recent-tools.service.ts`

- New localStorage-backed service mirroring `FavoritesService` (SSR-safe: starts
  empty, reads storage in `afterNextRender`, swallows storage failures). Keeps
  the six most-recent tool slugs, newest first. The app shell records a visit on
  every `NavigationEnd` that lands on a known `tools/<slug>` route, so palette
  jumps and card clicks alike feed it.

**Validation:** `tsc -p tsconfig.app.json` clean · `ng build --configuration
production` builds **warning-free** and prerenders all **27** routes · `vitest
run` = **154 passed**, 19 skipped.

---

## Done — section E: editor, batching and the image/QR deepenings (this pass)

Four themes, chosen as the highest impact per unit of work: a real code editor
everywhere text is typed, batch processing wherever a tool only took one file, a
much deeper Image Compressor, and QR payloads beyond plain text.

### 1. Shared CodeMirror 6 editor — `src/app/shared/code-editor/`

- `<app-code-editor>` replaces the `<textarea>` in **JSON Formatter, SQL
  Formatter, Code Formatter, Regex Tester, Text Diff and Markdown Editor**, and
  renders the read-only result panes of the three formatters. Line numbers,
  syntax highlighting, bracket matching, code folding, undo history and Ctrl-F
  search, from one component.
- **It degrades to a textarea, which is the point.** Every tool page is
  prerendered and the prerender has no DOM to mount into, so the textarea *is*
  the server-rendered markup; CodeMirror replaces it in `afterNextRender`, and
  if that chunk fails to load the textarea simply stays. Both share the same
  `value` model, so callers cannot tell which is live. Focus is carried across
  the swap.
- Everything is lazily imported (`code-editor.engine.ts`), and each language is
  its own dynamic import — opening the SQL formatter fetches the SQL grammar and
  not the Markdown one. **The initial bundle is unchanged: 353.7 kB.**
- **Tab is deliberately not bound to indent.** CodeMirror's own docs warn that
  doing so traps keyboard users inside the editor; the default (Tab moves focus)
  is the WCAG-conformant behaviour and is worth more than tab-to-indent.
- Theming is entirely custom-property driven, in two layers. Colours come from
  new `--cm-*` design tokens in `styles.css`, so a light/dark switch re-paints
  the editor with **no JavaScript at all** — verified in the browser. Every one
  of the nine syntax colours was checked to ≥ 4.5:1 against `--surface` in its
  own theme (lowest: 4.83 light, 5.82 dark). Geometry uses a second set
  (`--cme-*`) set by the component on its host, which is what lets one shared
  stylesheet reshape per instance — Angular's emulated encapsulation tags only
  the elements it renders, so a scoped rule can never reach CodeMirror's runtime
  DOM, but custom properties inherit into it regardless.

### 2. Batch processing and a shared download layer

- `src/app/core/download.ts` — `downloadBlob/Bytes/Text` and `fileStem`, replacing
  the same six lines copied into seven tools. The object URL is now revoked
  **10 s after** the click rather than on the next line: revoking immediately is
  a race the browser can lose on a large archive.
- `src/app/core/zip.ts` — `buildZip`/`downloadZip` over **fflate**, which
  deflates in its own worker pool. Members whose names collide are suffixed
  ` (2)`, ` (3)` the way a file manager does — two archive members with one name
  is not an error zip readers report, several just silently keep the last.
  Already-compressed formats (JPEG, PNG, PDF…) are stored rather than deflated.
  Tests: `zip.spec.ts` (11 cases, unpacking real archives).
- **PDF Split** per-page mode now emits one zip instead of N downloads. It used
  to *warn* that "your browser will likely block some of them"; the warning is
  gone because the problem is.
- **Hash Generator** takes a batch of files, with a per-file digest row and an
  algorithm picker. Adds **checksum verification** — paste a digest and it
  reports which file and which algorithm matched, so you need not know in
  advance whether you were handed an MD5 or a SHA-256 — and exports the batch in
  `sha256sum` format (`<hex>␠␠<name>`) so it can be checked elsewhere with
  `sha256sum -c`.

### 3. Image Compressor — batch, target size, HEIC, Exif, comparison

`src/app/tools/image-compressor/`

- **Batch**: up to 30 images, one queue, one zip. The worker's decode cache is a
  *single slot* rather than a map — one open image is the interactive case
  (dragging the quality slider re-encodes without re-decoding), while a batch
  would otherwise hold every decoded bitmap at over 100 MB of RGBA each.
- **Target size**: give a size in KB and a binary search over quality finds the
  best fit in ~7 encodes instead of 100, reusing one rasterisation. It keeps the
  best result seen rather than recomputing at the end, because size is not
  perfectly monotonic in quality. If nothing fits it says so instead of
  pretending.
- **HEIC** input via `heic-to`, imported only when `createImageBitmap` has
  already failed — the 3 MB libheif chunk is never fetched by anyone compressing
  a JPEG. Since no browser renders HEIC in an `<img>`, the worker also renders a
  JPEG preview so the format is not left without a "before" image.
- **Exif**: the metadata panel shows what the original carries and flags a GPS
  location. Output is stripped by default. "Keep Exif" is *real* rather than
  cosmetic — mozjpeg emits a bare image, so the original APP1 segment is spliced
  back into the encoded JPEG. WebP stores metadata in RIFF chunks instead, and
  the UI says so rather than pretending. Tests: `exif.spec.ts` (16 cases,
  including that a `FF E1` byte pair inside scan data is not mistaken for a
  marker).
- **Before/after slider** clipping the compressed image over the original,
  driven by a real `<input type="range">` so it is keyboard-operable.
- Fixed along the way: the re-encode `effect` tracked `items()`, which the run
  itself writes results into — so every run superseded itself and nothing ever
  finished. It now watches a `queueRevision` counter bumped only when the file
  *set* changes.

### 4. QR Code Generator — nine payload types

`src/app/tools/qr-generator/qr-payload.ts`

- Link, Text, **Wi-Fi**, **Contact (vCard 3.0)**, Email, SMS, Phone, Location
  and **Calendar event**. The catalog had advertised Wi-Fi for some time while
  the tool only accepted free text; it now does what it said.
- The escaping is the substance: a semicolon in an SSID or a comma in a contact
  name silently truncates the payload, which is how hand-made codes fail. Wi-Fi
  escapes `\ ; , : "`; vCard escapes `\ ; ,` and newlines, and uses CRLF as the
  spec requires. `mailto:` re-encodes `+` as `%20` because mail clients show a
  form-encoded space verbatim. A bracketed trunk prefix (`+44 (0)20 …`) is
  dropped only when the number is international, where it must be, and kept when
  domestic, where those digits are the area code.
- Tests: `qr-payload.spec.ts` (29 cases).

### 5. Corrections to existing copy

- The Image Compressor's page content still told readers **"Yes, this tool needs
  a server… the file is sent over HTTPS"**. That stopped being true when
  compression moved into the browser; the FAQ, intro and feature list have been
  rewritten. This mattered beyond tidiness — the same strings feed the
  FAQ/JSON-LD structured data.
- Catalog descriptions, route SEO and the long-form content for image-compressor,
  qr-generator, hash-generator and pdf-split now match what the tools do.

**Validation:** `tsc -p tsconfig.app.json` clean · `npm run build` builds
**warning-free**, prerenders all **28** routes and writes a **27**-URL sitemap ·
`vitest run` = **210 passed**, 19 skipped (the skips are a pre-existing `skipIf`
for the native `Uint8Array.toBase64` APIs this Node lacks). Verified in Chrome
against the production build: editor mount + highlighting + light/dark repaint,
batch compression with a real Exif JPEG (APP1 confirmed present at offset 2 of
the *output*), target-size search (200 KB → 189 KB at q93), zip contents and
name de-duplication, and hash digests checked against independently computed
WebCrypto values.

---

## Done — section F: backend hardening (this pass)

The three Fly services and the Worker in front of them. Nothing here changes
what the site can do; it changes what happens when things go wrong.

### 1. The OCR timeout was inverted

`services/pdf-ocr/server.mjs`, `worker/services.ts`, `worker/index.ts`

The OCR service allowed a job 240 s while the Worker gave up at 180 s. So on any
long scan the user got a timeout at 180 s and the 2 GB machine kept grinding for
another minute, finishing a document nobody would ever receive — and holding a
concurrency slot the whole time.

Timeouts are now per-route and ordered deliberately: the **service** always
gives up first, so an over-long job is killed at the source. Worker budgets
compress 120 s / OCR 165 s / export 135 s, against service timeouts of 90 s /
150 s / 120 s.

### 2. Hardening, applied to all three live services

- **Input is sniffed before anything heavy runs.** All three shelled out to
  Ghostscript, ocrmypdf or LibreOffice on whatever bytes arrived. A `%PDF-`
  check within the first kilobyte (matching what real readers tolerate) rejects
  garbage in microseconds instead of after 90 s of shared CPU. It matters most
  for convert: LibreOffice will attempt dozens of formats, so without the check
  that endpoint is a general-purpose document parser exposed to anything.
- **`timingSafeEqual` for the shared secret**, replacing `!==` and the comment
  that called it "constant-ish".
- **An in-process concurrency gate** (3 / 2 / 2), answering `503` +
  `Retry-After` when full. Fly's `hard_limit` shapes traffic at the proxy but
  cannot see how heavy a request is; this is what keeps the OOM killer from
  choosing which request dies.
- **`/health` now runs the tool** (`gs --version` and friends) instead of only
  proving Node is up. A machine whose image lost its one dependency used to
  report healthy and 502 every request; it now fails its Fly health check. The
  result is cached on success and retried on failure. Verified locally: with no
  `gs` installed the endpoint correctly returns 503 `NOT_READY`.
- **One JSON log line per request** — event, parameters, bytes in/out, duration
  — so `fly logs` is enough to see what is happening.

The helper block is repeated in each service rather than shared. Each service is
its own Docker build context, so a shared module could not be `COPY`ed in
without restructuring all three builds; independent deployability is worth more
than removing ~50 duplicated lines.

### 3. PDF Compress no longer returns a bigger file

Ghostscript routinely *grows* an already-optimised PDF — a linear web-optimised
file re-written at `/screen` can come back larger. The tool would hand that back,
so "compress" could produce a worse file. The original now wins, and
`X-Input-Bytes` / `X-Output-Bytes` / `X-Compressed` report which was sent
(passed through by the Worker). Also added `-dAutoRotatePages=/None`, which stops
gs guessing orientation from the text and silently turning landscape pages
sideways, and `-dDetectDuplicateImages=true` for free savings on scans and decks.

### 4. OCR reads sideways scans

`--rotate-pages` is now on, with `tesseract-ocr-osd` added to the Dockerfile —
without that model the flag fails. Scanners produce rotated pages constantly and
Tesseract reads almost nothing off one, so this is often the difference between
a useful text layer and an empty one. `--deskew` is plumbed through as an opt-in
`?deskew=1` (it re-renders the page, so it is not free) but no UI sends it yet.

### 5. Worker resilience

- **One retry on a cold-start connection failure.** The machines scale to zero
  and the wake occasionally loses a race, which surfaced as "the service could
  not be reached" on a service that was fine and now awake. Only
  connection-level failures retry — not timeouts (the budget is already spent)
  and not any HTTP status (the service answered).
- `Retry-After: 60` on 429s, `Cache-Control: no-store` on results.

### 6. Fly concurrency was set above what the VMs survive

OCR allowed 10 concurrent jobs on a 2 GB machine; ten ocrmypdf runs, each
forking a Tesseract per page, exhaust that long before the proxy sheds any load.
Now 3/2 for OCR, 5/3 for compress, 3/2 for convert — Fly starts another machine
rather than overloading one.

### 7. `services/image-compress` is orphaned

Nothing calls it: image compression moved into the browser, `worker/index.ts`
has a comment explaining the route was removed on purpose, and there is no
`IMAGE_COMPRESS_URL` or secret in `wrangler.jsonc`. If the Fly app is still
deployed it is a public HTTPS endpoint wrapping an image decoder with no user
behind it. The directory and README are now marked **RETIRED** with the
`fly apps destroy` command; the files are kept so git can recover them, but the
app should be destroyed. **This is the one item that needs a decision rather
than a deploy.**

**Validation:** `tsc` clean for both `tsconfig.app.json` and
`worker/tsconfig.json` · `node --check` clean on all four services ·
`wrangler deploy --dry-run` bundles the Worker with every binding intact ·
`vitest run` = 210 passed · each service booted locally and probed for health,
missing auth, wrong secret, non-PDF body, empty body, bad parameter and unknown
route — all seven behave correctly, and `/health` correctly reports 503 with the
tool absent.

---

## Done — section G: shareable and restorable tool state (this pass)

`src/app/core/tool-state.ts`, `src/app/shared/share-link/`

Two features from one mechanism, both shaped by the same constraint: this is a
site whose promise is that what you paste stays on your device.

### 1. Session restore

A reload used to wipe everything. State is now mirrored into **`sessionStorage`,
deliberately not `localStorage`** — session storage is scoped to the one tab and
is gone when that tab closes, so nothing accumulates on disk for the next person
to use the machine. It solves the accidental refresh, which is the actual
complaint, without becoming a place where a stranger's JSON quietly lives.

### 2. Share links, in the fragment

The state is encoded into the URL's **hash fragment**, which is the entire
reason this is safe to offer: a fragment is never transmitted. Not in the
request line, not in Cloudflare's logs, not in a `Referer` header.

**This was verified rather than assumed.** A local server logging raw request
lines received exactly `GET /tools/regex-tester` for a navigation to a URL
carrying 162 characters of encoded state.

Sharing is never automatic: the address bar is not rewritten as you type, so
state cannot leak into browser history or a screen-share. A link exists only
when the button that makes one is pressed.

Encoding is JSON → deflate (fflate, already a dependency) → base64url. The
compression is what makes it practical — the states worth sharing are text, and
text deflates to a fraction of its size. Past **4000 encoded characters** the
button reports that the content is too large rather than handing over a URL that
will arrive truncated from a chat client; session restore has no such limit.

A link is untrusted input, so a restore applies **only the keys the tool itself
declared** (`pickKeys`) and each value is validated against what the tool
actually offers — a hand-edited fragment cannot inject an unknown dialect,
language or view mode.

### 3. Which tools, and why not the others

- **Share + restore (12):** regex-tester, cron-explainer, color-converter,
  case-converter, timestamp-converter, sql-formatter, code-formatter,
  json-formatter, json-to-types, text-diff, markdown-editor, uuid-generator.
  UUID shares only its *settings* — pinning someone else's random identifiers
  would be worse than useless.
- **Restore only (1):** qr-generator. Its fields routinely hold a Wi-Fi password
  or a home address, and a URL is the wrong container for those — it survives in
  chat history long after the code has been scanned. There is also nothing to
  gain: what you share from that tool is the PNG, not a link to a generator.
- **Excluded entirely (3):** jwt-decoder (the token is a credential),
  hash-generator (the HMAC key is a secret) and base64-converter (inputs are
  routinely megabytes, and it has its own bulk-text handling). Neither shared
  nor stored.

Tests: `tool-state.spec.ts` (14 cases — round-trips, unicode, non-string types,
fragment-safe output, compression ratio, and the failure paths: cyclic input,
corrupted payload, truncated payload, and a payload that decodes to a non-object).

**Validation:** `tsc` clean (app + worker) · `npm run build` warning-free,
28 routes, 27-URL sitemap, **initial bundle unchanged at 353.73 kB** ·
`vitest run` = **224 passed**, 19 skipped. Verified in Chrome against the
production build: typing populates storage; reload restores with a clean URL; a
copied link restores fully in a fresh load with storage cleared; the server
receives no fragment; 54,000 characters correctly disables the button with an
explanation while still surviving a reload intact; and QR restores its Wi-Fi
state while exposing no share button at all.

---

## Done — section H: the PDF Organizer (this pass)

`src/app/tools/pdf-organizer/` — the 24th tool, and the one that makes the other
PDF tools make sense together.

Merge joins whole files end to end; Split pulls out page ranges named in
advance. Both assume you already know what you want. The Organizer is the case
where you have to *see* the pages first: it lays every page out as a thumbnail
and lets you drag them into order, rotate a sideways scan, delete the blank
sheet the feeder picked up, drop a second PDF in, and save the result as one
file.

### Rendering without a second PDF engine

pdf.js is already vendored in `public/pdfjs` for the PDF Viewer, which embeds
its full *viewer* in an iframe. `pdf-render.ts` reaches for the library
underneath it instead, so page rasterisation costs no new dependency and no
second copy of a PDF engine in the bundle.

The import specifier is assembled at runtime on purpose: a literal would make
the bundler try to resolve `/pdfjs/build/pdf.mjs` at build time, where it is not
a module path but a URL that only exists once the site is served. Keeping it in
a variable leaves the import to the browser — verified by the build staying
warning-free and the initial bundle moving only 2 kB.

Thumbnails are drawn one at a time rather than in parallel: rasterising is the
expensive part, and a whole document at once would fight the main thread for
exactly the frames needed to scroll and drag.

### The page model is separate and tested

`organise.ts` holds move / rotate / delete / insert-blank / reverse as pure
functions over a plain array. Getting "move page 12 before page 3" wrong is
invisible until someone opens the export, so it is pinned down with 22 tests —
including that a drop target is interpreted against the list *after* the page is
lifted out, which is what a drag gesture means and what makes "drag page 1 to
the end" put it last rather than one short of last.

An inserted blank takes the size of the page it follows, so a blank dropped into
a run of landscape scans is landscape rather than an A4 surprise.

### Details worth recording

- **Rotation is added, not replaced.** A page that already carried `/Rotate 90`
  and is turned once more ends up at 180. Verified by reading the exported file
  back: the page reports `rotate: 180`.
- **Rotation is stored, not baked.** It is written as a page property exactly as
  a scanner would record it, so text stays selectable and no image is resampled.
- **Export copies per source document, not per page.** pdf-lib re-walks a
  source's object graph on every `copyPages` call, so interleaving two documents
  page by page would do that once per page; instead each document's pages are
  copied in one call and then placed in the arranged order.
- **Dragging is never the only way.** Every card carries earlier/later arrows in
  the normal tab order. CDK's drag-drop is mouse and touch only, and a reorder
  tool that cannot be operated from a keyboard is not finished.
- Limits: 300 pages across 10 files, 100 MB each. The page cap exists because
  every page is held as a rendered preview; Split's ranges remain the right tool
  for a thousand-page scan.

Merge and Split now cross-link to it, and it carries its own long-form content
and FAQ (which is where the "organize" spelling lives, since the tool name
follows the site's existing US-spelling convention while the prose stays
British).

**Validation:** `tsc` clean (app + worker) · `npm run build` warning-free, **29
routes**, 28-URL sitemap, initial bundle 355.70 kB · `vitest run` = **246
passed**, 19 skipped. Verified in Chrome against the production build by driving
the real UI and then **reading the exported PDF back with pdf.js**: a
three-page document reordered, rotated, one page deleted and a blank appended
produced exactly `A2(180°), A1, blank`; adding a second document and moving one
of its pages to the front produced exactly `B1, A2(180°), A1, blank, B2`, which
is what the grid showed.

Note for future debugging: pdf.js drives rendering from `requestAnimationFrame`,
so thumbnails do not progress while the tab is hidden — this looks exactly like
a hang under automation, and is not one.

---

## Done — section I: OCR without uploading (this pass)

`src/app/tools/pdf-ocr/` — Tesseract compiled to WebAssembly, reading pages in
the browser and writing the recognised words back as an invisible text layer.

This does not replace the hosted service and is not meant to. Recognition is
slow and the engine is a several-megabyte download, so it is the better answer
for a short English document and the worse one for a long multilingual scan.
What it buys, for the documents it suits, is that a payslip or a medical letter
is never uploaded at all — and every one of those is a Fly invocation that no
longer happens.

### Eligibility, and saying no honestly

In-browser runs when the language is English and the document is 20 pages or
fewer; otherwise the hosted service is selected and the reason is shown next to
the disabled control. One more rule is enforced at run time: pages are
rasterised **without** their `/Rotate`, which is what keeps the coordinate
mapping a single division rather than a matrix to invert — so a rotated page
would reach Tesseract sideways and read as nothing. Rather than return a
confidently empty text layer, the local path declines those specifically
(`LocalOcrUnsupported`) and switches to the hosted service, which straightens
pages first.

### Every asset is served from this origin

tesseract.js defaults to fetching its worker, engine and language data from a
public CDN. That would quietly turn a tool promising to upload nothing into one
that announces to a third party that you are OCR-ing something. The worker, the
three LSTM core variants and the English model are copied out of `node_modules`
at build time (`assets` in angular.json) — 2.95 MB for the model
(`4.0.0_best_int`, accurate and a fifth the size of the standard one) and one
~3.9 MB core, of which the browser fetches whichever its SIMD support calls for.

### The text layer

`ocr-layer.ts` is the pure, tested part, because it is where the result is won
or lost. Tesseract works in image pixels with the origin top-left; PDF works in
points with the origin bottom-left. Getting the flip wrong yields a document
that looks perfect and selects upside down.

Words are drawn with `TextRenderingMode.Invisible` — mode 3 draws nothing at
all, where white text would still cover the page and transparent text would sit
in the rendering pipeline for no reason — and the text matrix carries a
horizontal squeeze so each word spans exactly the box it was read from, which is
what makes dragging a selection highlight the words being pointed at.

Two details worth keeping: words below 55% confidence are dropped, because a
wrong word makes a document findable under something it does not say; and the
character filtering is written against **code points rather than a regex**,
after a character class containing the C1 control range degraded on its way
through the editor into a literal hyphen — which would have silently stripped
the hyphen out of every hyphenated word in the layer.

### Two bugs found on the way

- **`PdfDocumentRenderer.close()` never worked.** pdf.js 6 has no `destroy()` on
  the document proxy; teardown belongs to the loading task. It threw from a
  `finally`, which *replaced* the real error and made every failure look like
  something else. The same bug was sitting unexercised in the PDF Organizer.
- **The tesseract import needed the opposite treatment from pdf.js.** pdf.js is
  served out of `public/` as a URL, so its specifier is built at runtime to keep
  the bundler away from it. tesseract.js is a package path only the bundler can
  resolve, so it must be a literal — leave it in a variable and the browser is
  handed a bare specifier it cannot resolve. The two sit a few files apart and
  want exactly opposite things.

Tests: `ocr-layer.spec.ts` (22 cases — axis flip at top, middle and bottom of a
page, scale handling, confidence and degenerate-box filtering, punctuation
folding, control stripping, and a guard that hyphens survive).

**Validation:** `tsc` clean (app + worker) · `npm run build` warning-free, 29
routes, 28-URL sitemap · `vitest run` = **268 passed**, 19 skipped. Verified in
Chrome against the production build, end to end:

- A page carrying two known sentences produced **exactly 16 words** — the true
  word count — recognised without error.
- Reading the output back, both sentences appear **twice**: once from the
  original page, once from the OCR layer, positioned on the same baselines and
  at the right horizontal offsets (`quick` at x=105 on the line starting at
  x=60; `47281` at x=217 on its line).
- Rendering the source and the output and comparing pixel by pixel: **0 of
  1,126,596 pixels differ.** The layer really is invisible and the page really
  is untouched.

---

## Done — section J: the shell — icons, theme, drop targets and the JWT Editor (this pass)

Four shell-level changes and one new tool. Nothing here is a feature the
homepage advertises; all of it is what the site feels like to use.

### 1. The icon webfont is gone

`src/app/core/icons.ts`, `src/index.html`, `src/styles.css`

Every icon was a `<span class="material-icons-outlined">name</span>` resolved by
two render-blocking stylesheets from `fonts.googleapis.com`. Both `<link>`s are
now deleted and the **198 icons the app actually uses** ship as inline SVG via
`@ng-icons`, registered once at the root with `provideIcons(APP_ICONS)`.

Three things this buys, in order of how much they matter:

- **No third-party request on first paint.** A site whose entire argument is
  that your data does not leave the browser was announcing every page view to
  Google before it rendered. That was the real defect.
- **No flash of icon names.** Until the font arrived, every icon rendered as its
  literal text — `content_copy`, `dark_mode` — which is what the appbar looked
  like on a cold cache.
- The set is explicit, so an icon that no longer exists is a **compile error**
  rather than a word rendered where a glyph should be.

The cost is honest: initial bundle **355.70 → 498.46 kB raw (132.73 kB
transferred)**. That buys back two blocking cross-origin round trips and the
font files behind them, so the first paint is earlier despite the larger bundle
— but it is the number to watch if the icon set keeps growing.

One base rule in `styles.css` sets `ng-icon` to 24px in an inline-flex box with
`color: currentColor`, reproducing what `mat-icon` did. Sizing is configured in
`em` (`provideNgIconsConfig({ size: '1em' })`) so the existing per-icon rules —
which all work by setting `font-size` — kept working without being touched.

### 2. Theme: light / dark / **system**

`src/app/core/theme.service.ts`, `src/app/app.html`

The toggle flipped between two states, so a visitor who follows their OS had no
way back to it once they touched the button — and the site then ignored a
system change until localStorage was cleared. It is now a CDK menu with three
options, and `system` is the default for anyone who has never chosen.

The service keeps **two signals rather than one**: `preference` is what was
picked and what the menu ticks, `theme` is what is painted. They differ only
while the preference is `system`, where a `matchMedia` listener keeps `theme`
following the OS live — without it a visitor on `system` would have to reload to
see a change made outside the page.

The inline pre-paint script in `index.html` was updated in step: anything not an
explicit `light`/`dark` — the stored `system` and a first visit alike — follows
the media query, so there is still no flash of the wrong colours.

### 3. Route transitions and scroll position

`src/app/app.config.ts`, `src/styles.css`

- `withViewTransitions({ skipInitialTransition: true })` plus a 90 ms out / 180 ms
  in fade. The animation lives **inside** a `prefers-reduced-motion:
  no-preference` block, so reduced motion gets the plain instant swap rather
  than a shortened one that still moves.
- `withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })`. The router's
  default is to keep the previous page's offset, so opening a tool from halfway
  down the home directory dropped you into the middle of the tool page.
- **`anchorScrolling` is deliberately left off.** The only fragments this app
  puts in a URL are share-link payloads (`#s=…`, section G); with anchor
  scrolling on, the router would hunt for an element named after the payload and
  skip the scroll-to-top fallback when it found none.

### 4. One drop target, shared by ten tools

`src/app/shared/dropzone/`

`<app-dropzone>` replaces the hand-rolled drag handling in **base64,
hash-generator, image-compressor and the seven PDF tools**, and deletes the
copy that lived in `core/hosted-pdf-tool.ts`. Callers project the icon, title
and hint, so the copy stays with the tool that owns it.

Three bugs every copy shared, fixed once:

- **`dragleave` fires whenever the pointer crosses onto a child node**, so the
  highlight flickered off while the pointer was still well inside the zone. The
  new one counts enter/leave pairs and only clears at zero.
- `dropEffect` is set to `copy`, so the cursor stops promising a *move*.
- Drags carrying no files are ignored — dragging a text selection across the
  page no longer lights up every drop zone on it.

### 5. New tool — JWT Editor (`tools/jwt-editor`), the 25th

`jwt-sign.ts` is the signing counterpart to the decoder's `jwt-verify.ts`: edit
a token's header and payload and get a **genuinely valid** signature back, via
WebCrypto, with no network and no library. HS256/384/512 from a shared secret;
RS/PS/ES256/384/512 from a PKCS#8 private-key PEM.

It cannot forge anything — a signature requires the signing key, and it re-signs
with the key you supply. What it removes is the habit of pasting a token *and a
private key* into a stranger's website to change one claim.

Two details: ES512 uses curve **P-521**, not P-512, which is the easy way to get
this wrong; and WebCrypto's ECDSA output is already the fixed-size `r‖s`
concatenation JWS wants, so there is no DER to unwrap. Tests: `jwt-sign.spec.ts`
(15 cases). Decoder and editor cross-link.

**Validation:** `tsc -p tsconfig.app.json` clean · `npm run build`
**warning-free**, prerenders **30 routes**, writes a **29**-URL sitemap ·
`vitest run` = **280 passed**, 19 skipped. Not yet driven in Chrome — the theme
menu, the view transitions and the ten migrated drop zones are verified by
build and tests only, so a browser pass over the shell is still owed.

---

## Next — the roadmap (drawn up 2026-08-04)

Written after the first production deploy of sections F–I. Ordered by payoff per
unit of work, not by how interesting each one is to build. Everything below is
grounded in what is actually in the repo today — the file references are the
evidence, and they are worth re-checking before starting, since they will drift.

### Quick wins — small, disproportionate payoff

- [x] **A visible search button in the appbar.** *(done 2026-08-11)* Added a
      `.search-trigger` button beside the theme toggle, on every page via the
      shell. It calls `CommandPalette.openPalette()` (made public for exactly
      this) through a template ref, with `aria-haspopup="dialog"` and
      `aria-keyshortcuts`; ⌘K/Ctrl-K still works unchanged. Shows a "⌘ K"/"Ctrl K"
      hint corrected after hydration, and collapses to an icon square ≤860px.
      Fixed a touch-target bug found while verifying: the label-less icon was
      shrinking to 22px in the crowded flex row (under the WCAG 2.5.8 24px
      minimum), so `.bar-btn` is now `flex-shrink: 0` — both icon buttons hold a
      38px hit area and the nav absorbs the shrink instead. Verified in-browser
      at desktop and phone widths: opens on click and tap, input autofocuses,
      Esc closes.
- [x] **Fix mobile nav overflow.** *(done 2026-08-12)* The five inline `.nav`
      links (~316px, non-wrapping) overflowed the appbar once the search + theme
      buttons claimed the trailing end — visible from ~640px down. Fixed by
      swapping the inline row for a hamburger menu below 640px, reusing the same
      **CdkMenu** overlay pattern that already drives the theme dropdown (added
      `CdkMenuItem` to `App`, a `matMenuOutline` glyph to `core/icons.ts`, and a
      `.nav-trigger` button + `#navMenu` template in `app.html`; panel styled via
      `::ng-deep .nav-menu`, mirroring `.theme-menu`). The inline `.nav` stays in
      the DOM — merely `display:none` under the query — so all five links remain
      in the prerendered HTML for crawlers, and they are also in the footer. The
      menu's "Tools" item carries `routerLinkActive`, and CDK closes it on
      navigation. Verified in-browser: at 375px and 320px the bar and body have
      **zero** horizontal overflow, `.nav` is hidden and the 38×38 hamburger
      shows; the menu opens right-aligned on-screen with all five links, the
      active item is marked, tapping a link navigates and closes the menu; at
      desktop width the inline nav is back and the hamburger is gone.
- [x] **Image ↔ PDF (images to PDF, and PDF to images).** *(done 2026-08-12)*
      The 26th tool, at `tools/image-pdf/`, and the roadmap's top-ranked
      candidate — built almost entirely from primitives already shipped. One tool
      with two modes, so one page ranks for both "JPG to PDF" and "PDF to JPG".
      **Images → PDF:** drop in JPG/PNG/WebP/GIF/BMP/AVIF, drag to reorder, and
      save one PDF (one image per page). JPG and PNG are embedded byte-for-byte
      via pdf-lib's `embedJpg`/`embedPng` (no re-encode, no quality loss);
      everything else — and any progressive JPEG pdf-lib refuses — is drawn to a
      canvas and embedded as a lossless PNG, which also preserves transparency.
      Page size is fit-to-image (1 px → 1 pt), A4 or Letter, with auto/portrait/
      landscape orientation and a margin. **PDF → images:** reuses the existing
      `PdfDocumentRenderer` (the vendored pdf.js the Organizer/Viewer already use)
      to rasterise every page at 96/150/300 DPI as PNG or JPG; one page downloads
      directly, several are bundled into a single `.zip` via `core/zip.ts`. The
      page-placement maths is isolated in a pure, tested `layout.ts`
      (`placeImage`, `dpiScale`) — **10 unit tests** covering fit sizing, aspect-
      preserving centring, auto-orientation and degenerate input. Added
      `matImageOutline` + `matPhotoLibraryOutline` to `core/icons.ts`, a catalog
      entry, a route with dual-keyword SEO, and a full `TOOL_CONTENT` entry (8 FAQ
      items answering "how do I convert JPG to PDF / PDF to JPG"). Verified in a
      real dev server (the pdf.js module worker will not spin up under a bare
      `http-server` — confirmed the shipped Organizer hangs there too, so it is
      the static host, not the tool): images → PDF produced pages sized exactly to
      each image and, on A4-auto, portrait/landscape following each image's shape;
      PDF → images rendered all thumbnails, produced correctly-sized images
      (150 DPI → ×2.083, 300 DPI → ×4.167), named them `…-page-001.png`, zipped
      multi-page output and downloaded a single page directly.
- [x] **Password generator (passwords + passphrases + strength).** *(done 2026-08-12)*
      A 25th tool at `tools/password-generator/`. Generation is delegated to a
      vetted third party rather than hand-rolled: **`secure-random-password`**,
      which draws from `crypto.getRandomValues` and turns bytes into an index by
      **rejection sampling** (no modulo bias). Chosen after rejecting
      `eff-diceware-passphrase` — its dependency chain reaches `sodium-native`, a
      native node-gyp addon that cannot run in a browser. Passphrases use the
      **EFF Large Wordlist** (7,776 words, CC BY 3.0 US), vendored as
      `eff-wordlist.ts` and lazy-imported so the ~88 KB list stays off the initial
      bundle. Strength + crack-time comes from **@zxcvbn-ts**, also dynamically
      imported and cached, with an instant entropy-band fallback while its
      dictionaries download. Two interop traps handled: (1) the module's default
      `Random` export double-wraps under esbuild's CJS→ESM interop, so the
      **named** `Random` class is imported and fed an explicit Web Crypto byte
      source; (2) because every route is prerendered to static HTML and the
      library falls back to Node crypto, generating in a field/constructor would
      **bake one password into the page for every visitor** — generation is
      confined to `afterNextRender`, and the built `index.html` was confirmed to
      contain the SEO copy + FAQ/SoftwareApplication JSON-LD but **no** result
      value. Verified in-browser: 40 default samples all 20 chars and distinct
      with every enabled set present; "no look-alikes" removes `I l 1 | O 0`;
      lowercase-only yields `[a-z]`; deselecting all sets shows the error with a
      blank result; `requireEach` holds even at length 6 with four sets; bulk
      count = 5 yields five distinct outputs; passphrase mode gives 6/6 distinct
      values and crack-time reads "centuries". Registered in `tools.data.ts`,
      routed with SEO title/description, and given a full `TOOL_CONTENT` entry
      (intro, steps, features, 8 FAQ items) that drives both the copy and the
      structured data.
- [x] **Finish the PWA.** *(done 2026-08-11)* Added a hand-written service worker
      (`public/sw.js`) rather than ngsw, which is SPA-oriented and would serve one
      app-shell index.html for every navigation — bypassing the per-route
      prerendered HTML, per-route meta/JSON-LD and real 404s this site is built
      around. Instead: navigations are **network-first** (an online visitor always
      gets the live prerendered page, with a copy kept for offline), same-origin
      static assets are **stale-while-revalidate**, and `/api/*` plus all
      cross-origin requests (the AdSense loader, Google Fonts) are never
      intercepted. A self-contained `public/offline.html` is precached as the
      fallback for routes never visited on the device. Registration lives in
      `core/pwa.ts`, called from `App`, guarded to browser + production, deferred
      to `load`, with `updateViaCache: 'none'` so a redeploy's worker is always
      seen. Because HTML is network-first and the app's assets are content-hashed,
      there is no "stuck on an old version" trap — which matters with AdSense.
      Verified in-browser: SW registers/activates/controls, precaches the offline
      page; with the server stopped a visited page (/about) renders fully from
      cache and an unvisited route falls back to the offline page; back online,
      fresh per-route HTML is fetched and `/api/news` returns 200 untouched.
- [ ] **Share links for the last of the text tools.** 13 of the 24 tools call
      `syncToolState`; `base64`, `hash-generator` and `jwt-decoder` do not.
      Worth a deliberate decision rather than a reflex — the fragment is never
      transmitted (that property is proven in section G), but a *shareable* link
      containing someone's JWT still invites a mistake that the privacy
      guarantee does not actually cover. Reasonable answers include "input only,
      never the token".
- [ ] **CodeMirror for the JSON to Types output.** Six tools use the shared
      editor (`code-formatter`, `json-formatter`, `markdown-editor`,
      `regex-tester`, `sql-formatter`, `text-diff`). `json-to-types` emits
      TypeScript, Rust and Kotlin into a plain box — the one tool whose entire
      output is source code.
- [x] **"Try an example" on empty states.** *(done 2026-08-12)* A shared
      `TryExample` button (`shared/try-example`, `matAutoFixHighOutline` wand,
      `display: contents` like ShareLink so it slots into any `.actions` row)
      now fills eight tools with one click: **json-formatter** (minified order
      payload, formatted immediately), **text-diff** (nginx HTTP→HTTPS config
      pair), **regex-tester** (`^\[(WARN|ERROR)\] (.+)$` over five log lines,
      flags reset to `gm`), **hash-generator** (the pangram — its digests are in
      every hash function's docs, so the output is self-checking),
      **base64** (a UTF-8 sentence with accents and an emoji, the exact thing
      naive `btoa()` chokes on), and retrofits of the three existing "Load
      sample" buttons: **json-to-types**, **jwt-decoder** and **jwt-editor**.
      The JWT decoder's sample was upgraded from a placeholder-signed, expired
      token to one genuinely signed with HS256 (secret `yydevtools-demo-secret`,
      exp 2030) with the secret auto-filled — so the example demonstrates the
      green "Signature verified" state, not just decoding. `matScienceOutline`
      became unused and was dropped from `core/icons.ts`.

      Rolling this out exposed a real bug in `shared/code-editor`: its effects
      were written `effect(() => this.handle?.setValue(this.value()))` — while
      `handle` was still null the optional chain skipped evaluating the
      *argument*, so the effect's first run tracked no signals and never fired
      again. Typing worked (editor→signal), but every programmatic write
      (signal→editor: Try an example, Clear, text-diff's Swap, the result
      pane's language switch) was silently dead once CodeMirror mounted. Fixed
      by reading each signal into a local before the optional call; verified
      Clear now empties the live editor too.
- [x] **Close out the code-editor regression.** *(done 2026-08-13)* Clear was
      click-verified on all five editor-backed tools that write programmatically
      — json-formatter, text-diff, sql-formatter, code-formatter and
      markdown-editor — each emptying the live CodeMirror document and falling
      back to its placeholder. Added `code-editor.spec.ts`, the repo's **first
      component spec**, proven to fail (3 tests) against the old
      `handle?.setValue(value())` form and pass against the fix.

      Two things had to be settled to get there. **The runner:** bare
      `npx vitest run` has no DOM and no initialised `TestBed`, which is why
      every prior spec tested pure functions. `npm test` (Angular's
      `@angular/build:unit-test`) provides both and runs the whole suite, so it
      is now the documented command. It also forbids `vi.mock` on relative
      imports. **The oracle:** mounting the real CodeMirror under jsdom does not
      work — jsdom has no layout, so `Range.getClientRects` is missing (the
      editor throws in its measure pass) and, once stubbed, it still never
      re-renders after a transaction: the document state updates while
      `.cm-content` keeps showing the first render. Asserting on that DOM would
      fail whether or not the component worked. So `CODE_EDITOR_ENGINE`, an
      injection token defaulting to the real `createEditor`, now supplies the
      engine; the spec swaps in a handle that records what it is told. That is
      the exact boundary the bug broke, and it needs no DOM at all.

### New tools, ranked by fit with what already exists

- [x] **1. Images → PDF, and PDF → Images.** *(done 2026-08-12)* The strongest
      candidate by a wide margin. `core/pdf-render.ts`, pdf-lib, `core/zip.ts` and
      `core/download.ts` were all written, tested and deployed; this was mostly
      assembly. Entirely client-side, and among the highest-volume PDF searches
      there are. Shipped as one tool, `tools/image-pdf`, with two modes — see the
      full entry below.
- [ ] **2. Image converter and resizer.** The mozjpeg and libwebp WASM codecs
      already ship (see the `wasm` assets in `angular.json`). Conversion and
      resizing sit right next to compression and cost almost nothing extra.
- [x] **3. Password / passphrase generator.** *(done 2026-08-12)* Small, heavily
      searched, and the most on-brand tool on this list — a password generator
      that provably never phones home is the entire privacy argument in miniature.
- [ ] **4. URL and query-string encoder/decoder.** A conspicuous gap beside the
      Base64 converter.
- [ ] **5. JSON ↔ CSV.** Common, and needs no dependency that is not already here.
- [ ] **6. Favicon / app-icon generator.** Image codecs plus `zip.ts`, and
      `scripts/generate-icons.mjs` means the resizing logic has been written once
      already.
- [ ] **7. X.509 certificate decoder.** The natural sibling of the JWT decoder,
      and exactly the kind of file nobody should paste into a random website.
- [ ] **8. PDF watermark and page numbers.** pdf-lib handles both, and the page
      model in `pdf-organizer/organise.ts` is already the right shape for it.

### Everyday-work expansion — broadening past developers (added 2026-08-11)

The list above leans developer. This set deliberately widens the audience to
writers, students, analysts and general users — the highest-volume utility
searches there are, and the best lever for both traffic and AdSense revenue —
while keeping the client-side promise. Tiered by return on effort. Items already
in the ranked list above are cross-referenced, not repeated.

**Tier 1 — high volume, pure client-side, broad audience (do first):**

- [x] **Password / passphrase generator** *(+ strength checker)* — see #3 above.
      *(done 2026-08-12)* Massive search volume, the crypto primitives already
      exist in the hash/UUID tools, and it is the privacy argument in miniature.
- [x] **Word & character counter** *(+ reading time, keyword density)*
      *(done 2026-08-13)* The 28th tool, at `tools/word-counter/`. Live counts
      for words, characters (with and without spaces), sentences, paragraphs and
      lines, plus reading time (238 wpm) and speaking time (140 wpm), and a
      keyword-density table with a common-word filter.

      The one real decision was how to count a word. Splitting on whitespace —
      what most competing counters do — gets English roughly right and Chinese,
      Japanese and Thai completely wrong, reporting a 500-word article as **1**
      because those scripts put no spaces between words. `text-stats.ts` uses
      `Intl.Segmenter` for both word and sentence boundaries, so segmentation
      follows the Unicode rules for the text's own script, with a whitespace
      fallback for platforms without it. Sentence segmentation also stops
      abbreviations and decimals from each ending a sentence. Characters are
      counted in code points, so an emoji is 1 rather than 2.

      Pure logic lives in `text-stats.ts` (`analyse`, `keywordDensity`,
      `tokenize`, `formatDuration`) with **26 unit tests**. Verified in-browser:
      the example gives 127 words / 729 chars / 599 without spaces / 8 sentences
      / 3 paragraphs / 5 lines with reading time 32 sec (127 ÷ 238 × 60 = 32.0);
      `今日は良い天気ですね` counts as **6** words, not 1; "Hello world 🚀" is 13
      characters and 2 words; the common-word toggle adds and removes "the" and
      "and"; Clear resets every figure to zero. Responsive: the stats grid is
      auto-fit (6 columns at 1280px, 2 at 375px) and the density bar drops on
      phones, with zero horizontal overflow at 375px. Registered in
      `tools.data.ts`, routed with SEO title/description, and given a full
      `TOOL_CONTENT` entry whose 8 FAQ items were confirmed in the prerendered
      HTML alongside the SoftwareApplication node.
- [ ] **Unit converter** — length / weight / temperature / volume / speed. The
      broadest possible non-dev audience; pure client-side.
- [ ] **Text cleaner / line tools** — sort lines, remove duplicates, trim
      whitespace, strip blank lines, find & replace, convert line endings. Cheap
      to build, heavily searched, serves office + data + dev.
- [ ] **CSV ↔ JSON** *(+ a CSV viewer)* — see #5 above. Bridges the dev tools to
      the spreadsheet crowd; needs no new dependency.
- [ ] **URL / query-string encoder-decoder** — see #4 above. Conspicuous gap
      beside the Base64 converter.
- [ ] **Image resizer / format converter** *(PNG ↔ JPG ↔ WebP, resize, crop)* —
      see #2 above. The `heic-to` codec already ships, so this is half-built.

**Tier 2 — solid follow-ups, still fully in-browser:**

- [x] **Images → PDF, PDF → Images** — see #1 above (the strongest single
      candidate overall). *(done 2026-08-12)*
- [ ] **Lorem Ipsum / placeholder-text generator** — classic, high volume, tiny.
- [ ] **Number base converter** — binary / octal / decimal / hex, sibling of the
      developer tools.
- [ ] **Age & date-difference calculator** — very broad, non-dev, trivial.
- [ ] **YAML ↔ JSON converter** — natural neighbour to the JSON tools (the
      formatter already does YAML both ways; this is the standalone version).
- [ ] **Color palette extractor from an image** — pairs with the Color Converter,
      which already does palette work.
- [ ] **Slug generator** — writers + devs.
- [ ] **Barcode generator** — sibling of the QR generator; same neighbourhood.
- [ ] **Pomodoro / stopwatch timer** — everyday productivity, tiny build.

**Tier 3 — high appeal, but weigh against the "no upload" promise:**

- [ ] **Currency converter** — needs live rates, so it cannot be purely local.
      Proxy the rates through the Worker and cache in Upstash, exactly like the
      news feed (`worker/news.ts` is the template). The one server-dependent
      item genuinely worth the trade.
- [ ] **Background remover** — a client-side WASM model is possible but a heavy
      download; gate it behind a skeleton and an explicit "download the model"
      step so the page stays honest about the cost.
- [ ] **Speech-to-text / text-to-speech** — the browser's own Web Speech API
      keeps both local, so these stay on-brand despite sounding server-heavy.

**Suggested first picks:** Password Generator, Word Counter, Unit Converter and
Text Cleaner — all four are small, purely client-side, and target keywords with
10–100× the volume of developer tools, which is exactly the "help everyone's
everyday work" audience this expansion is for.

### UI and shell

- [x] **Category navigation in the header.** *(done 2026-08-13)* A **Browse**
      menu in the appbar lists the three categories with live counts (Developer
      15, Converter 3, Document 10) plus an "All tools 28" row. The counts are
      derived from `TOOLS` at module load, so a new tool changes them without
      anyone remembering to. Each row links to `/?category=<name>`, which the
      homepage now reads: `home.ts` subscribes to `queryParamMap` in
      `afterNextRender` (prerender-safe — the served HTML always shows every
      category) and `selectCategory()` navigates instead of setting the signal,
      so the chips, the address bar and the menu cannot disagree. An unknown
      value falls back to All. One `<ng-template #browseMenu>` serves two
      triggers — the bar button above 640px and a submenu item inside the
      hamburger below it — so the two can never drift.
- [x] **Surface favourites and recents in the shell.** *(done 2026-08-13)* Two
      places now. On every tool page the new masthead carries a favourite star
      (40px target, amber when on). In the header's Browse menu, "Favorites" and
      "Recently used" groups list up to five tools each, with anything starred
      filtered out of recents so no row appears twice. Both groups come from
      localStorage and so are absent from the prerendered HTML — correct, since
      they are per-visitor and nothing about them belongs in a cached document.
- [x] **A shared tool-page shell component.** *(done 2026-08-13)*
      `shared/tool-page/` is the component `tool-shell.css` never had. All 28
      tools now open with `<app-tool-page slug="…">description</app-tool-page>`,
      replacing ~22 lines of hand-assembled breadcrumb and header each. Name and
      icon are derived from the catalog entry, which fixed two live divergences:
      Code Formatter showed a different icon on its page than on its homepage
      card, and Word Counter's breadcrumb read "Word Counter" against a catalog
      name of "Word & Character Counter". The description stays projected — the
      card grid wants one terse line, the page can afford a fuller sentence. The
      crumb and head rules moved out of `tool-shell.css`, and the five tools that
      kept private copies of that chrome (json-formatter, jwt-decoder,
      jwt-editor, markdown-editor, pdf-merge) lost 12 dead rule blocks each.
- [ ] **Global drag-and-drop on file tools** — drop anywhere on the page, not
      only onto the input.
- [ ] **Skeletons for the heavy lazy chunks.** `heic-to` is 3.00 MB and
      `typescript` 900 kB; today both load behind an inert UI.
- [ ] **Mobile audit of the split-pane tools** — Text Diff and Markdown Editor
      are side-by-side layouts on a phone.
- [ ] **Undo (or a toast) in the PDF Organizer.** Deleting a page currently has
      no way back.
- [ ] **A `?` shortcut sheet**, once per-tool shortcuts exist.

### Housekeeping carried over from the first deploy

- [x] **`tools.data.ts` claims a catalog endpoint that does not exist.**
      *(done 2026-08-12)* The false `GET /api/tools` claim is gone; the comment
      now lists only what is actually derived from the catalog (grid, search,
      palette, category filter, README table).
- [x] **`README.md` is badly out of date.** *(done 2026-08-12)* Rewritten from
      `tools.data.ts`: all 27 tools in three category tables with honest
      *(hosted)* markers on the three proxied PDF operations, the prerender/no-
      SPA-fallback build story, Node ≥ 20, vitest, and the actual tech stack.
- [x] **Page width consistency.** *(done 2026-08-12, user-reported)* The guides
      and about pages capped themselves (`:host` max-width 860px / 1040px with
      their own inline padding) and so sat visibly narrower than the navbar,
      while home and news filled the shell. Both now use the bare
      `:host { display: block; padding-block: … }` pattern and inherit the
      shell's 1240px `.content` column; the guides list became a responsive
      two-up grid (`minmax(min(100%, 480px), 1fr)`) so cards don't stretch into
      banners. Verified in-browser: navbar inner 13–1253, guides cards
      41–626/640–1225, about grids 41–1225 — one column everywhere. The guide
      *article* page keeps its 760px reading measure on purpose.
- [ ] **Orphaned `IMAGE_COMPRESS_SECRET` Worker secret.** The Fly app it
      authenticated is already destroyed; this is a live credential for nothing.
- [ ] **The PDF sniff is loose.** `services/*/server.mjs` searches for `%PDF-`
      anywhere in the first 1 KB rather than requiring it at offset 0. Found by
      accident when a `curl -F` test had its whole multipart envelope accepted
      as a PDF and echoed back with a 200. The failure is benign — Ghostscript
      fails and the original is returned — but malformed input gets a success
      status instead of a 400.

**Suggested order:** the search button, then the service worker, then
Images ↔ PDF. The first is a real defect, the second completes something already
mostly paid for, and the third is the largest new capability for the least new
code.
