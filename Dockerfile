FROM node:17.6.0-buster

# install required softwares
RUN apt-get update && apt-get -y install ffmpeg imagemagick webp

# create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# copy files
COPY packages/core .

# install dependencies
RUN npm install

CMD ["npm", "start", "--silent"]