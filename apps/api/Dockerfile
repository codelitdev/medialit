FROM oven/bun:1.4.1
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg webp \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/images/package.json ./packages/images/package.json
COPY packages/thumbnail/package.json ./packages/thumbnail/package.json
COPY packages/models/package.json ./packages/models/package.json
COPY packages/utils/package.json ./packages/utils/package.json

ENV NODE_ENV=production

RUN bun install --frozen-lockfile --production --omit=peer --filter @medialit/api

COPY tsconfig.json ./
COPY apps/api ./apps/api
COPY packages/images ./packages/images
COPY packages/thumbnail ./packages/thumbnail
COPY packages/models ./packages/models
COPY packages/utils ./packages/utils

USER bun
CMD ["bun", "apps/api/src/index.ts"]
