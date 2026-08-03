# pdf-ocr

Adds a searchable text layer to a PDF using [ocrmypdf](https://ocrmypdf.readthedocs.io)
(Tesseract under the hood). Replaces the Adobe OCR path. Free per call, not metered.

## Endpoint

- `POST /ocr?lang=eng[&deskew=1]` — `Authorization: Bearer <OCR_SECRET>`, body
  `application/pdf`. Returns the OCR'd PDF, or `{ error: { code, message } }`.
- `GET /health` — no auth. Runs `ocrmypdf --version`, so it returns **503** when
  the tool is missing rather than reporting a broken machine as healthy.

`--skip-text` means pages that already contain real text are left untouched; only
image/scanned pages get a new invisible text layer, matching the old behaviour.

`--rotate-pages` is always on. Scanners routinely produce sideways pages and
Tesseract reads almost nothing off one, so this detects the orientation and
turns the page the right way up first — often the difference between a useful
text layer and an empty one. It needs the `tesseract-ocr-osd` model, which the
Dockerfile installs.

`deskew=1` additionally straightens a crooked scan. It is **off by default**
because it re-renders the page image, which is a real (if small) quality cost on
a scan that was already straight. The Worker forwards the parameter when asked.

## Behaviour worth knowing

- **Timeout is 150 s**, deliberately below the Worker's 165 s budget for this
  route. It was 240 s, which was *longer* than the Worker would wait — so the
  Worker returned a timeout at 180 s while this machine kept grinding for
  another minute producing a document nobody would receive.
- **Non-PDF bodies are rejected immediately** on a header sniff.
- **At most `MAX_CONCURRENT` (default 2) jobs run at once**; beyond that the
  service answers `503` with `Retry-After`. ocrmypdf forks a Tesseract per page
  and is memory-hungry.
- Every request logs one JSON line (`event`, `lang`, `inBytes`, `ms`).

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
