import { spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants } from "node:fs";
import path from "node:path";

/** Why a limited process didn't finish. */
export class ProcessLimitError extends Error {
    constructor(
        message: string,
        readonly reason: "timeout" | "aborted" | "failed",
        /** For `failed`: how the process ended. A signal means it was
         * killed (for example by the out-of-memory killer), not that it
         * refused its input. */
        readonly exit: { code: number | null; signal: string | null } = {
            code: null,
            signal: null,
        },
    ) {
        super(message);
        this.name = "ProcessLimitError";
    }
}

/** The first executable called `name` on PATH, or null. */
export function findExecutable(
    name: string,
    envPath = process.env.PATH,
): string | null {
    for (const dir of (envPath || "").split(path.delimiter)) {
        if (!dir) continue;
        const candidate = path.join(dir, name);
        try {
            accessSync(candidate, constants.X_OK);
            return candidate;
        } catch {
            // Not here.
        }
    }
    return null;
}

/** Where util-linux installs `prlimit`. Fixed directories, not PATH, so
 * the environment can't choose which binary wraps every conversion. */
const PRLIMIT_DIRS = ["/usr/bin", "/bin", "/usr/local/bin"].join(
    path.delimiter,
);

let warnedNoPrlimit = false;

export interface RunLimitedOptions {
    /** Kill the process group after this long. */
    timeoutMs: number;
    /** Address-space limit, applied with `prlimit --as`. */
    memoryMb?: number;
    /** Kills the process group when it fires. */
    signal?: AbortSignal;
    /** Called once if `prlimit` isn't installed and the memory limit can't
     * be applied. Defaults to a console warning. */
    onNoPrlimit?: () => void;
    /** Directories searched for `prlimit`, joined with the path delimiter.
     * For tests; defaults to the system directories. */
    prlimitDirs?: string;
    /** Keep up to this many bytes of stdout and return them. Stdout is
     * discarded otherwise. */
    captureStdoutBytes?: number;
}

export interface RunLimitedResult {
    /** What the process wrote to stdout, when `captureStdoutBytes` is set. */
    stdout: string;
}

/**
 * Runs `command` with an argument array (never a shell) in its own process
 * group. On timeout or abort it kills the whole group with SIGKILL and waits
 * for the process to exit, so nothing it started outlives the call. With
 * `memoryMb`, the command runs under `prlimit --as`, so a decoder that runs
 * away fails instead of exhausting the host's memory.
 *
 * `prlimit` comes with util-linux. Without it (macOS, minimal containers) the
 * command runs without the memory limit, after one warning.
 */
export function runLimited(
    command: string,
    args: string[],
    options: RunLimitedOptions,
): Promise<RunLimitedResult> {
    let file = command;
    let argv = args;
    if (options.memoryMb && options.memoryMb > 0) {
        const prlimit = findExecutable(
            "prlimit",
            options.prlimitDirs ?? PRLIMIT_DIRS,
        );
        if (prlimit) {
            file = prlimit;
            argv = [
                `--as=${Math.floor(options.memoryMb * 1024 * 1024)}`,
                "--",
                command,
                ...args,
            ];
        } else if (!warnedNoPrlimit) {
            warnedNoPrlimit = true;
            (
                options.onNoPrlimit ??
                (() =>
                    console.warn(
                        `prlimit is not installed: ${command} runs without a memory limit. Install util-linux.`,
                    ))
            )();
        }
    }

    const capture = options.captureStdoutBytes ?? 0;
    return new Promise<RunLimitedResult>((resolve, reject) => {
        if (options.signal?.aborted) {
            reject(new ProcessLimitError(`${command} was aborted`, "aborted"));
            return;
        }
        let child: ChildProcess;
        try {
            child = spawn(file, argv, {
                detached: true,
                shell: false,
                stdio: ["ignore", capture > 0 ? "pipe" : "ignore", "pipe"],
            });
        } catch (err) {
            reject(err);
            return;
        }
        const stdout: Uint8Array[] = [];
        let stdoutBytes = 0;
        child.stdout?.on("data", (data: Buffer) => {
            if (stdoutBytes >= capture) return;
            const part = Uint8Array.from(
                data.subarray(0, capture - stdoutBytes),
            );
            stdout.push(part);
            stdoutBytes += part.length;
        });
        let stderr = "";
        child.stderr?.on("data", (data: Buffer) => {
            if (stderr.length < 2000) stderr += data.toString();
        });
        let killedFor: "timeout" | "aborted" | undefined;
        const killGroup = (reason: "timeout" | "aborted") => {
            if (killedFor) return;
            killedFor = reason;
            try {
                process.kill(-(child.pid as number), "SIGKILL");
            } catch {
                // Already gone.
            }
        };
        const timer = setTimeout(() => killGroup("timeout"), options.timeoutMs);
        const onAbort = () => killGroup("aborted");
        options.signal?.addEventListener("abort", onAbort, { once: true });
        const done = () => {
            clearTimeout(timer);
            options.signal?.removeEventListener("abort", onAbort);
        };
        child.on("error", (err) => {
            done();
            reject(err);
        });
        // "close" waits for stdio to end too, so the group is gone by then.
        child.on("close", (code, signal) => {
            done();
            if (killedFor === "timeout") {
                reject(
                    new ProcessLimitError(
                        `${command} timed out after ${options.timeoutMs} ms`,
                        "timeout",
                    ),
                );
            } else if (killedFor === "aborted") {
                reject(
                    new ProcessLimitError(`${command} was aborted`, "aborted"),
                );
            } else if (code === 0) {
                resolve({ stdout: Buffer.concat(stdout).toString("utf8") });
            } else {
                const detail = stderr
                    .trim()
                    .split("\n")
                    .slice(-3)
                    .join(" ")
                    .slice(0, 300);
                reject(
                    new ProcessLimitError(
                        `${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}${detail ? `: ${detail}` : ""}`,
                        "failed",
                        { code, signal },
                    ),
                );
            }
        });
    });
}

/** For tests: warn again about a missing prlimit. */
export function resetPrlimitWarningForTests(): void {
    warnedNoPrlimit = false;
}
