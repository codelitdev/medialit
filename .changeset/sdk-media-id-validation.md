---
"medialit": patch
---

`get()`, `seal()` and `delete()` now reject media IDs that aren't nanoids. Previously an ID such as `../signature/create` from a user changed which API endpoint the request reached, using your API key.
