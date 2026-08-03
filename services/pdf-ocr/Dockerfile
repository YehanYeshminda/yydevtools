# OCR service: Node runtime + ocrmypdf (Tesseract + Ghostscript come with it).
FROM node:22-slim

# ocrmypdf pulls in tesseract-ocr and ghostscript; add the language packs we
# advertise in the tool's language picker.
#
# `tesseract-ocr-osd` is not a language — it is the orientation-and-script
# detection model that `--rotate-pages` needs. Without it that flag fails, and
# sideways scans (which scanners produce constantly) come back with an almost
# empty text layer.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ocrmypdf \
    tesseract-ocr-osd \
    tesseract-ocr-eng \
    tesseract-ocr-deu \
    tesseract-ocr-fra \
    tesseract-ocr-spa \
    tesseract-ocr-ita \
    tesseract-ocr-por \
    tesseract-ocr-nld \
    tesseract-ocr-swe \
    tesseract-ocr-pol \
    tesseract-ocr-tur \
    tesseract-ocr-rus \
    tesseract-ocr-jpn \
    tesseract-ocr-kor \
    tesseract-ocr-chi-sim \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.mjs ./

ENV PORT=8080
EXPOSE 8080
USER node

CMD ["node", "server.mjs"]
