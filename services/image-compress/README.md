# image-compress — RETIRED, NOT IN USE

> **Nothing calls this service.** Image compression moved back into the browser
> (mozjpeg and libwebp as WebAssembly, in `src/app/tools/image-compressor/`),
> and the Worker has **no `/api/image/compress` route** — see the comment at the
> end of `worker/index.ts` explaining that the route was removed on purpose.
> There is no `IMAGE_COMPRESS_URL` or `IMAGE_COMPRESS_SECRET` in
> `wrangler.jsonc` either. The deploy instructions below cannot work as written.
>
> **If `yydevtools-image-compress` is still deployed, destroy it:**
>
> ```sh
> fly apps destroy yydevtools-image-compress
> ```
>
> It scales to zero so it costs little, but it is a public HTTPS endpoint
> wrapping an image decoder that no user is behind — attack surface and a secret
> to rotate, in exchange for nothing. This directory is kept only so the code is
> recoverable from git if server-side encoding is ever wanted again.

---

Server-side image re-encoding with [sharp](https://sharp.pixelplumbing.com):
mozjpeg for JPEG, libimagequant for palette PNG, plus WebP. Free per call, not
metered.

## Why it was retired

Encoding in the browser is instant as you drag the quality slider, works
offline, and — the part that matters most for this site — means the image is
never uploaded at all. The WebAssembly builds of mozjpeg and libwebp produce
essentially the same output as sharp does, so the server round-trip and cold
starts bought nothing.

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
