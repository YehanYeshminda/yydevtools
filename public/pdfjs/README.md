# Vendored pdf.js viewer

The prebuilt pdf.js viewer, served from `/pdfjs/web/viewer.html` and embedded in
an iframe by `src/app/shared/pdf-preview`. Taken from a pdf.js release as-is,
with one deliberate change.

## Locales are pruned

`web/locale/` ships 114 language packs (~2.8 MB) upstream. This site has an
English-only interface, so only `en-US` and `en-GB` are kept and `locale.json`
lists just those two.

Nothing breaks for a visitor whose browser asks for another language: the
viewer's bundle chain is `browser language → base language → en-us`, so an
unlisted locale falls straight through to English.

**When upgrading pdf.js, re-apply the prune** — deleting the extra directories
and rewriting `web/locale/locale.json` to:

```json
{"en-gb":"en-GB/viewer.ftl","en-us":"en-US/viewer.ftl"}
```

`web/cmaps/` and `web/standard_fonts/` are large but are left alone: they are
fetched per document, only when a PDF actually needs them.
