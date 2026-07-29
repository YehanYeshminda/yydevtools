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
