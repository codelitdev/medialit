FROM node:17.6.0-buster AS builder
WORKDIR /usr/src/app

# install deps
COPY packages/core .
RUN npm install

# build the project
RUN npm run build

FROM node:17.6.0-buster

# install required softwares
RUN apt-get update && apt-get -y install ffmpeg imagemagick webp

# set environment
ENV NODE_ENV production

# create app directory
# RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# install only production deps 
COPY --chown=node:node packages/core/package.json .
RUN npm install --production

# copy files
COPY --chown=node:node --from=builder /usr/src/app/dist dist

# set a low privileged user
USER node

CMD ["npm", "start", "--silent"]