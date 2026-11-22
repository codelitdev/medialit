# Introduction

> Create thumbnails from your image and video files for your Node.js based application.

Each thumbnail is exactly the size you ask for: the image or video frame is scaled to cover it, keeping its aspect ratio, and the overflow is cropped from the center.

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

```
import thumbnail from "@medialit/thumbnail";

await thumbnail.forImage("./path/to/file.png", "./path/to/thumb.webp", {
    width: 320,
    height: 180,
});
```

## API

### forImage(source, destination, size)

Makes a `size.width` × `size.height` thumbnail of a local image file (PNG, JPEG, WebP or GIF).

### forVideo(source, destination, size)

Makes a `size.width` × `size.height` thumbnail of a video's first frame. `source` is an `http(s)` URL; ffmpeg reads only the bytes it needs.

ffmpeg runs without a shell, in its own process group, and is killed after `THUMBNAIL_TIMEOUT_MS` (60 s). Sides are capped at `MAX_THUMBNAIL_SIDE` (4096).
