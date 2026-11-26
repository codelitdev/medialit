/**
 * Posters (pipelines-phase-1.md, D9): after seal, a better frame than the
 * upload thumbnail's first one. The job writes the private `poster.webp`
 * and records it as the `thumbnail` derivative; `media.publish` copies it
 * over the public `thumb.webp`, so clients that saved the thumbnail URL get
 * the new frame with no change.
 *
 * It never writes the private `thumb.webp`: seal deletes that after its
 * commit, and this job is queued in the commit, so it could run first.
 */
import path from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Constants } from "@medialit/models";
import thumbnail, { posterSeekSeconds } from "@medialit/thumbnail";
import { ProcessLimitError } from "@medialit/images";
import { cloudBucket, cloudPublicBucket } from "../config/constants";
import { generateSignedUrl, putObject } from "../services/s3";
import logger from "../services/log";
import { permanentError } from "../jobs/errors";
import { derivativeJob, mediaFolder } from "./derivatives";
import { POSTER_ATTEMPTS, POSTER_JOB } from "./processing-plan";
import { probeMedia } from "./probe";
import { fillMediaMetadata, getDb, type LockedMedia } from "@/db";
import { makeWorkDir, removeWorkDir } from "./work-files";

export const POSTER_KEY = "poster.webp";

/** Where a sealed media item's original is: the public bucket for public
 * media (seal deleted the private copy), the private bucket otherwise. */
export function originalLocation(
    media: Pick<LockedMedia, "mediaId" | "accessControl" | "fileName">,
): { key: string; bucket: string } {
    const isPublic = media.accessControl === Constants.AccessControl.PUBLIC;
    const folder = mediaFolder(
        media.mediaId,
        isPublic ? Constants.PathKey.PUBLIC : Constants.PathKey.PRIVATE,
    );
    return {
        key: `${folder}${media.fileName}`,
        bucket: isPublic ? cloudPublicBucket : cloudBucket,
    };
}

export const posterJob = derivativeJob({
    type: POSTER_JOB,
    name: "thumbnail",
    class: "cpu",
    maxAttempts: POSTER_ATTEMPTS,
    timeoutMs: 5 * 60 * 1000,
    produce: async ({ media, params, signal, privateFolder }) => {
        const original = originalLocation(media);
        // A URL MediaLit made: ffmpeg reads only the bytes it needs.
        const source = await generateSignedUrl(original.key, original.bucket);
        let duration = Number(params.durationSeconds) || undefined;
        if (duration === undefined) {
            // Seal couldn't read the metadata, e.g. a phone video whose
            // index is at the end of the file, read over a slow link. This
            // job has more time: keep what it reads, so the media has
            // metadata even when no MP4 or HLS job runs.
            const probed = await probeMedia(source, {
                timeoutMs: 30_000,
                signal,
            }).catch(() => null);
            duration = probed?.metadata.durationSeconds;
            if (probed) {
                await fillMediaMetadata(getDb(), media.id, probed.metadata);
            }
        }

        const workDir = await makeWorkDir("poster");
        try {
            const output = path.join(workDir, POSTER_KEY);
            const seekSeconds = posterSeekSeconds(duration);
            let result;
            try {
                result = await thumbnail.forVideoPoster(source, output, {
                    seekSeconds,
                    signal,
                });
            } catch (err) {
                // ffmpeg refusing the file won't change on a retry.
                if (
                    err instanceof ProcessLimitError &&
                    err.reason === "failed" &&
                    !err.exit.signal
                ) {
                    throw permanentError(err.message, "bad_input");
                }
                throw err;
            }
            const bytes = (await stat(output)).size;
            await putObject(
                {
                    Key: `${privateFolder}${POSTER_KEY}`,
                    Body: createReadStream(output),
                    ContentType: "image/webp",
                    Bucket: cloudBucket,
                },
                { abortSignal: signal },
            );
            logger.info(
                {
                    media_id: media.mediaId,
                    app_id: media.appId,
                    frame_time_s: seekSeconds,
                    fallback: result.fallback,
                },
                "poster made",
            );
            return { key: POSTER_KEY, mimeType: "image/webp", size: bytes };
        } finally {
            await removeWorkDir(workDir);
        }
    },
});
