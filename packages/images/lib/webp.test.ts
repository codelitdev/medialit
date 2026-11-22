import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, describe, test } from "node:test";
import {
    DEFAULT_IMAGE_LIMITS,
    imageLimitsFromEnv,
    type ImageLimits,
} from "./limits";
import { findExecutable, runLimited } from "./process";
import { Slots } from "./slots";
import { convertToWebp } from "./webp";
import { makePng } from "./test-helpers";

let dir: string;
let fakeBin: string;
const realPath = process.env.PATH;
const hasRealCwebp = Boolean(findExecutable("cwebp"));

function limits(overrides: Partial<ImageLimits> = {}): ImageLimits {
    return { ...DEFAULT_IMAGE_LIMITS, ...overrides };
}

/** Puts a fake `cwebp` first on PATH. It logs each call to calls.log. */
async function fakeCwebp(body: string): Promise<void> {
    const script = path.join(fakeBin, "cwebp");
    await writeFile(
        script,
        `#!/bin/sh\necho "$$ $*" >> "${path.join(dir, "calls.log")}"\n${body}\n`,
    );
    await chmod(script, 0o755);
    process.env.PATH = `${fakeBin}${path.delimiter}${realPath}`;
}

async function calls(): Promise<string[]> {
    try {
        return (await readFile(path.join(dir, "calls.log"), "utf8"))
            .trim()
            .split("\n")
            .filter(Boolean);
    } catch {
        return [];
    }
}

function alive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

before(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "images-webp-"));
    fakeBin = path.join(dir, "bin");
    execFileSync("mkdir", ["-p", fakeBin]);
});

afterEach(async () => {
    process.env.PATH = realPath;
    await rm(path.join(dir, "calls.log"), { force: true });
    await rm(path.join(fakeBin, "cwebp"), { force: true });
});

