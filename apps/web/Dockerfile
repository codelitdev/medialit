FROM oven/bun:1.4.1
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/docs/package.json ./apps/docs/package.json
COPY packages/images/package.json ./packages/images/package.json
COPY packages/thumbnail/package.json ./packages/thumbnail/package.json
COPY packages/models/package.json ./packages/models/package.json
COPY packages/utils/package.json ./packages/utils/package.json
COPY packages/scripts/package.json ./packages/scripts/package.json
COPY packages/medialit/package.json ./packages/medialit/package.json
COPY examples/express/package.json ./examples/express/package.json
COPY examples/next-app-router/package.json ./examples/next-app-router/package.json

RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY apps/web ./apps/web
COPY packages/models ./packages/models

RUN bun --filter @medialit/web build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "--filter", "@medialit/web", "start"]
