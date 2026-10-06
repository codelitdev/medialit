/**
 * Run against a live API with a dedicated key and no concurrent media writes:
 * MEDIALIT_APIKEY=... MEDIALIT_SERVER=localhost:8000 \
 *   bun --filter @medialit/integration-tests test:cli
 *
 * This runs the built `medialit` command (`test:cli` builds it first) the way
 * CI would, with the API key in
 * MEDIALIT_API_KEY and a throwaway config folder. Set MEDIALIT_CLI to test
 * another build, such as an installed `medialit`. It deletes only media
 * created by this run.
 *
 * `medialit login` needs a browser, so it is not completed here. Set
 * MEDIALIT_CLI_TEST_LOGIN=true to check that login can discover the server,
 * register itself and reach the sign-in page. Each such run registers one
 * OAuth client on the server.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generatePng } from "./utils";

type JsonObject = Record<string, unknown>;

interface Stats {
    files: number;
    storage: number;
    maxStorage: number;
}

interface RunResult {
    code: number | null;
    stdout: string;
    stderr: string;
}

const EXPECTED_CLI_COMMANDS = [
    "get",
    "login",
    "logout",
    "ls",
    "rm",
    "seal",
    "upload",
    "whoami",
].sort();

const CLI_PACKAGE = fileURLToPath(new URL("../../cli/", import.meta.url));

function object(value: unknown, label = "value"): JsonObject {
    assert(
        value && typeof value === "object" && !Array.isArray(value),
        `Expected ${label} to be a JSON object`,
    );
    return value as JsonObject;
}

function nonemptyText(value: unknown, label: string): string {
    assert(
        typeof value === "string" && value.length > 0,
        `${label} must be a nonempty string`,
    );
    return value;
}

function integer(value: unknown, label: string): number {
    assert(
        typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
        `${label} must be a nonnegative integer`,
    );
    return value;
}

export async function runCliIntegrationTests(
    options: {
        apiKey?: string;
        server?: string;
        cli?: string;
        testLogin?: boolean;
        log?: (message: string) => void;
    } = {},
): Promise<void> {
    const apiKey = options.apiKey ?? process.env.MEDIALIT_APIKEY;
    assert(
        typeof apiKey === "string" && apiKey.trim(),
        "MEDIALIT_APIKEY is required",
    );
    const server =
        options.server ?? process.env.MEDIALIT_SERVER ?? "localhost:8000";
    const base = new URL(
        /^https?:\/\//i.test(server) ? server : `http://${server}`,
    );
    assert(
        ["http:", "https:"].includes(base.protocol),
        "MEDIALIT_SERVER must use HTTP or HTTPS",
    );
    assert(
        !base.username && !base.password && !base.search && !base.hash,
        "MEDIALIT_SERVER must be a base URL without credentials, query, or fragment",
    );
    const endpoint = `${base.origin}${base.pathname.replace(/\/+$/, "")}`;
    const cli = options.cli ?? process.env.MEDIALIT_CLI;
    const builtCli = join(CLI_PACKAGE, "dist", "index.mjs");
    if (!cli) {
        assert(
            existsSync(builtCli),
            "No CLI to test. Set MEDIALIT_CLI to the medialit command, or run `bun --filter @medialit/cli build` in the MediaLit repository.",
        );
    }
    const testLogin =
        options.testLogin ?? process.env.MEDIALIT_CLI_TEST_LOGIN === "true";
    const log = options.log ?? console.log;
    const group = `__cli_integration_${randomUUID()}`;
    const png = generatePng();
    const pending = new Set<string>();
    const workDir = await mkdtemp(join(tmpdir(), "medialit-cli-it-"));
    const configDir = join(workDir, "config");
    let baseline: Stats | undefined;
    let uploadAttempted = false;
    let failure: unknown;
    const cleanupErrors: unknown[] = [];

    function redact(value: string): string {
        return value.split(apiKey!).join("[redacted]");
    }

    /** Runs the CLI as a user would, in its own config folder. */
    function medialit(
        args: string[],
        env: { apiKey?: string | null } = {},
    ): Promise<RunResult> {
        const [command, commandArgs] = cli
            ? [cli, args]
            : [process.env.MEDIALIT_NODE ?? "node", [builtCli, ...args]];
        const childEnv: NodeJS.ProcessEnv = {
            ...process.env,
            MEDIALIT_CONFIG_DIR: configDir,
            MEDIALIT_ENDPOINT: endpoint,
        };
        delete childEnv.MEDIALIT_API_KEY;
        if (env.apiKey !== null) childEnv.MEDIALIT_API_KEY = apiKey;

        return new Promise((resolve, reject) => {
            const child = spawn(command, commandArgs, {
                env: childEnv,
                stdio: ["ignore", "pipe", "pipe"],
            });
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", (chunk) => (stdout += chunk));
            child.stderr.on("data", (chunk) => (stderr += chunk));
            const timeout = setTimeout(() => {
                child.kill();
                reject(
                    new Error(`medialit ${args.join(" ")} timed out after 60s`),
                );
            }, 60_000);
            child.on("error", (error) => {
                clearTimeout(timeout);
                reject(error);
            });
            child.on("close", (code) => {
                clearTimeout(timeout);
                resolve({ code, stdout, stderr });
            });
        });
    }

    async function ok(args: string[]): Promise<RunResult> {
        const result = await medialit(args);
        if (result.code !== 0) {
            throw new Error(
                `medialit ${args.join(" ")}: exited with ${result.code}: ${redact(
                    result.stderr,
                ).slice(0, 1000)}`,
            );
        }
        return result;
    }

    async function json(args: string[]): Promise<unknown> {
        const result = await ok([...args, "--json"]);
        try {
            return JSON.parse(result.stdout);
        } catch {
            throw new Error(
                `medialit ${args.join(" ")} --json printed invalid JSON`,
            );
        }
    }

    async function fails(
        args: string[],
        message: RegExp,
        env?: { apiKey?: string | null },
    ): Promise<void> {
        const result = await medialit(args, env);
        assert.equal(
            result.code,
            1,
            `medialit ${args.join(" ")} must exit with 1`,
        );
        assert.match(result.stderr, /^error: /m);
        assert.match(result.stderr, message);
        assert.equal(result.stdout, "", "Errors must not print to stdout");
    }

    async function stats(): Promise<Stats> {
        const info = object(await json(["whoami"]), "whoami");
        assert.equal(info.endpoint, endpoint);
        assert.equal(info.auth, "api-key");
        return {
            files: integer(info.files, "files"),
            storage: integer(info.storage, "storage"),
            maxStorage: integer(info.maxStorage, "maxStorage"),
        };
    }

    async function list(...filters: string[]): Promise<JsonObject[]> {
        const result = await json(["ls", "--group", group, ...filters]);
        assert(Array.isArray(result), "ls --json must print an array");
        return result.map((media) => object(media, "media item"));
    }

    async function checkTotals(bytes: number, files: number): Promise<void> {
        assert(baseline);
        const current = await stats();
        assert.equal(current.maxStorage, baseline.maxStorage);
        assert.equal(current.storage, baseline.storage + bytes);
        assert.equal(current.files, baseline.files + files);
    }

    async function writeImage(name: string): Promise<string> {
        const path = join(workDir, name);
        await writeFile(path, Uint8Array.from(png));
        return path;
    }

    async function download(url: string): Promise<Buffer> {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(30_000),
        });
        assert.equal(
            response.status,
            200,
            `Downloading ${new URL(url).pathname} failed`,
        );
        return Buffer.from(await response.arrayBuffer());
    }

    function checkMedia(
        media: JsonObject,
        expected: { name: string; access: string; caption?: string },
    ): string {
        const mediaId = nonemptyText(media.mediaId, "mediaId");
        assert.equal(media.originalFileName, expected.name);
        assert.equal(media.mimeType, "image/png");
        assert.equal(media.size, png.length);
        assert.equal(media.access, expected.access);
        assert.equal(media.group, group);
        if (expected.caption) assert.equal(media.caption, expected.caption);
        nonemptyText(media.file, "file URL");
        return mediaId;
    }

    log(`MediaLit CLI integration run ${group} against ${endpoint}`);
    try {
        const version = (await ok(["--version"])).stdout.trim();
        if (!cli) {
            const pkg = JSON.parse(
                await readFile(join(CLI_PACKAGE, "package.json"), "utf8"),
            );
            assert.equal(version, pkg.version);
        }
        const help = (await ok(["--help"])).stdout;
        const commandsSection = help.split(/\n\s*\n/)[1] ?? "";
        const commands = commandsSection
            .split("\n")
            .slice(1)
            .map((line) => line.trim().split(/\s+/)[0])
            .filter(Boolean)
            .sort();
        assert.deepEqual(
            commands,
            EXPECTED_CLI_COMMANDS,
            "CLI command inventory changed; update this integration test and exercise every command",
        );
        log(
            `PASS medialit ${version}: --version and complete command inventory`,
        );

        await fails(["ls"], /Not logged in to .*medialit login/, {
            apiKey: null,
        });
        await fails(["frobnicate"], /Unknown command "frobnicate"/);
        await fails(["get"], /Pass one media ID/);
        await fails(["upload"], /Pass at least one file/);
        await fails(["upload", join(workDir, "missing.png")], /is not a file/);
        log("PASS errors go to stderr with exit code 1");

        baseline = await stats();
        assert(
            baseline.maxStorage - baseline.storage >= png.length * 3,
            "Insufficient available storage for the CLI uploads",
        );
        assert.deepEqual(await list(), [], "Run group already contains media");
        log("PASS whoami with MEDIALIT_API_KEY and ls baseline");

        const tempName = `${group}-temp.png`;
        const caption = `${group}: CLI integration upload`;
        uploadAttempted = true;
        const tempUploads = await json([
            "upload",
            await writeImage(tempName),
            "--temp",
            "--group",
            group,
            "--caption",
            caption,
        ]);
        assert(Array.isArray(tempUploads) && tempUploads.length === 1);
        const tempId = checkMedia(object(tempUploads[0]), {
            name: tempName,
            access: "private",
            caption,
        });
        pending.add(tempId);
        assert.deepEqual(await list(), [], "--temp uploads must stay hidden");
        await checkTotals(0, 0);
        log("PASS upload --temp leaves the upload temporary and hidden");

        const sealed = object(await json(["seal", tempId]), "sealed media");
        assert.equal(sealed.mediaId, tempId);
        assert.deepEqual(
            (await list()).map((media) => media.mediaId),
            [tempId],
        );
        await checkTotals(png.length, 1);
        const fetched = object(await json(["get", tempId]), "media");
        checkMedia(fetched, { name: tempName, access: "private", caption });
        const privateUrl = (await ok(["get", tempId])).stdout.trim();
        assert.match(privateUrl, /^https?:\/\//);
        assert.deepEqual(await download(privateUrl), png);
        log("PASS seal, get --json, get URL download and storage/count totals");

        // Without --json, stdout carries only URLs so it can be piped.
        const publicNames = [`${group}-a.png`, `${group}-b.png`];
        const human = await ok([
            "upload",
            await writeImage(publicNames[0]),
            await writeImage(publicNames[1]),
            "--public",
            "--group",
            group,
        ]);
        const urls = human.stdout.trim().split("\n");
        assert.equal(urls.length, 2, "upload must print one URL per file");
        for (const url of urls) assert.match(url, /^https?:\/\//);
        const publicIds = publicNames.map((name) => {
            const line = human.stderr
                .split("\n")
                .find((entry) => entry.startsWith(`${name}  `));
            return nonemptyText(line?.split(/\s+/)[1], `${name} mediaId`);
        });
        publicIds.forEach((id) => pending.add(id));
        for (const url of urls) assert.deepEqual(await download(url), png);
        await checkTotals(png.length * 3, 3);
        log("PASS upload of several files seals them and prints only URLs");

        const publicListed = (await list("--public")).map((m) => m.mediaId);
        assert.deepEqual([...publicListed].sort(), [...publicIds].sort());
        const privateListed = (await list("--private")).map((m) => m.mediaId);
        assert.deepEqual(privateListed, [tempId]);
        const firstPage = await list("--limit", "2", "--page", "1");
        const secondPage = await list("--limit", "2", "--page", "2");
        assert.equal(firstPage.length, 2);
        assert.equal(secondPage.length, 1);
        assert.deepEqual(
            [...firstPage, ...secondPage].map((m) => m.mediaId).sort(),
            [tempId, ...publicIds].sort(),
        );
        const table = (await ok(["ls", "--group", group])).stdout;
        for (const id of [tempId, ...publicIds])
            assert.match(table, new RegExp(id));
        log("PASS ls filters (--public, --private, --group), paging and table");

        for (const id of [tempId, ...publicIds]) {
            const deleted = object(await json(["rm", id]), "rm result");
            assert.equal(deleted.deleted, true);
            assert.equal(deleted.mediaId, id);
            pending.delete(id);
        }
        await fails(["get", tempId], /./);
        assert.deepEqual(await list(), []);
        await checkTotals(0, 0);
        log("PASS rm and restored storage/count totals");

        if (testLogin) {
            await checkLoginReachesSignIn();
            log(
                "PASS login discovers the server, registers and reaches sign-in",
            );
        } else {
            log("SKIP login (set MEDIALIT_CLI_TEST_LOGIN=true to check it)");
        }
    } catch (error) {
        failure = error;
    } finally {
        for (const mediaId of pending) {
            try {
                await ok(["rm", mediaId]);
                pending.delete(mediaId);
                log(`CLEANUP deleted ${mediaId}`);
            } catch (error) {
                cleanupErrors.push(error);
                log(`CLEANUP FAILED for ${mediaId}: ${String(error)}`);
            }
        }
        if (uploadAttempted && baseline) {
            try {
                assert.deepEqual(
                    await list(),
                    [],
                    "Run media remains after cleanup",
                );
                await checkTotals(0, 0);
            } catch (error) {
                cleanupErrors.push(error);
                log(`CLEANUP verification failed: ${String(error)}`);
            }
        }
        await rm(workDir, { recursive: true, force: true }).catch(
            (error: unknown) => cleanupErrors.push(error),
        );
    }

    if (failure) throw failure;
    if (cleanupErrors.length) {
        throw new AggregateError(
            cleanupErrors,
            "CLI integration cleanup failed",
        );
    }
    log("PASS MediaLit CLI lifecycle; media and config cleaned up");

    /**
     * Starts `medialit login --no-browser`, then follows the printed URL the
     * way a browser would until it reaches the sign-in page.
     */
    async function checkLoginReachesSignIn(): Promise<void> {
        const [command, args] = cli
            ? [cli, ["login", "--no-browser"]]
            : [
                  process.env.MEDIALIT_NODE ?? "node",
                  [builtCli, "login", "--no-browser"],
              ];
        const childEnv: NodeJS.ProcessEnv = {
            ...process.env,
            MEDIALIT_CONFIG_DIR: join(workDir, "login-config"),
            MEDIALIT_ENDPOINT: endpoint,
        };
        delete childEnv.MEDIALIT_API_KEY;
        const child = spawn(command, args, {
            env: childEnv,
            stdio: ["ignore", "pipe", "pipe"],
        });
        try {
            const authorizeUrl = await new Promise<string>(
                (resolve, reject) => {
                    let stderr = "";
                    const timeout = setTimeout(
                        () => reject(new Error("login did not print a URL")),
                        30_000,
                    );
                    child.stderr.on("data", (chunk) => {
                        stderr += chunk;
                        const match = stderr.match(
                            /https?:\/\/\S+authorize\?\S+/,
                        );
                        if (match) {
                            clearTimeout(timeout);
                            resolve(match[0]);
                        }
                    });
                    child.on("close", (code) => {
                        clearTimeout(timeout);
                        reject(
                            new Error(
                                `login exited with ${code} before printing a URL: ${stderr.slice(0, 1000)}`,
                            ),
                        );
                    });
                },
            );

            const url = new URL(authorizeUrl);
            assert.equal(url.searchParams.get("code_challenge_method"), "S256");
            assert.match(
                url.searchParams.get("redirect_uri") ?? "",
                /^http:\/\/127\.0\.0\.1:\d+\/callback$/,
            );
            nonemptyText(url.searchParams.get("client_id"), "client_id");

            const response = await fetch(url, {
                redirect: "manual",
                signal: AbortSignal.timeout(30_000),
            });
            assert(
                response.status >= 300 && response.status < 400,
                `The authorize URL must redirect to sign-in, got ${response.status}`,
            );
            const location = new URL(
                nonemptyText(response.headers.get("location"), "Location"),
                url,
            );
            assert.doesNotMatch(
                location.search,
                /[?&]error=/,
                `The server rejected the login request: ${location.search}`,
            );
            const signIn = await fetch(location, {
                signal: AbortSignal.timeout(30_000),
            });
            assert.equal(signIn.status, 200);
            assert.match(await signIn.text(), /Sign in/i);
        } finally {
            child.kill();
        }
    }
}