after(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe("imageLimitsFromEnv", () => {
    test("uses the defaults when nothing is set", () => {
        assert.deepEqual(imageLimitsFromEnv({}), {
            maxInputBytes: 25 * 1024 * 1024,
            maxPixels: 50_000_000,
            maxMemoryMb: 1024,
            timeoutMs: 30_000,
            concurrency: 2,
            queueWaitMs: 10_000,
        });
    });

    test("reads every variable and ignores invalid ones", () => {
        assert.deepEqual(
            imageLimitsFromEnv({
                WEBP_MAX_INPUT_BYTES: "100",
                WEBP_MAX_PIXELS: "200",
                WEBP_MAX_MEMORY_MB: "64",
                WEBP_TIMEOUT_MS: "500",
                WEBP_CONCURRENCY: "abc",
                WEBP_QUEUE_WAIT_MS: "-1",
            }),
            {
                maxInputBytes: 100,
                maxPixels: 200,
                maxMemoryMb: 64,
                timeoutMs: 500,
                concurrency: 2,
                queueWaitMs: 10_000,
            },
        );
    });
});

describe("convertToWebp", () => {
    test(
        "converts a PNG with the real cwebp",
        { skip: !hasRealCwebp && "cwebp is not installed" },
        async () => {
            const input = path.join(dir, "real.png");
            const output = path.join(dir, "real.webp");
            await writeFile(input, makePng(64, 32));
            const result = await convertToWebp(input, output, {
                quality: 80,
                limits: limits(),
                slots: new Slots(1),
            });
            assert.equal(result.status, "converted");
            const bytes = await readFile(output);
            assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
            assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
            assert.equal(
                result.status === "converted" && result.size,
                bytes.length,
            );
        },
    );

    test("skips an image over the byte limit without running cwebp", async () => {
        await fakeCwebp("exit 0");
        const input = path.join(dir, "big.png");
        await writeFile(input, makePng(64, 64));
        const result = await convertToWebp(input, path.join(dir, "big.webp"), {
            quality: 75,
            limits: limits({ maxInputBytes: 10 }),
            slots: new Slots(1),
        });
        assert.equal(result.status, "skipped");
        assert.equal(result.status === "skipped" && result.reason, "too_large");
        assert.deepEqual(await calls(), []);
    });

    test("skips a small PNG with huge dimensions without decoding it", async () => {
        await fakeCwebp("exit 0");
        const input = path.join(dir, "bomb.png");
        await writeFile(input, makePng(30_000, 30_000, 1));
        const result = await convertToWebp(input, path.join(dir, "bomb.webp"), {
            quality: 75,
            limits: limits(),
            slots: new Slots(1),
        });
        assert.equal(result.status, "skipped");
        assert.equal(
            result.status === "skipped" && result.reason,
            "too_many_pixels",
        );
        assert.deepEqual(await calls(), [], "no decoder was started");
    });

    test("fails, without throwing, when cwebp fails or the header is unreadable", async () => {
        await fakeCwebp("echo broken >&2; exit 3");
        const input = path.join(dir, "fail.png");
        await writeFile(input, makePng(8, 8));
        const failed = await convertToWebp(input, path.join(dir, "fail.webp"), {
            quality: 75,
            limits: limits(),
            slots: new Slots(1),
        });
        assert.equal(failed.status, "failed");
        assert.equal(failed.status === "failed" && failed.reason, "failed");
        assert.match(
            failed.status === "failed" ? failed.message : "",
            /code 3: broken/,
        );

        const text = path.join(dir, "text.png");
        await writeFile(text, "hello, not a png");
        const unreadable = await convertToWebp(
            text,
            path.join(dir, "text.webp"),
            {
                quality: 75,
                limits: limits(),
                slots: new Slots(1),
            },
        );
        assert.equal(unreadable.status, "failed");
    });

    test("passes paths as arguments, never through a shell", async () => {
        await fakeCwebp('cp "$4" "$6"');
        const input = path.join(dir, "a $(touch pwned) ;b.png");
        await writeFile(input, makePng(4, 4));
        const output = path.join(dir, "out `touch pwned2`.webp");
        const result = await convertToWebp(input, output, {
            quality: 75,
            limits: limits(),
            slots: new Slots(1),
        });
        assert.equal(result.status, "converted");
        assert.equal(findExecutable("pwned", dir), null);
        await assert.rejects(readFile(path.join(dir, "pwned")));
        await assert.rejects(readFile(path.join(process.cwd(), "pwned")));
    });

    test("a timeout kills the whole process group", async () => {
        const pids = path.join(dir, "pids");
        await fakeCwebp(`sleep 30 & echo $! > "${pids}"; sleep 30`);
        const input = path.join(dir, "slow.png");
        await writeFile(input, makePng(4, 4));
        const started = Date.now();
        const result = await convertToWebp(input, path.join(dir, "slow.webp"), {
            quality: 75,
            limits: limits({ timeoutMs: 300 }),
            slots: new Slots(1),
        });
        assert.ok(Date.now() - started < 5000);
        assert.equal(result.status, "failed");
        assert.equal(result.status === "failed" && result.reason, "timeout");
        const [call] = await calls();
        const cwebpPid = Number(call.split(" ")[0]);
        const childPid = Number((await readFile(pids, "utf8")).trim());
        assert.equal(alive(cwebpPid), false, "cwebp is gone");
        assert.equal(alive(childPid), false, "its child is gone");
    });

    test("an abort kills the conversion and rejects", async () => {
        await fakeCwebp("sleep 30");
        const input = path.join(dir, "abort.png");
        await writeFile(input, makePng(4, 4));
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 100);
        await assert.rejects(
            convertToWebp(input, path.join(dir, "abort.webp"), {
                quality: 75,
                limits: limits(),
                slots: new Slots(1),
                signal: controller.signal,
            }),
            (err: any) => err.reason === "aborted",
        );
        const [call] = await calls();
        assert.equal(alive(Number(call.split(" ")[0])), false);
    });

    test("conversions beyond the concurrency limit are skipped as busy after the queue wait", async () => {
        await fakeCwebp('sleep 0.6; cp "$4" "$6"');
        const input = path.join(dir, "busy.png");
        await writeFile(input, makePng(4, 4));
        const slots = new Slots(2);
        const options = {
            quality: 75,
            limits: limits({ concurrency: 2, queueWaitMs: 100 }),
            slots,
        };
        const results = await Promise.all(
            [1, 2, 3].map((n) =>
                convertToWebp(input, path.join(dir, `busy-${n}.webp`), options),
            ),
        );
        assert.deepEqual(results.map((r) => r.status).sort(), [
            "converted",
            "converted",
            "skipped",
        ]);
        const busy = results.find((r) => r.status === "skipped");
        assert.equal(busy?.status === "skipped" && busy.reason, "busy");
        assert.equal((await calls()).length, 2, "only two conversions ran");
        assert.equal(slots.inUse, 0);
    });

    test("a waiting conversion gets the slot once one frees up", async () => {
        await fakeCwebp('sleep 0.2; cp "$4" "$6"');
        const input = path.join(dir, "wait.png");
        await writeFile(input, makePng(4, 4));
        const options = {
            quality: 75,
            limits: limits({ queueWaitMs: 5000 }),
            slots: new Slots(1),
        };
        const results = await Promise.all(
            [1, 2].map((n) =>
                convertToWebp(input, path.join(dir, `wait-${n}.webp`), options),
            ),
        );
        assert.deepEqual(
            results.map((r) => r.status),
            ["converted", "converted"],
        );
    });
});

