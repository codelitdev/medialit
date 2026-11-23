/**
 * Seal (pipelines-phase-0.md, D5): claim the media, convert it to WebP when
 * the app asks for it, publish it to its final keys, and commit, holding no
 * transaction, row lock or pool connection while converting or copying.
 */
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { convertToWebp, ProcessLimitError } from "@medialit/images";
import { Constants, type MediaWithUserId } from "@medialit/models";
import {
    DISABLE_TAGGING,
    cloudBucket,
    cloudPublicBucket,
    imagePattern,
    tempFileDirForUploads,
    DEFAULT_WEBP_QUALITY,
} from "../config/constants";
import { NOT_ENOUGH_STORAGE } from "../config/strings";
import {
    copyObject,
    deleteObject,
    downloadObject,
    generateSignedUrl,
    getObjectHead,
    getObjectTagging,
    headObject,
    putObject,
    type CopyParams,
} from "../services/s3";
import logger, { captureException } from "../services/log";
import { imageMetadata, probeMedia, type MediaMetadata } from "./probe";
import { describeError } from "../jobs/errors";
import { trackEvent } from "../services/events";
import { mediaKind } from "./kind";
import {
    resolveAccountPlan,
    storageLimitFor,
    type AccountPlan,
} from "../billing/entitlements";
import { effectiveVideoSettings } from "../media-settings/video";
import { planProcessing } from "./processing-plan";
import { getMediaSettings } from "../media-settings/queries";
import { recordWebpBusy } from "../operations/checks";
import { claimSeal, commitSeal, releaseSealClaim, renewSealClaim } from "@/db";
import { afterSealCommit } from "./derivatives";
import { getMedia, getTotalSpace } from "./queries";
import generateKey from "./utils/generate-key";
import { webpLimits, webpSlots } from "./webp-limits";

/** Thrown when another request holds the seal and didn't finish within
 * `SEAL_WAIT_MS`. The first seal still completes; retrying returns it. */
export const SEAL_IN_PROGRESS =
    "The media is being sealed by another request. Try again shortly.";

export interface SealConfig {
    /** How long a claim lasts without renewal. */
    claimMs: number;
    /** How long a seal waits for another seal's claim. */
    waitMs: number;
    /** How often a waiting seal checks again. */
    pollMs: number;
}

