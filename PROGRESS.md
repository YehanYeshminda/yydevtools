# yydevtools — progress & roadmap

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

## Recommended next steps

### B. New client-side tools (high search volume, zero backend, zero hosting cost)

Ranked by value / effort. Each is a `tools.data.ts` entry + a route (with SEO
`description`) + a component, mirroring an existing tool.

1. **Diff / text compare** — split or unified view; pairs with JSON & markdown.
2. **Regex tester** — live match highlighting, capture groups, flags. No deps.
3. **Cron expression explainer** — human description + next N run times
   (`cronstrue` + `cron-parser`, both tiny).
4. **QR code generator** — very high search volume (`qrcode`).
5. **Case converter / slugify** — camel/snake/kebab/Pascal, no deps.
6. **SQL / XML / HTML formatter** — extends the "formatter" family
   (`sql-formatter`, Prettier standalone).

### C. Further tool deepenings

- **json-to-types:** more targets are now cheap to add — Rust structs (serde),
  Kotlin data classes, Java records, JSON Schema, Pydantic (v2) models.
- **json-formatter:** add JSON→YAML / YAML→JSON and JSONPath querying.
- **color-converter:** OKLCH/LAB support and palette generation.

### D. Cross-cutting polish

- A shared "copy to clipboard" affordance and consistent keyboard shortcuts
  across tools.
- Recently-used / favourites already exist (`favorites.service.ts`); consider a
  command-palette (Ctrl-K) to jump between tools.
