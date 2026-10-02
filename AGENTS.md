## Dev Environment

- Use `bun` as the package manager (Bun 1.4.1)
- This is a monorepo — use `bun --filter <package-name> <command>` for specific packages
- The API owns product behavior. The web app is a thin client over the API
- Postgres is the database (`DATABASE_URL`). Do not add a second data store for the same records
- Local dependencies run from `docker compose -f docker-compose.local.yml up` (Postgres, MinIO, Mailpit). The API and web app run on the host. Do not run that file together with `docker-compose.yml`
