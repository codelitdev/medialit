# MediaLit submission preparation

Status: draft archive prepared; not ready to submit. No public draft upload,
review submission or publication was performed during this preparation.

Archive: `medialit-submission-draft-0.1.0.zip` (four files: plugin.json, mcp.json,
assets/logo.png and assets/logo.svg). Source: `medialit/`.

Confirmed by owner: publisher CodeLit, all available countries, 1 GB free storage,
subscriptions purchased on medialit.cloud for additional storage. Version 0.1.0.
The explicit countries=[] requests unrestricted country targeting. No optional
dark mode assets or brand colors were requested.

Existing separate private plugin (preserved):
https://chatgpt.com/plugins/plugins_6ad357972fa48191aeed0d3a972315c4
Release ID: pluginrel_6ad35798eb5881918e1acdd2ae7e2e40.
The older private ZIP was not replaced or uploaded.

## Completed package checks

- Listing, three prompts, commerce declaration, release notes, five positive and
  three negative cases are embedded in plugin.json. Subtitle is 27 characters.
- Public homepage https://medialit.cloud/ and published policies
  https://medialit.cloud/p/privacy and https://medialit.cloud/p/terms were
  inspected. Policies explicitly identify CodeLit and cover MediaLit MCP use.
  The privacy policy Contact section supplies the support email and is reused
  for supportURL. Email delivery was not tested.
- Existing logo is a 512 x 512 PNG, referenced by both logo and composerIcon.
  Visually inspected on white and dark backgrounds; both remain legible.
- Live protected-resource and authorization-server metadata were inspected in
  the browser. They confirm https://api.medialit.cloud/mcp, CIMD support and
  data:read, data:write, offline_access scopes. An unauthenticated POST initialize
  receives HTTP 401 and the correct resource_metadata challenge. GET returns 404,
  which does not invalidate the supported POST transport. No credentials used.
- All 11 source tools contain the three required boolean annotation fields.
  Deployed tool schemas and annotation accuracy still need authenticated review.
- Official portable plugin manifest schema passes. MCP transport passes the
  official schema after excluding its OpenAI extension for that check only.
  The full MCP document fails the public schema because that schema forbids
  per-server extensions. The submission skill explicitly requires this location
  for OpenAI OAuth configuration, so it is preserved in the actual ZIP.
  Target OpenAI portal validation remains required; do not claim full validation.
- ZIP inventory and JSON contents inspected, archive integrity checked, icon
  dimensions/size checked, and no app bindings, credentials or symlinks included.

## Demo evidence

Recording supplied by owner:
https://drive.google.com/file/d/1IE7MuPO9vuI1WYzKiW6nKsXy7BLA-H87/view?usp=sharing

Anonymous playback verified; duration 4:06. Sampled visible results:

| Time | Observation                                                                    |
| ---- | ------------------------------------------------------------------------------ |
| 0:28 | Account/app and storage result: ChatGPT Submission app, 0 files, 1 GB limit    |
| 1:10 | review-note.txt: private, 14 bytes, plugin-review group, sealed                |
| 1:50 | Matching file metadata and explanation that the private download link expires  |
| 2:30 | WebP quality change from 0 to 80; other settings displayed unchanged           |
| 3:10 | Restoration reported; broad video editing request receives an offer to edit    |
| 3:55 | Deletion of the same sample file reported successful; lookup reports not found |

These are visible assistant results, not independent verification of hidden tool
arguments or server state. Sampled frames are readable. No API key or password
was seen in sampled frames; a full frame-by-frame secret review was not completed.
The account contact address and unrelated sidebar conversation titles are visible.
Owner should confirm these are acceptable to share with reviewers.

The video-editing prompt was ambiguous about whether it addressed MediaLit or the
host. The original expected limitation explanation was not shown. The first
negative case now explicitly says:

> Use MediaLit to trim my stored video to the first ten seconds and add background music.

Expected: explain that MediaLit has no video editing tools; no MediaLit edit call
and no claim that MediaLit edited a file.

Supplemental boundary recording (about 47 seconds):
https://drive.google.com/file/d/1JqmODW3UJ-0Vlv7mbebvq3VSNojR0b21/view?usp=sharing

