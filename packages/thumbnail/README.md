# Introduction

> Create thumbnails from your image and video files for your Node.js based application.

The generated thumbnails are going to be of `16:9` aspect ratio.

For generating thumbnails, this package uses ffmpeg (for videos) utilities, so make sure that is installed on your machine before using this package.

_Note: This module will always overwrite the thumbnail file, if already exists._

### Features

1. Promise based API
2. Supports both images and videos

## Install

```
npm install @medialit/thumbnail
```

**NOTE**: You need to have the following softwares installed on your machine to use this package. For Ubuntu, the command is listed.

```
apt install ffmpeg
```

## Usage

With default options

```
const mt = require('@medialit/thumbnail')

mt.forImage(
  './path/to/file.png',
  './path/to/thumb.png')
  .then(() => console.log('Success'), err => console.error(err))
```

## API

### forImage(source, destination, [options])

**source**

An absolute or relative path to the original image.

**destination**

An absolute or relative path to the thumbnail folder.

### forVideo(source, destination, [options])

**source**

An absolute or relative path to the original video.

**destination**

An absolute or relative path to the thumbnail folder.

## Debugging

Set the environment variable `DEBUG` to `true` to see logs.
