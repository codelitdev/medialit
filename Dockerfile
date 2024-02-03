FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# copy pnpm specific files 
COPY package.json ./package.json
COPY pnpm-lock.yaml ./pnpm-lock.yaml
COPY pnpm-workspace.yaml ./pnpm-workspace.yaml

# copy project files
COPY tsconfig.json . 
COPY apps/api ./apps/api
COPY packages/images ./packages/images
COPY packages/thumbnail ./packages/thumbnail

# TODO: figure out why it is not working
# FROM base AS prod-deps
# RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile --ignore-scripts

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter=@medialit/thumbnail build
RUN pnpm --filter=@medialit/images build
RUN pnpm --filter=@medialit/api build

FROM node:20-slim 
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# install required softwares
RUN apt-get update && apt-get -y install ffmpeg imagemagick webp

# set environment
ENV NODE_ENV production

# create app directory
WORKDIR /app

# copy files
#COPY --chown=node:node --from=prod-deps /app/node_modules /app/node_modules 
COPY --chown=node:node --from=build /app/package.json /app/package.json
COPY --chown=node:node --from=build /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY --chown=node:node --from=build /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --chown=node:node --from=build /app/packages/thumbnail/package.json /app/packages/thumbnail/package.json
COPY --chown=node:node --from=build /app/packages/thumbnail/dist /app/packages/thumbnail/dist  
COPY --chown=node:node --from=build /app/packages/images/package.json /app/packages/images/package.json
COPY --chown=node:node --from=build /app/packages/images/dist /app/packages/images/dist
COPY --chown=node:node --from=build /app/apps/api/package.json /app/apps/api/package.json
COPY --chown=node:node --from=build /app/apps/api/dist /app/apps/api/dist

# Run pnpm install
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# set a low privileged user
USER node

CMD ["pnpm", "--filter=@medialit/api", "start"]