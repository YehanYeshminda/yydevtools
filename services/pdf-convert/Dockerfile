# Convert service: Node runtime + LibreOffice headless.
# --no-install-recommends keeps the (already large) image from ballooning further.
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    fonts-dejavu \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.mjs ./

ENV PORT=8080
# LibreOffice needs a writable HOME for its per-call profile.
ENV HOME=/tmp
EXPOSE 8080
USER node

CMD ["node", "server.mjs"]
