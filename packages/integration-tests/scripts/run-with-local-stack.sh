#!/usr/bin/env bash
# Boots Postgres, MinIO and Mailpit from docker-compose.local.yml, starts the
# API against a fresh database, and runs the REST, MCP and CLI integration
# tests against it. CI uses this as the pull request gate; run it locally with
#
#   bun run test:integration:stack
#
# It uses its own Compose project and ports, so it does not touch your dev
# stack or apps/api/.env, and removes everything when it finishes. Set
# MEDIALIT_STACK_KEEP=true to leave the stack running for debugging.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

project="${MEDIALIT_STACK_PROJECT:-medialit-integration}"
export POSTGRES_PORT="${POSTGRES_PORT:-5443}"
export MINIO_API_PORT="${MINIO_API_PORT:-9010}"
export MINIO_CONSOLE_PORT="${MINIO_CONSOLE_PORT:-9011}"
export MAILPIT_SMTP_PORT="${MAILPIT_SMTP_PORT:-1035}"
export MAILPIT_HTTP_PORT="${MAILPIT_HTTP_PORT:-8035}"
api_port="${API_PORT:-8010}"
workdir="$(mktemp -d)"
api_log="${API_LOG:-$workdir/api.log}"
compose=(docker compose -p "$project" -f docker-compose.local.yml)
api_pid=""

cleanup() {
    status=$?
    if [[ -n "$api_pid" ]]; then
        kill "$api_pid" 2>/dev/null || true
        wait "$api_pid" 2>/dev/null || true
    fi
    if [[ $status -ne 0 && -f "$api_log" ]]; then
        echo "--- Last 100 lines of the API log ($api_log)"
        tail -n 100 "$api_log"
    fi
    if [[ "${MEDIALIT_STACK_KEEP:-false}" != "true" ]]; then
        "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
        rm -rf "$workdir"
    fi
    exit $status
}
trap cleanup EXIT

echo "--- Starting Postgres, MinIO and Mailpit ($project)"
"${compose[@]}" up -d --wait postgres minio mailpit
"${compose[@]}" run --rm minio-init

# The API's local settings, with this stack's ports.
set -a
# shellcheck source=/dev/null
source apps/api/.env.example
set +a
export DATABASE_URL="postgresql://medialit:medialit@127.0.0.1:${POSTGRES_PORT}/medialit"
export PORT="$api_port"
export PUBLIC_API_URL="http://localhost:${api_port}"
export CLOUD_ENDPOINT="http://127.0.0.1:${MINIO_API_PORT}"
export CLOUD_ENDPOINT_PUBLIC="$CLOUD_ENDPOINT"
export CDN_ENDPOINT="${CLOUD_ENDPOINT}/medialit-public"
export EMAIL_PORT="$MAILPIT_SMTP_PORT"
export TEMP_FILE_DIR_FOR_UPLOADS="$workdir/uploads"
mkdir -p "$TEMP_FILE_DIR_FOR_UPLOADS"

echo "--- Migrating the database"
(cd apps/api && bun src/db/migrate.ts)

echo "--- Starting the API on port $api_port"
(cd apps/api && exec bun src/index.ts) >"$api_log" 2>&1 &
api_pid=$!
for _ in $(seq 1 60); do
    if curl -sf "http://localhost:${api_port}/ready" >/dev/null; then
        break
    fi
    if ! kill -0 "$api_pid" 2>/dev/null; then
        echo "The API exited while starting"
        exit 1
    fi
    sleep 1
done
curl -sf "http://localhost:${api_port}/ready" >/dev/null || {
    echo "The API was not ready after 60 seconds"
    exit 1
}

# On first start, the API creates the EMAIL user and logs its API key.
api_key="$(grep -o '"apiKey":"[^"]*"' "$api_log" | head -n 1 | cut -d '"' -f 4)"
if [[ -z "$api_key" ]]; then
    echo "The API did not log an API key for the admin user"
    exit 1
fi
if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    echo "::add-mask::$api_key"
fi

echo "--- Building the SDK, uploader and CLI"
bun --filter medialit --filter @medialit/uploader --filter @medialit/cli build >/dev/null

echo "--- Running the integration tests"
MEDIALIT_APIKEY="$api_key" MEDIALIT_SERVER="http://localhost:${api_port}" \
    bun --filter @medialit/integration-tests test:all
