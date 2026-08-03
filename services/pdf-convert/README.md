# pdf-convert

Converts a PDF to an Office format with LibreOffice headless. Replaces the Adobe
export path. Free per call, not metered.

## Quality caveat (read this)

LibreOffice imports a PDF as a **Draw** document, so results vary by target:

- **docx / rtf** — usable; layout and text come through reasonably.
- **xlsx / pptx** — rough. There is no real "PDF → spreadsheet/slides" in the
  open-source world; expect a best-effort dump, not a clean conversion.

The Worker already acts on this: `EXPORT_FORMATS` in `worker/index.ts` accepts
only `docx` and `rtf`, so xlsx/pptx are unreachable from the site even though
this service still knows how to attempt them.

## Endpoint

- `POST /convert?format=docx|rtf|xlsx|pptx` — `Authorization: Bearer <CONVERT_SECRET>`,
  body `application/pdf`. Returns the converted file or `{ error: { code, message } }`.
- `GET /health` — no auth. Runs `soffice --version`, so it returns **503** when
  LibreOffice is missing rather than reporting a broken machine as healthy.

## Behaviour worth knowing

- **Non-PDF bodies are rejected immediately** on a header sniff. This matters
  more here than in the other services: LibreOffice will cheerfully attempt to
  import dozens of formats, so without the check the endpoint is a
  general-purpose document parser exposed to whatever reaches it.
- **At most `MAX_CONCURRENT` (default 2) conversions run at once**; beyond that
  the service answers `503` with `Retry-After`.
- **Timeout is 120 s**, below the Worker's 135 s budget for this route.
- Every request logs one JSON line (`event`, `format`, `inBytes`, `ms`).

## Deploy

```sh
fly launch --no-deploy
fly secrets set CONVERT_SECRET=$(openssl rand -hex 32)
fly deploy
```

Then wire the Worker with `PDF_CONVERT_URL` (in `wrangler.jsonc`) and:

```sh
npx wrangler secret put PDF_CONVERT_SECRET   # same value as CONVERT_SECRET
```
