# Ghostscript compression service for Fly.io.
# node:slim gives us a small runtime; ghostscript comes from Debian's repo.
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ghostscript \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.mjs ./

ENV PORT=8080
EXPOSE 8080

# Drop root; the service only ever writes to /tmp, which is world-writable.
USER node

CMD ["node", "server.mjs"]
