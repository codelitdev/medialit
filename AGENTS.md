## Dev Environment

- Use `pnpm` as the package manager
- This is a monorepo — use `pnpm --filter <package-name> <command>` for specific packages
- MCP tools must reuse the API’s shared service, validation, and storage helpers, and should remain thin adapters over the same media services used by REST handlers. This is to keep lifecycle behavior, quota checks, access checks, thumbnails, cleanup, and conflict handling consistent.
