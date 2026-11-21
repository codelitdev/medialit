---
"@medialit/api": minor
---

Add operations for the job queue: logs and errors from the API and the worker go to PostHog when `POSTHOG_API_KEY` is set, alerts for a missing worker, a slow queue and failing jobs are emailed to `OPERATOR_ALERT_EMAIL`, and a `jobs` command shows, retries and cancels jobs.
