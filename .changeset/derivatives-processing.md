---
"@medialit/api": minor
"@medialit/models": minor
"medialit": minor
---

Media responses gain `processing` (`pending` until seal, then `processing`, `ready` or `failed`) and `derivatives` (outputs made from the original, by name, each with a status and, once ready, a URL). Uploads record their thumbnail as the `thumbnail` derivative. Deleting media now removes everything under its folder in both buckets. The worker gains `media.publish`, which copies ready derivatives to the public bucket, and a periodic check that settles media whose processing stopped. No existing field changes.
