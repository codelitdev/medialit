FROM oven/bun:1.4.1 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/models/package.json ./packages/models/package.json
COPY packages/uploader/package.json ./packages/uploader/package.json

RUN bun install --frozen-lockfile --filter @medialit/web

FROM deps AS builder

COPY tsconfig.json ./
COPY apps/web ./apps/web
COPY packages/models ./packages/models
COPY packages/uploader ./packages/uploader

ENV NEXT_TELEMETRY_DISABLED=1

# The uploader resolves to its built dist, which is not checked in.
RUN bun --filter @medialit/uploader build
RUN bun --filter @medialit/web build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
