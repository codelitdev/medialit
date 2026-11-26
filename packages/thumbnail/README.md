# Introduction

> Create thumbnails from your image and video files for your Node.js based application.

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

await thumbnail.forImage("./path/to/file.png", "./path/to/thumb.webp");
```

## API

### forImage(source, destination)

Makes a thumbnail of a local image file (PNG, JPEG, WebP or GIF): cropped to 16:9 from the center, at most 480 pixels tall.

### forVideo(source, destination)

Makes a thumbnail of a video's first frame, 720 pixels tall. `source` is an `http(s)` URL; ffmpeg reads only the bytes it needs.

### forVideoPoster(source, destination, { seekSeconds, signal })

Makes a video's poster: from `seekSeconds` on, skips near-black frames and picks the most representative frame. Sized like `forVideo`.

ffmpeg runs without a shell, in its own process group, and is killed after `THUMBNAIL_TIMEOUT_MS` (60 s).
