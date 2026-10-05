# @medialit/integration-tests

End-to-end tests and a synthetic check for a [MediaLit](https://medialit.cloud) server, hosted or self-hosted.

## Synthetic check

A quick check that MediaLit works end to end. It checks `/ready`, then uploads a tiny public image, seals it, downloads it and deletes it, in about a second. It is safe to run against production every few minutes.

```bash
MEDIALIT_APIKEY=... MEDIALIT_SERVER=https://medialit.example.com \
  npx @medialit/integration-tests@0.1.0 synthetic
```

- Use the API key of an app that exists only for monitoring. The synthetic check never changes settings and only deletes files in its own `__synthetic_` groups, including leftovers from runs that were cut short.
- Set `MEDIALIT_SYNTHETIC_HEARTBEAT_URL` to a heartbeat monitor such as Better Stack or Healthchecks.io. The synthetic check requests the URL after each passing run and `<url>/fail` after a failing one, so you are alerted when MediaLit fails and when the synthetic check stops running.
- It exits with 1 when a step fails, and names the step and the reason.
- Pin the version. The monitoring key is in the synthetic check's environment, so don't run whatever version is newest.

## Test suites

The suites cover the REST API, the MCP server and the CLI in depth. They upload files, change media settings and restore them, so run them against a test app with no other activity.

```bash
MEDIALIT_APIKEY=... MEDIALIT_SERVER=localhost:8000 \
  npx @medialit/integration-tests@0.1.0 all
```

| Command     | Runs                                                                 |
| ----------- | -------------------------------------------------------------------- |
| `synthetic` | The synthetic check                                                  |
| `all`       | The REST, MCP and CLI suites                                         |
| `rest`      | The REST API suite                                                   |
| `mcp`       | The MCP server suite                                                 |
| `cli`       | The CLI suite. Set `MEDIALIT_CLI` to the `medialit` command to test. |

In the MediaLit repository, run them with `bun run test:integration`, or `bun --filter @medialit/integration-tests <script>` with `synthetic`, `test:rest`, `test:mcp` or `test:cli`.

To run all three suites against a fresh local stack (Postgres, MinIO and Mailpit from `docker-compose.local.yml`, plus the API), the same way the pull request check does, run `bun run test:integration:stack` from the repository root. It needs Docker, uses its own ports, and leaves your dev stack and `apps/api/.env` alone.
