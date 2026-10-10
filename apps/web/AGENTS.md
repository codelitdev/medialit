# Web App Development Guide

## Development Tips

- Do not implement login related UI or API routes (which contains authorization related business logic) in the web app. All auth related stuff is controlled by the apps/api microservice
- Use Bun 1.4.1 and run package-specific commands with `bun --filter @medialit/web <command>`.
- Keep the web app a thin client; product behavior and authorization belong to the API.
- Use `@codelitdev/design-system` for shared visual components and styles.
- Run local dependencies from the repository root with `docker compose -f docker-compose.local.yml up`. Run the API and web app on the host, and do not run this compose file alongside `docker-compose.yml`.
- Use the API and Postgres for product data; do not add another store for the same records.
- Start the web app with `bun --filter @medialit/web dev`.

## PR Review

- Verify the web app adds no login UI, authorization business logic, or auth-related API routes.
- Verify product behavior is implemented by the API and the web app consumes the API's responses and actions.
- Review loading, empty, and error states, along with accessible labels and responsive layouts.
- Check that shared UI follows `@codelitdev/design-system` patterns.
- Run the relevant web checks, such as `bun --filter @medialit/web lint` and `bun --filter @medialit/web build`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
