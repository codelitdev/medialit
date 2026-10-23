# @medialit/react

## 0.2.0

### Minor Changes

- c3e3bd3: Add browser uploads. `@medialit/uploader` uploads files from the browser with the resumable tus protocol, `@medialit/react` adds the `MediaLitUploader` component and `useMediaLitUpload` hook, and `medialit` adds `createSignatureHandler` for the signature route they call.

    `medialit`: `upload()` now sends the file with Node's built-in `FormData`. With Node's `fetch`, it previously did not send the file. It also takes `fileName` and `mimeType` options.

    `@medialit/cli` adds the `medialit` command. `medialit login` signs in with the browser and the same app picker as the MCP server, and works with self-hosted servers.

    `medialit`: `list()` now sends paging and filters in the body, where the API reads them. They were previously ignored. The client also takes an OAuth `accessToken` instead of an API key.

    `@medialit/uploader`: uploads a Node.js file stream, and takes a `mimeType` option.

### Patch Changes

- Updated dependencies [c3e3bd3]
    - @medialit/uploader@0.2.0
