# image-compress

Server-side image re-encoding with [sharp](https://sharp.pixelplumbing.com):
mozjpeg for JPEG, libimagequant for palette PNG, plus WebP. Replaces the
browser-only canvas encoder. Free per call, not metered.

## Trade-off (read this)

The old tool encoded live in the browser as you dragged the quality slider —
instant, offline, private. Server-side gains mozjpeg/pngquant quality but adds a
network round-trip per encode and cold starts. The Worker debounces slider
changes; expect a brief spinner instead of instant preview.

## Endpoint

- `POST /compress?format=jpeg|webp|png&quality=80&max=1920`
  `Authorization: Bearer <IMAGE_SECRET>`, body = raw image bytes.
  `quality` 1–100, `max` = longest-edge cap in px (0 = keep original).
  Returns the re-encoded image or `{ error: { code, message } }`.
- `GET /health` — `ok`, no auth.

## Deploy

```sh
fly launch --no-deploy
fly secrets set IMAGE_SECRET=$(openssl rand -hex 32)
fly deploy
```

Then wire the Worker with `IMAGE_COMPRESS_URL` (in `wrangler.jsonc`) and:

```sh
npx wrangler secret put IMAGE_COMPRESS_SECRET   # same value as IMAGE_SECRET
```

## Local check

```sh
IMAGE_SECRET=dev npm install && IMAGE_SECRET=dev npm start
curl -sS -X POST 'http://localhost:8080/compress?format=jpeg&quality=70&max=1600' \
  -H 'Authorization: Bearer dev' --data-binary @photo.png -o out.jpg
```
