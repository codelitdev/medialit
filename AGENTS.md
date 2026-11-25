## Dev Environment

- Use `bun` as the package manager (Bun 1.4.4)
- This is a monorepo — use `bun --filter <package-name> <command>` for specific packages
- The API owns product behavior. The web app is a thin client over the API
- Postgres is the database (`DATABASE_URL`). Do not add a second data store for the same records
- Local dependencies run from `docker compose -f docker-compose.local.yml up` (Postgres, MinIO, Mailpit). The API and web app run on the host. Do not run that file together with `docker-compose.yml`

## Testing

- Run `bun run test` (unit tests for every package) and `bun run test:integration:stack` (REST, MCP and CLI suites against a fresh Postgres and MinIO)
- A change is tested only when uploads work end to end through all three clients, against a running API with real storage:
    - **REST API:** a form-data upload to `POST /media/create` and a resumable (tus) upload to `/media/create/resumable`
    - **Browser:** an upload from a page in a real browser, through `@medialit/uploader` or the web app
    - **CLI:** `medialit upload`
- For each upload, check that the file can be fetched back with the same bytes, that the reported size is right, and that thumbnails exist for images and videos
- Until all three pass, report the change as not fully tested and name what was skipped

# Definition of "done"
A task is considered done when you have performed the following steps.
1. Full e2e browser based smoke testing on local 
2. Full e2e browser based smoke testing on QA. Perform this step at the very last so that you have to do it only once per task.
