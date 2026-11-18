---
"@medialit/api": patch
---

Thumbnail generation now opens only common video and image formats, reads videos only over HTTP(S) and images only from local files, and stops ffmpeg after 60 seconds. Uploads in other formats are still stored, but get no thumbnail.
