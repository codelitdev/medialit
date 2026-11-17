# @medialit/web

## 0.2.0

### Minor Changes

- 3c7ed5c: Markdown files open in a native reader in the file preview dialog. The dashboard media list and details now include `preview` (`"markdown"` or `null`), which names the native viewer for a file, and `GET /api/apps/:appId/media/:mediaId/content` returns a previewable file's text (up to 2 MB) for public and private files alike, so storage needs no CORS. On phones the preview dialog fills the screen, markdown opens straight into full-screen reading, and an expand button switches between reading and file details on any screen size. The dashboard is now an installable web app with a manifest, home-screen icons and an offline page.

## 0.1.3

### Patch Changes

- Updated dependencies [c3e3bd3]
    - @medialit/uploader@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [2e18d2b]
    - medialit@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [c7d0050]
    - medialit@0.1.0
