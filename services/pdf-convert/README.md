# pdf-convert

Converts a PDF to an Office format with LibreOffice headless. Replaces the Adobe
export path. Free per call, not metered.

## Quality caveat (read this)

LibreOffice imports a PDF as a **Draw** document, so results vary by target:

- **docx / rtf** — usable; layout and text come through reasonably.
- **xlsx / pptx** — rough. There is no real "PDF → spreadsheet/slides" in the
  open-source world; expect a best-effort dump, not a clean conversion.

If the poor xlsx/pptx quality isn't acceptable, drop those two from the tool's
format list and keep only Word/RTF.

## Endpoint

- `POST /convert?format=docx|rtf|xlsx|pptx` — `Authorization: Bearer <CONVERT_SECRET>`,
  body `application/pdf`. Returns the converted file or `{ error: { code, message } }`.
- `GET /health` — `ok`, no auth.

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