function positive(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return value && Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** `SEAL_CLAIM_MS` (120 s) and `SEAL_WAIT_MS` (15 s), read on each seal. */
export function sealConfig(): SealConfig {
    return {
        claimMs: positive(process.env.SEAL_CLAIM_MS, 120_000),
        waitMs: positive(process.env.SEAL_WAIT_MS, 15_000),
        pollMs: 250,
    };
}

/** Test seams: awaited at each step, so tests can stall a seal there. */
export const sealHooks: {
    afterClaim?: (token: string) => Promise<void>;
    beforeSharedWrite?: (token: string, key: string) => Promise<void>;
    beforeCommit?: (token: string) => Promise<void>;
    /** After the commit, before the private bucket is cleaned up. */
    afterCommit?: (token: string) => Promise<void>;
} = {};

class ClaimLost extends Error {
    constructor() {
        super("The seal claim was lost");
    }
}

type WebpOutcome =
    | { kind: "none" }
    | { kind: "converted"; key: string; size: number }
    | {
          kind: "skipped" | "failed";
          reason: string;
          message: string;
      };

/** What a seal that committed did, for its log line and event. */
type SealResult = {
    /** Derivative jobs queued in the commit. */
    jobsQueued: number;
    webp: WebpOutcome["kind"];
    /** Why WebP was skipped or failed. */
    reason?: string;
};

/** A seal failure as a fixed class, for the `seal failed` log line. */
function sealFailureReason(err: unknown): string {
    const message = err instanceof Error ? err.message : "";
    if (message === SEAL_IN_PROGRESS) return "timeout";
    if (message === "Media not found") return "media_gone";
    if (message === NOT_ENOUGH_STORAGE) return "not_enough_storage";
    if (err instanceof ClaimLost) return "claim_lost";
    return "storage";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Seals temp media. Returns once the media is sealed, by this call or by a
 * concurrent one. Throws "Media not found", `NOT_ENOUGH_STORAGE`, or
 * `SEAL_IN_PROGRESS` when another seal held it for longer than
 * `SEAL_WAIT_MS`.
 */
export async function sealStoredMedia(input: {
    userId: string;
    appId: string;
    mediaId: string;
}): Promise<void> {
    const startedAt = Date.now();
    try {
        await sealOrWait(input, startedAt);
    } catch (err) {
        logger.warn(
            {
                media_id: input.mediaId,
                app_id: input.appId,
                reason: sealFailureReason(err),
                duration_ms: Date.now() - startedAt,
            },
            "seal failed",
        );
        throw err;
    }
}

async function sealOrWait(
    input: { userId: string; appId: string; mediaId: string },
    startedAt: number,
): Promise<void> {
    const userId = String(input.userId);
    const { appId, mediaId } = input;
    const media = await getMedia({ userId, appId, mediaId });
    if (!media) throw new Error("Media not found");
    if (!media.temp) return;

    // The total already includes this unsealed upload. Over the limit means
    // uploads raced past the check at upload time.
    const plan = await resolveAccountPlan({ id: userId });
    const limit = storageLimitFor(plan);
    if ((await getTotalSpace({ userId })) > limit) {
        throw new Error(NOT_ENOUGH_STORAGE);
    }

    const config = sealConfig();
    const deadline = Date.now() + config.waitMs;
    for (;;) {
        const token = randomBytes(16).toString("hex");
        const claim = await claimSeal({
            userId,
            appId,
            mediaId,
            token,
            claimMs: config.claimMs,
        });
        if (claim.status === "claimed") {
            const claimedAt = Date.now();
            const result = await runSeal(
                media,
                appId,
                claim.mediaRowId,
                token,
                config,
                limit,
                plan,
            );
            if (result) {
                reportSealed(media, appId, result, {
                    duration_ms: Date.now() - startedAt,
                    wait_ms: claimedAt - startedAt,
                });
            }
            return;
        }
        if (claim.status === "sealed") return;
        if (claim.status === "missing") throw new Error("Media not found");
        // Another seal holds an unexpired claim. Wait for it to commit, or
        // for its claim to expire (it died), then take over.
        if (Date.now() >= deadline) throw new Error(SEAL_IN_PROGRESS);
        await sleep(Math.min(config.pollMs, deadline - Date.now()));
    }
}

async function runSeal(
    media: MediaWithUserId,
    appId: string,
    mediaRowId: string,
    token: string,
    config: SealConfig,
    storageLimit: number,
    plan: AccountPlan,
): Promise<SealResult | null> {
    const { mediaId } = media;
    const userId = String(media.userId);
    const isPublic = media.accessControl === Constants.AccessControl.PUBLIC;
    const ext = path.extname(media.fileName).replace(".", "");
    const privateKey = (filename: string) =>
        generateKey({ mediaId, path: Constants.PathKey.PRIVATE, filename });
    const publicKey = (filename: string) =>
        generateKey({ mediaId, path: Constants.PathKey.PUBLIC, filename });
    const privateMain = privateKey(`main.${ext}`);

    const controller = new AbortController();
    const { signal } = controller;
    let lost = false;
    let committedOk = false;
    const renew = async (): Promise<boolean> => {
        if (lost) return false;
        if (committedOk) return true;
        const held = await renewSealClaim({
            mediaRowId,
            token,
            claimMs: config.claimMs,
        });
        if (!held && !lost) {
            lost = true;
            controller.abort(new ClaimLost());
        }
        return held;
    };
    const renewal = setInterval(() => {
        renew().catch((err) => {
            // A failed renewal isn't a lost claim. The fenced renewal before
            // each shared write decides.
            logger.warn(
                { err, media_id: mediaId },
                "Seal claim renewal failed",
            );
        });
    }, config.claimMs / 4);
    renewal.unref?.();

    // Keys only this attempt writes: `seal/<token>/…`.
    const ownKeys: Array<{ Key: string; Bucket: string }> = [];
    // Final keys this attempt wrote, which another attempt could also write.
    const finalKeys: Array<{ Key: string; Bucket: string }> = [];
    let workDir: string | undefined;

    /** Copies to a final key, renewing the claim right before. */
    const fencedCopy = async (copy: CopyParams) => {
        await sealHooks.beforeSharedWrite?.(token, copy.destinationKey);
        if (!(await renew())) throw new ClaimLost();
        finalKeys.push({
            Key: copy.destinationKey,
            Bucket: copy.destinationBucket || cloudBucket,
        });
        await copyObject({ ...copy, abortSignal: signal });
    };

    try {
        await sealHooks.afterClaim?.(token);
        const settings = await getMediaSettings(userId, appId);
        const tags = await sourceTags(privateMain);

        // Step 2: convert to this attempt's own key.
        let webp: WebpOutcome = { kind: "none" };
        if (settings?.useWebP && imagePattern.test(media.mimeType)) {
            const tempRoot = tempFileDirForUploads || os.tmpdir();
            await mkdir(tempRoot, { recursive: true });
            workDir = await mkdtemp(path.join(tempRoot, "medialit-seal-"));
            webp = await convertMain({
                sourceKey: privateMain,
                destinationKey: privateKey(`seal/${token}/main.webp`),
                workDir,
                quality: settings.webpOutputQuality || DEFAULT_WEBP_QUALITY,
                tags,
                signal,
                onStored: (Key) => ownKeys.push({ Key, Bucket: cloudBucket }),
            });
        }

        // Step 3: check storage against the WebP size. The original fits
        // (checked before the claim), so a WebP that doesn't is dropped.
        if (webp.kind === "converted") {
            const total = await getTotalSpace({ userId });
            if (total - media.size + webp.size > storageLimit) {
                webp = {
                    kind: "skipped",
                    reason: "not_enough_storage",
                    message: "Not enough storage for the WebP version",
                };
            }
        }
        if (webp.kind === "skipped" || webp.kind === "failed") {
            if (webp.reason === "busy") recordWebpBusy();
            logger.info(
                { media_id: mediaId, reason: webp.reason },
                "webp skipped",
            );
        }
        const converted = webp.kind === "converted" ? webp : undefined;

        // Step 4: publish to the final keys, fenced.
        if (converted && !isPublic) {
            await fencedCopy({
                sourceKey: converted.key,
                sourceBucket: cloudBucket,
                destinationKey: privateKey("main.webp"),
                destinationBucket: cloudBucket,
                ContentType: "image/webp",
                Tagging: tags,
            });
        }
        if (isPublic) {
            await fencedCopy({
                sourceKey: converted ? converted.key : privateMain,
                sourceBucket: cloudBucket,
                destinationKey: publicKey(
                    converted ? "main.webp" : `main.${ext}`,
                ),
                destinationBucket: cloudPublicBucket,
                ContentType: converted ? "image/webp" : media.mimeType,
                Tagging: tags,
            });
        }
        if (media.thumbnailGenerated) {
            await fencedCopy({
                sourceKey: privateKey("thumb.webp"),
                sourceBucket: cloudBucket,
                destinationKey: publicKey("thumb.webp"),
                destinationBucket: cloudPublicBucket,
                ContentType: "image/webp",
                Tagging: tags,
            });
        }

        // Metadata (phase 1, D2). Never fails the seal.
        const metadata = await readSealMetadata({
            mediaId,
            appId,
            mimeType: media.mimeType,
            key: privateMain,
            convertedToWebp: Boolean(converted),
            signal,
        });

        // The jobs to queue in the commit (phase 1, D11), with the settings
        // in effect now copied into them.
        const planned = planProcessing({
            mimeType: media.mimeType,
            metadata,
            video: effectiveVideoSettings(settings, plan),
            plan,
        });

        // Step 5: commit.
        await sealHooks.beforeCommit?.(token);
        const committed = await commitSeal({
            metadata,
            mediaRowId,
            token,
            processingStatus:
                planned.length > 0
                    ? "processing"
                    : webp.kind === "failed"
                      ? "failed"
                      : "ready",
            processingError:
                webp.kind === "skipped" || webp.kind === "failed"
                    ? webp.message
                    : undefined,
            webp: converted
                ? {
                      fileName: "main.webp",
                      mimeType: "image/webp",
                      size: converted.size,
                  }
                : undefined,
            inTransaction: (tx, id) => afterSealCommit(tx, id, planned),
        });
        if (committed !== "committed") {
            lost = true;
            throw committed === "missing" ? new MediaGone() : new ClaimLost();
        }
        committedOk = true;
        await sealHooks.afterCommit?.(token);

        // Step 6: delete what the private bucket no longer needs.
        const unneeded = [...ownKeys.map((k) => k.Key)];
        if (converted) {
            unneeded.push(privateMain);
            if (isPublic) unneeded.push(privateKey("main.webp"));
        } else if (isPublic) {
            unneeded.push(privateMain);
        }
        // The thumbnail is in the public bucket now.
        if (media.thumbnailGenerated) unneeded.push(privateKey("thumb.webp"));
        await deleteQuietly(
            unneeded.map((Key) => ({ Key, Bucket: cloudBucket })),
            mediaId,
        );
        return {
            jobsQueued: planned.length,
            webp: webp.kind,
            reason:
                webp.kind === "skipped" || webp.kind === "failed"
                    ? webp.reason
                    : undefined,
        };
    } catch (err) {
        await deleteQuietly(ownKeys, mediaId);
        const current = await getMedia({ userId, appId, mediaId }).catch(
            () => undefined,
        );
        if (current === null || err instanceof MediaGone) {
            // Deleted meanwhile: no seal can commit it, so nothing this
            // attempt wrote is anyone's.
            await deleteQuietly(finalKeys, mediaId);
            throw new Error("Media not found");
        }
        if (lost || err instanceof ClaimLost) {
            // Another seal owns the final keys now; leave them alone.
            // Another seal committed it, and reports it.
            if (current && !current.temp) return null;
            throw new Error(SEAL_IN_PROGRESS);
        }
        await releaseSealClaim({ mediaRowId, token }).catch(() => {});
        throw err;
    } finally {
        clearInterval(renewal);
        if (workDir) {
            await rm(workDir, { recursive: true, force: true }).catch(() => {});
        }
    }
}

function reportSealed(
    media: MediaWithUserId,
    appId: string,
    result: SealResult,
    timing: { duration_ms: number; wait_ms: number },
): void {
    const fields = {
        media_id: media.mediaId,
        app_id: appId,
        webp: result.webp,
        jobs_queued: result.jobsQueued,
        ...(result.reason ? { reason: result.reason } : {}),
        ...timing,
    };
    logger.info(fields, "seal committed");
    trackEvent({
        event: "media.sealed",
        source: "media.seal",
        appId,
        userId: String(media.userId),
        properties: {
            ...fields,
            media_kind: mediaKind(media.mimeType),
            access: media.accessControl,
        },
    });
}

/** ffprobe's limits at seal: seal waits for it (D2). */
export const SEAL_PROBE_TIMEOUT_MS = 2_000;
export const SEAL_PROBE_BYTES = 2_000_000;
/** Enough of an image's start for its header in practice; a JPEG whose
 * frame header comes later gets no metadata. */
const IMAGE_HEAD_BYTES = 256 * 1024;

/**
 * Reads the original's metadata before seal commits: the image header for
 * images, ffprobe over a presigned URL for audio and video. Returns null
 * when it can't be read, and logs why. Never throws for the file itself.
 */
async function readSealMetadata(input: {
    mediaId: string;
    appId: string;
    mimeType: string;
    key: string;
    convertedToWebp: boolean;
    signal: AbortSignal;
}): Promise<MediaMetadata | null> {
    const type = input.mimeType.toLowerCase();
    const startedAt = Date.now();
    const fields = { media_id: input.mediaId, app_id: input.appId };
    try {
        let metadata: MediaMetadata | null = null;
        if (type.startsWith("image/")) {
            const head = await getObjectHead({
                Key: input.key,
                Bucket: cloudBucket,
                bytes: IMAGE_HEAD_BYTES,
            });
            metadata = await imageMetadata(head);
            // Converting keeps the size and changes the format.
            if (metadata && input.convertedToWebp) metadata.format = "webp";
        } else if (type.startsWith("video/") || type.startsWith("audio/")) {
            const url = await generateSignedUrl(input.key, cloudBucket);
            metadata =
                (
                    await probeMedia(url, {
                        timeoutMs: SEAL_PROBE_TIMEOUT_MS,
                        probeBytes: SEAL_PROBE_BYTES,
                        signal: input.signal,
                    })
                )?.metadata ?? null;
        } else {
            return null;
        }
        if (!metadata) {
            logger.warn(
                { ...fields, reason: "unreadable" },
                "metadata probe failed",
            );
            return null;
        }
        logger.debug(
            {
                ...fields,
                media_kind: metadata.kind,
                duration_ms: Date.now() - startedAt,
            },
            "metadata read",
        );
        return metadata;
    } catch (err) {
        if (input.signal.aborted) throw new ClaimLost();
        const reason =
            err instanceof ProcessLimitError && err.reason === "timeout"
                ? "timeout"
                : "failed";
        // The message names the presigned URL; never log or send it.
        const error = describeError(err);
        logger.warn({ ...fields, reason, error }, "metadata probe failed");
        // ffprobe killed by a signal is a crash, not an unreadable file.
        if (err instanceof ProcessLimitError && err.exit.signal) {
            captureException({
                error: new Error(error),
                source: "api.metadata_probe",
                severity: "warning",
                context: fields,
            });
        }
        return null;
    }
}

class MediaGone extends Error {
    constructor() {
        super("Media not found");
    }
}

/** The source object's tags, to carry over to the copies. */
async function sourceTags(key: string): Promise<string | undefined> {
    if (DISABLE_TAGGING) return undefined;
    try {
        const response = await getObjectTagging({
            Key: key,
            Bucket: cloudBucket,
        });
        if (response.TagSet && response.TagSet.length > 0) {
            return response.TagSet.map(
                (tag: any) => `${tag.Key}=${tag.Value}`,
            ).join("&");
        }
    } catch (err: any) {
        logger.warn({ err }, "Failed to get tags from source object");
    }
    return undefined;
}

let warnedNoPrlimit = false;

/** Converts the private original to WebP at `destinationKey`, within the
 * image limits. Never throws for the image itself, only for storage errors
 * and a lost claim. */
async function convertMain(input: {
    sourceKey: string;
    destinationKey: string;
    workDir: string;
    quality: number;
    tags?: string;
    signal: AbortSignal;
    onStored: (key: string) => void;
}): Promise<WebpOutcome> {
    const limits = webpLimits();
    const head = await headObject({
        Key: input.sourceKey,
        Bucket: cloudBucket,
    });
    const bytes = head.ContentLength ?? 0;
    if (bytes > limits.maxInputBytes) {
        return {
            kind: "skipped",
            reason: "too_large",
            message: `The image is ${bytes} bytes, over the WebP limit of ${limits.maxInputBytes}`,
        };
    }
    const source = path.join(input.workDir, "source");
    const output = path.join(input.workDir, "main.webp");
    await downloadObject({
        Key: input.sourceKey,
        destination: source,
        abortSignal: input.signal,
    });
    let result;
    try {
        result = await convertToWebp(source, output, {
            quality: input.quality,
            limits,
            slots: webpSlots(),
            signal: input.signal,
            onNoPrlimit: () => {
                if (warnedNoPrlimit) return;
                warnedNoPrlimit = true;
                logger.warn(
                    "prlimit is not installed: WebP conversions run without a memory limit. Install util-linux.",
                );
            },
        });
    } catch (err) {
        if (err instanceof ProcessLimitError && err.reason === "aborted") {
            throw new ClaimLost();
        }
        throw err;
    }
    if (result.status !== "converted") {
        return {
            kind: result.status,
            reason: result.reason,
            message: result.message,
        };
    }
    input.onStored(input.destinationKey);
    await putObject(
        {
            Key: input.destinationKey,
            Body: createReadStream(output),
            ContentType: "image/webp",
            Tagging: input.tags,
            Bucket: cloudBucket,
        },
        { abortSignal: input.signal },
    );
    return { kind: "converted", key: input.destinationKey, size: result.size };
}

async function deleteQuietly(
    keys: Array<{ Key: string; Bucket: string }>,
    mediaId: string,
): Promise<void> {
    const results = await Promise.allSettled(
        keys.map((key) => deleteObject(key)),
    );
    for (const result of results) {
        if (result.status === "rejected") {
            logger.error(
                { err: result.reason, media_id: mediaId },
                "Failed to delete a file after seal",
            );
        }
    }
}
