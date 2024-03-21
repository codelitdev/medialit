FROM node:20-alpine
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# copy pnpm specific files
COPY package.json .
COPY pnpm-lock.yaml .
COPY pnpm-workspace.yaml .

# copy project files
COPY tsconfig.json .
COPY apps/web/package.json ./apps/web/package.json
COPY apps/web/app ./apps/web/app
COPY apps/web/components ./apps/web/components
COPY apps/web/lib ./apps/web/lib
COPY apps/web/models ./apps/web/models
COPY apps/web/public ./apps/web/public
COPY apps/web/utils ./apps/web/utils
COPY apps/web/auth.config.ts ./apps/web/auth.config.ts
COPY apps/web/auth.ts ./apps/web/auth.ts
COPY apps/web/components.json ./apps/web/components.json
COPY apps/web/next.config.js ./apps/web/next.config.js
COPY apps/web/postcss.config.js ./apps/web/postcss.config.js
COPY apps/web/tailwind.config.ts ./apps/web/tailwind.config.ts
COPY apps/web/tsconfig.json ./apps/web/tsconfig.json

COPY packages/models ./packages/models
COPY packages/utils ./packages/utils

RUN pnpm install

# RUN pnpm build
RUN pnpm --filter=@medialit/utils build
RUN pnpm --filter=@medialit/models build
RUN pnpm --filter=@medialit/web build

ENV NODE_ENV production 

EXPOSE 3000

CMD ["pnpm", "--filter=@medialit/web", "start"]