---
"@medialit/api": patch
"@medialit/web": patch
---

The sign-in and app-picker pages show the MediaLit logo and favicon again. A stale `public/icon.svg` from 2024 was shadowing the current logo at `/icon.svg`. The app picker also fits phone screens.
