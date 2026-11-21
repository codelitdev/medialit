#!/usr/bin/env bash
# Boots Postgres, MinIO and Mailpit from docker-compose.local.yml, starts the
# API and the worker against a fresh database, runs the job queue tests
# against that Postgres, and runs the REST, MCP and CLI integration tests
# against the API. CI uses this as the pull request gate; run it locally with
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
worker_port="${WORKER_PORT:-8011}"
workdir="$(mktemp -d)"
api_log="${API_LOG:-$workdir/api.log}"
worker_log="${WORKER_LOG:-$workdir/worker.log}"
compose=(docker compose -p "$project" -f docker-compose.local.yml)
api_pid=""
worker_pid=""

cleanup() {
    status=$?
    for pid in "$api_pid" "$worker_pid"; do
        if [[ -n "$pid" ]]; then
            kill "$pid" 2>/dev/null || true
            wait "$pid" 2>/dev/null || true
        fi
    done
    if [[ $status -ne 0 && -f "$api_log" ]]; then
        echo "--- Last 100 lines of the API log ($api_log)"
        tail -n 100 "$api_log"
    fi
    if [[ $status -ne 0 && -f "$worker_log" ]]; then
        echo "--- Last 100 lines of the worker log ($worker_log)"
        tail -n 100 "$worker_log"
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
# Cloud mode with no billing provider: the test account is on Basic, so the
# MCP suite checks that the storage limit comes from the account's plan.
# The limit is set to an unusual value so it can't match by accident.
export MEDIALIT_DEPLOYMENT_MODE=cloud
export MAX_STORAGE_ALLOWED_NOT_SUBSCRIBED=1234567890
mkdir -p "$TEMP_FILE_DIR_FOR_UPLOADS"
# The API seeds this key for the EMAIL user at startup, the same way a bundled
# self-hosted install gets its key. It is never logged.
api_key="ml_live_$(openssl rand -hex 32)"
export MEDIALIT_BOOTSTRAP_API_KEY="$api_key"
if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    echo "::add-mask::$api_key"
fi

echo "--- Migrating the database"
(cd apps/api && bun src/db/migrate.ts)

echo "--- Running the job queue tests against this Postgres"
# They create and drop databases of their own on the same server.
(cd apps/api && JOBS_TEST_DATABASE_URL="$DATABASE_URL" bun run test:pg)

# wait_ready <name> <pid> <port>
wait_ready() {
    for _ in $(seq 1 60); do
        if curl -sf "http://localhost:$3/ready" >/dev/null; then
            return 0
        fi
        if ! kill -0 "$2" 2>/dev/null; then
            echo "The $1 exited while starting"
            exit 1
        fi
        sleep 1
    done
    echo "The $1 was not ready after 60 seconds"
    exit 1
}

echo "--- Starting the API on port $api_port"
(cd apps/api && exec bun src/index.ts) >"$api_log" 2>&1 &
api_pid=$!
wait_ready API "$api_pid" "$api_port"

echo "--- Starting the worker on port $worker_port"
(cd apps/api && WORKER_PORT="$worker_port" exec bun src/worker.ts) >"$worker_log" 2>&1 &
worker_pid=$!
wait_ready worker "$worker_pid" "$worker_port"

echo "--- Building the SDK, uploader and CLI"
bun --filter medialit --filter @medialit/uploader --filter @medialit/cli build >/dev/null

echo "--- Running the integration tests"
MEDIALIT_APIKEY="$api_key" MEDIALIT_SERVER="http://localhost:${api_port}" \
    MEDIALIT_EXPECTED_MAX_STORAGE="$MAX_STORAGE_ALLOWED_NOT_SUBSCRIBED" \
    bun --filter @medialit/integration-tests test:all

echo "--- Checking that the worker ran the periodic cleanup jobs"
for type in uploads.tus_cleanup media.temp_cleanup media.stale_upload_cleanup jobs.prune; do
    ran=""
    for _ in $(seq 1 30); do
        ran="$("${compose[@]}" exec -T postgres psql -U medialit -d medialit -Atc \
            "SELECT count(*) FROM jobs WHERE type = '$type' AND status = 'succeeded'")"
        [[ "$ran" -ge 1 ]] && break
        sleep 1
    done
    if [[ "$ran" -lt 1 ]]; then
        echo "The worker did not run $type"
        exit 1
    fi
done

echo "--- Checking the jobs command against the stack's Postgres"
stats="$(cd apps/api && bun run --silent jobs stats)"
echo "$stats"
grep -Eq "^jobs\.prune +[0-9]+ +[0-9]+ +[1-9]" <<<"$stats" || {
    echo "jobs stats did not count the succeeded jobs.prune run"
    exit 1
}
grep -q "Live workers: 1" <<<"$stats" || {
    echo "jobs stats did not count the running worker"
    exit 1
}
(cd apps/api && bun run --silent jobs workers) | grep -Eq "cpu,io .* yes$" || {
    echo "jobs workers did not list the running worker as live"
    exit 1
}
(cd apps/api && bun run --silent jobs list --status succeeded --type jobs.prune) |
    grep -q "jobs.prune" || {
    echo "jobs list did not find the jobs.prune run"
    exit 1
}
