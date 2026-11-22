# Install and build run on the build machine's own platform ($BUILDPLATFORM):
# the output is JavaScript, the same for every target, and emulating arm64 on
# an x86 builder (or the reverse) is several times slower. Only the runtime
# stage below is the target platform, with sharp's native binaries for it.
FROM --platform=$BUILDPLATFORM oven/bun:1.4.4 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/models/package.json ./packages/models/package.json
COPY packages/uploader/package.json ./packages/uploader/package.json
COPY packages/react/package.json ./packages/react/package.json

RUN bun install --frozen-lockfile --filter @medialit/web

FROM deps AS builder

COPY tsconfig.json ./
COPY apps/web ./apps/web
COPY packages/models ./packages/models
COPY packages/uploader ./packages/uploader
COPY packages/react ./packages/react

ENV NEXT_TELEMETRY_DISABLED=1

# The uploader and the React components resolve to their built dist, which
# is not checked in. The components need the uploader built first.
RUN bun --filter @medialit/uploader build
RUN bun --filter @medialit/react build
RUN bun --filter @medialit/web build

# sharp (Next.js image optimization) is the one native module traced into the
# standalone output. Fetch its binaries for the target platform, at the
# version the lockfile resolved, without running anything for that platform.
# The runner is Alpine, so fetch the musl builds (on a glibc build machine bun
# would fetch only glibc ones).
ARG TARGETARCH
RUN version=$(sed -n 's/^ *"sharp": \["sharp@\([0-9.]*\)".*/\1/p' bun.lock | head -n 1) \
    && test -n "$version" \
    && mkdir -p /target-sharp && cd /target-sharp \
    && printf '{"dependencies":{"sharp":"%s"}}' "$version" > package.json \
    && bun install --production --os=linux --libc=musl \
        --cpu=$([ "$TARGETARCH" = amd64 ] && echo x64 || echo "$TARGETARCH")

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
# Put the target platform's sharp binaries (@img/sharp-*, which include
# libvips) beside each traced copy of sharp. Packages already there (the
# build platform's, or JavaScript ones such as @img/colour) are left as is.
COPY --from=builder /target-sharp/node_modules/@img /tmp/target-img
RUN for dir in $(find node_modules -type d -path '*/node_modules/sharp'); do \
        mkdir -p "$dir/../@img"; \
        for pkg in /tmp/target-img/sharp-*; do \
            [ -e "$dir/../@img/${pkg##*/}" ] || cp -R "$pkg" "$dir/../@img/"; \
        done; \
    done \
    && rm -rf /tmp/target-img

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
