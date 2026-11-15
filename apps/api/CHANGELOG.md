# @medialit/api

## 0.4.0

### Minor Changes

- 3c7ed5c: Markdown files open in a native reader in the file preview dialog. The dashboard media list and details now include `preview` (`"markdown"` or `null`), which names the native viewer for a file, and `GET /api/apps/:appId/media/:mediaId/content` returns a previewable file's text (up to 2 MB) for public and private files alike, so storage needs no CORS. On phones the preview dialog fills the screen, markdown opens straight into full-screen reading, and an expand button switches between reading and file details on any screen size. The dashboard is now an installable web app with a manifest, home-screen icons and an offline page.

## 0.0.28

### Patch Changes

- Updated dependencies [4c480c7]
    - @medialit/thumbnail@0.0.28
    - @medialit/images@0.0.26

## 0.0.27

### Patch Changes

- Updated dependencies [0ecea51]
    - @medialit/thumbnail@0.0.27

## 0.0.26

### Patch Changes

- Updated dependencies [bbb81e7]
    - @medialit/thumbnail@0.0.26

## 0.0.25

### Patch Changes

- Updated dependencies [7a07e615]
    - @medialit/thumbnail@0.0.25
    - @medialit/images@0.0.25