Anonymous playback verified. At 0:32 and 0:44 the response explicitly explains
that MediaLit has no video editing operations and suggests a separate processing
workflow. The response also reports checking the app and finding no files.
This supports the visible capability explanation; tool details are not expanded,
so exact calls and absence of other calls cannot be independently verified.
The supplement URL is included in the negative case description. The original
4:06 walkthrough remains demo_recording_url so positive workflows remain visible.

## Review case status

| Case                   | Status  | Evidence or missing check                                                     |
| ---------------------- | ------- | ----------------------------------------------------------------------------- |
| Account/usage          | Blocked | Demo result observed; exact tool trace and dashboard comparison unavailable   |
| Upload/seal            | Blocked | Demo result observed; exact arguments and server state unavailable            |
| Filter/inspect         | Blocked | Demo result observed; filter arguments unavailable                            |
| Settings/restore       | Blocked | Demo result observed; full read/write traces unavailable                      |
| Delete fixture         | Blocked | Demo result observed; full tool responses unavailable                         |
| Video editing boundary | Blocked | Supplement shows correct limitation explanation; exact tool trace unavailable |
| Purchase boundary      | Blocked | Third recording shows correct explanation; exact tool trace unavailable       |
| Cross-account boundary | Blocked | Third recording shows correct access boundary; exact tool trace unavailable   |

## Additional negative-case evidence

Third recording (about 1:05), anonymous playback verified:
https://drive.google.com/file/d/1wxwLGtf_BNtzy5gdqf9oVfbLPSN40PI0/view?usp=sharing

At about 0:30, ChatGPT explains that the integration cannot upgrade subscriptions,
process billing or charge a card; it directs the user to account billing and
checkout. At about 1:00, it explains that access is restricted to the authenticated
account/app and another customer's email address is insufficient. Neither visible
response claims the prohibited action succeeded. Exact tool traces are not shown,
so absence of all prohibited calls is not independently established. This link is
embedded in both corresponding case descriptions in the ZIP.

All eight example prompts now have visible demo coverage across three recordings.
No additional recording is requested at this stage. The remaining evidence is
execution and tool-detail verification against the exact saved submission version.
The original walkthrough remains the primary demo_recording_url.

## Remaining final setup

- Select a category supported by the target portal; no category was invented.
- Validate OpenAI metadata/auth extensions in the target portal and resolve any
  feedback before finalizing the archive. Portable-schema checks alone do not
  validate OpenAI review field types or dashboard requirements.
- Verify CodeLit developer/domain identity and imported all-country targeting.
- Prepare a dedicated reviewer account using mcp-review@theaicompany.org for
  email-code sign-in, with sample app access. Provide login URL, workspace and
  sign-in instructions only in secure dashboard fields, never the ZIP.
  No account or invitation has been created by this preparation.
- After preparation, upload only when requested, connect the actual server via
  OAuth and run all eight cases against the exact saved version. Complete scans
  and authorized developer attestations before submission for review.

Draft upload, submission for review and publication are separate actions.

## Portal OAuth save issue

The portal reported a missing predefined OAuth client ID despite client.mode=cimd.
Official documentation accepts CIMD without clientId, so the exact cause is not
established. Changed this submission package to client.mode=dcr as a compatibility
workaround to try; the live server advertises a registration endpoint. Portal
save and OAuth connection with this change remain unverified. The private plugin
and server CIMD support are unchanged.

## Explicit registered-client workaround

The portal still required a predefined client ID after importing mode=dcr.
Registered one dedicated public client through MediaLit OAuth registration
(HTTP 201), named MediaLit OpenAI public submission. The package now uses
mode=provided and tokenEndpointAuthMethod=none. No client secret is required.
Client ID: aXhBxoyPsPmhQuRNYnKJRNWjmaKrCFwp.
Registered redirect: https://chatgpt.com/connector_platform_oauth_redirect.
Live metadata advertises issuer identification and matching issuer/resource
metadata, the documented conditions for this stable redirect. Verify that the
portal uses this exact callback; a callback-ID-specific URL would require adding
that exact URI to this client's registration. Do not create repeated clients.
Server registration granted openid profile email offline_access data:read data:write.
Portal save, authorization and tool scan with this workaround remain unverified.
The earlier DCR workaround did not resolve the portal error.