describe("runLimited", () => {
    test(
        "applies the memory limit with prlimit",
        { skip: !findExecutable("prlimit") && "prlimit is not installed" },
        async () => {
            // `sh -c ulimit -v` prints the address-space limit in KiB.
            const out = path.join(dir, "ulimit");
            await runLimited("sh", ["-c", `ulimit -v > "${out}"`], {
                timeoutMs: 5000,
                memoryMb: 64,
            });
            assert.equal(
                (await readFile(out, "utf8")).trim(),
                String(64 * 1024),
            );
        },
    );

    test("runs without the memory limit, after one warning, when prlimit is missing", async () => {
        const { resetPrlimitWarningForTests } = await import("./process");
        resetPrlimitWarningForTests();
        const warnings: string[] = [];
        const shDir = path.dirname(findExecutable("sh") as string);
        process.env.PATH = path.join(dir, "empty");
        const out = path.join(dir, "noprlimit");
        await runLimited(path.join(shDir, "sh"), ["-c", `echo ok > "${out}"`], {
            timeoutMs: 5000,
            memoryMb: 64,
            onNoPrlimit: () => warnings.push("no prlimit"),
        });
        await runLimited(path.join(shDir, "sh"), ["-c", "true"], {
            timeoutMs: 5000,
            memoryMb: 64,
            onNoPrlimit: () => warnings.push("no prlimit"),
        });
        assert.equal((await readFile(out, "utf8")).trim(), "ok");
        assert.deepEqual(warnings, ["no prlimit"]);
    });
});

describe("Slots", () => {
    test("never hands out more than its size and serves waiters in order", async () => {
        const slots = new Slots(1);
        const first = await slots.acquire(0);
        assert.ok(first);
        assert.equal(await slots.acquire(0), null);
        const order: number[] = [];
        const a = slots.acquire(1000).then((r) => (order.push(1), r));
        const b = slots.acquire(1000).then((r) => (order.push(2), r));
        first!();
        first!(); // a second release does nothing
        const ra = await a;
        assert.equal(slots.inUse, 1);
        ra!();
        const rb = await b;
        rb!();
        assert.deepEqual(order, [1, 2]);
        assert.equal(slots.inUse, 0);
        assert.equal(slots.waiting, 0);
    });

    test("an aborted wait gives up and leaves the queue", async () => {
        const slots = new Slots(1);
        const held = await slots.acquire(0);
        const controller = new AbortController();
        const waiting = slots.acquire(10_000, controller.signal);
        controller.abort();
        assert.equal(await waiting, null);
        assert.equal(slots.waiting, 0);
        held!();
        assert.equal(slots.inUse, 0);
    });
});
