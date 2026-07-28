# Image service: Node + sharp. sharp ships prebuilt linux binaries, so no native
# build toolchain is needed on top of the slim base.
FROM node:22-slim

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY server.mjs ./

ENV PORT=8080
EXPOSE 8080
USER node

CMD ["node", "server.mjs"]
