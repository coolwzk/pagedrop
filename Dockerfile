# PageDrop — production image
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3780 \
    HOST=0.0.0.0 \
    AUTH_ENABLED=true

RUN addgroup -S pagedrop && adduser -S pagedrop -G pagedrop

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY server ./server
COPY public ./public
COPY docs ./docs

RUN mkdir -p /app/data /app/storage/sites \
  && chown -R pagedrop:pagedrop /app

USER pagedrop

EXPOSE 3780

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3780/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
