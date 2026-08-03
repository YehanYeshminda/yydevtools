# pdf-compress

A tiny Ghostscript-backed PDF compression service. It runs on Fly.io as a
private companion to the Cloudflare Worker: the Worker forwards uploads here with
a shared secret, this service shells out to `gs`, and the smaller PDF streams
back. Unlike the Adobe path, compression costs nothing per call and is **not**
metered against the monthly quota.

## Endpoints

- `POST /compress?preset=screen|ebook|printer` — `Authorization: Bearer <secret>`,
  body `application/pdf`. Returns the compressed PDF or a
  `{ error: { code, message } }` JSON body. Response headers report what
  happened: `X-Input-Bytes`, `X-Output-Bytes` and `X-Compressed` (`1` or `0`).
- `GET /health` — no auth. Runs `gs --version`, so it returns **503** when
  Ghostscript is missing from the image rather than reporting a broken machine
  as healthy.

The Worker maps the tool's levels onto presets: `LOW → printer` (~300 dpi),
`MEDIUM → ebook` (~150 dpi), `HIGH → screen` (~72 dpi).

## Behaviour worth knowing

- **The output is never larger than the input.** Ghostscript regularly grows an
  already-optimised PDF; when that happens the original is returned instead and
  `X-Compressed: 0` says so.
- **Non-PDF bodies are rejected immediately** on a header sniff, rather than
  spending 90 s of CPU letting `gs` discover it.
- **At most `MAX_CONCURRENT` (default 3) jobs run at once**; beyond that the
  service answers `503` with `Retry-After`. Ghostscript holds page rasters in
  memory, and this is what stops a burst from OOM-killing the machine.
- Every request logs one JSON line (`event`, `preset`, `inBytes`, `outBytes`,
  `ms`), so `fly logs` is enough to see what is happening.

## Deploy

From this directory (`services/pdf-compress`):

```sh
# 1. Create the app (first time only). Keep the name in sync with fly.toml.
fly launch --no-deploy

# 2. Generate and store the shared secret.
fly secrets set COMPRESS_SECRET=$(openssl rand -hex 32)

# 3. Ship it.
fly deploy
```

Note the secret value — the Worker needs the same one.

## Wire up the Worker

Back in the repo root:

```sh
# The Fly URL — matches "app" in fly.toml. Already set in wrangler.jsonc's vars
# as PDF_COMPRESS_URL, so only change it there if you renamed the app.

# Give the Worker the same secret you set on Fly.
npx wrangler secret put PDF_COMPRESS_SECRET
# paste the COMPRESS_SECRET value when prompted

npx wrangler deploy
```

## Local check

```sh
COMPRESS_SECRET=dev node server.mjs
curl -sS -X POST 'http://localhost:8080/compress?preset=ebook' \
  -H 'Authorization: Bearer dev' \
  --data-binary @sample.pdf -o out.pdf
```

Requires a local `gs` (Ghostscript) install, or run inside the Docker image:

```sh
docker build -t pdf-compress .
docker run --rm -p 8080:8080 -e COMPRESS_SECRET=dev pdf-compress
```
