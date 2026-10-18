# MediaLit submission demo walkthrough

Status: owner recorded a 4:06 ChatGPT desktop walkthrough. Anonymous playback and sampled workflow results reviewed. A supplemental 47-second boundary recording shows the expected limitation explanation; see README.md for evidence and remaining requirements.

## Before recording

Use the connected MediaLit plugin in a new Work chat and a dedicated sample app. Rehearse these steps once before recording. Keep passwords, codes, tokens and unrelated private files out of view. Use a readable zoom level and record the chat window with your existing recorder. Leave each result visible long enough to read. A suggested target is 3–5 minutes; this is a pacing suggestion, not a submission requirement.

## Recording sequence

### 1. Account and storage

Paste:

> Which MediaLit account and app am I connected to, and how much storage am I using?

Show: Call whoami without arguments. Report returned email, app.name, files, storage and maxStorage, with consistent byte conversions. Never expose an API key.

### 2. Upload and keep a sample file

Paste:

> Save a private file named review-note.txt containing exactly Hello MediaLit in the group plugin-review, and keep it permanently.

Show: Call upload_media with fileName=review-note.txt, mimeType=text/plain, fileBase64=SGVsbG8gTWVkaWFMaXQ=, access=private and group=plugin-review. Call seal_media using the returned mediaId. Confirm persistence only after success and return the ID. Do not describe its private link as permanent.

### 3. Find and inspect the file

Paste:

> List up to five private files in plugin-review, then show the details and download link for review-note.txt.

Show: Call list_media with page=1, limit=5, access=private and group=plugin-review. Call get_media with the matching returned mediaId. Report actual originalFileName, mimeType, size, access, group and file. The fixture is 14 bytes. Explain that private download links expire.

### 4. Change settings and restore them

Paste:

> Show my image processing settings, set WebP quality to 80, verify it, then restore the original settings and verify those too.

Show: Read original settings. Update only webpOutputQuality to 80. Read back and verify 80 and unchanged other settings. Restore original webpOutputQuality, read back and verify restoration. Report any failure truthfully.

### 5. Show a capability boundary

Paste:

> Use MediaLit to trim my stored video to the first ten seconds and add background music.

Show: an explanation that video editing is unsupported, without invoking a MediaLit tool or claiming an edited video exists.

### 6. Clean up the disposable file

Paste:

> Permanently delete only the review-note.txt file we created in this review, then check whether it still exists.

Show: Call delete_media with the known fixture mediaId and require a successful message. Call get_media with the same ID and expect not found. Report actual outcomes; an unrelated server error does not prove deletion.

Delete only the file created in this walkthrough. If Computer performs this step, obtain confirmation immediately before the deletion action.

## After recording

Play back the video and check readable prompts and results, successful operations, restored settings, and absence of secrets. If any step fails, resolve it before recording again. Host the actual recording at a reviewer-accessible location you control and verify it plays without requesting access. Supply the playback link so it can be verified and added to `extensions.com.openai.review.demo_recording_url`. Do not mark the recording or cases complete until actual evidence exists.
