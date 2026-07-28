# pdf-ocr

Adds a searchable text layer to a PDF using [ocrmypdf](https://ocrmypdf.readthedocs.io)
(Tesseract under the hood). Replaces the Adobe OCR path. Free per call, not metered.

## Endpoint

- `POST /ocr?lang=eng` — `Authorization: Bearer <OCR_SECRET>`, body `application/pdf`.
  Returns the OCR'd PDF, or `{ error: { code, message } }`.
- `GET /health` — `ok`, no auth.

`--skip-text` means pages that already contain real text are left untouched; only
image/scanned pages get a new invisible text layer, matching the old behaviour.

### Languages

The Worker maps its locale codes to Tesseract codes: `en-* → eng`, `de-DE → deu`,
`fr-FR → fra`, `es-ES → spa`, `it-IT → ita`, `pt-BR → por`, `nl-NL → nld`,
`sv-SE → swe`, `pl-PL → pol`, `tr-TR → tur`, `ru-RU → rus`, `ja-JP → jpn`,
`ko-KR → kor`, `zh-CN → chi_sim`. Add a pack in the Dockerfile and to `LANGS`
in `server.mjs` to support more.

## Deploy

```sh
fly launch --no-deploy
fly secrets set OCR_SECRET=$(openssl rand -hex 32)
fly deploy
```

Then give the Worker `PDF_OCR_URL` (in `wrangler.jsonc`) and the matching secret:

```sh
npx wrangler secret put PDF_OCR_SECRET   # same value as OCR_SECRET
```
