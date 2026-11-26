import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cloudBucket, tempFileDirForUploads } from "../config/constants";
import { deleteObject } from "../services/s3";
import logger from "../services/log";

/** Makes a fresh local working directory. The configured root may not exist
 * yet, as in a fresh container; mkdtemp makes only the last directory. */
export async function makeWorkDir(name: string): Promise<string> {
    const root = tempFileDirForUploads || os.tmpdir();
    await mkdir(root, { recursive: true });
    return await mkdtemp(path.join(root, `medialit-${name}-`));
}

/** Removes a working directory. Never throws. */
export async function removeWorkDir(dir: string | undefined): Promise<void> {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
}

/** Deletes stored objects that won't be kept, private bucket unless given.
 * Logs failures; never throws. */
export async function deleteQuietly(
    keys: Array<string | { Key: string; Bucket: string }>,
    mediaId: string,
): Promise<void> {
    const results = await Promise.allSettled(
        keys.map((key) =>
            deleteObject(
                typeof key === "string"
                    ? { Key: key, Bucket: cloudBucket }
                    : key,
            ),
        ),
    );
    for (const result of results) {
        if (result.status === "rejected") {
            logger.error(
                { err: result.reason, media_id: mediaId },
                "Failed to delete a stored file",
            );
        }
    }
}
