/**
 * The HLS playlist routes for private media (pipelines-phase-1.md, D6):
 *
 *   GET /media/:mediaId/hls/:token/master.m3u8
 *   GET /media/:mediaId/hls/:token/v:n/index.m3u8
 *
 * No API key: the token is the credential, so any origin may fetch them.
 */
import express, { type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { sql } from "drizzle-orm";
import { getDb, listDerivatives } from "@/db";
import { cloudBucket, cloudPublicBucket } from "../config/constants";
import { getObjectBytes } from "../services/s3";
import logger, { captureException } from "../services/log";
import { derivativeObjectKey } from "./derivatives";
import {
    PlaylistError,
    checkPlaylistToken,
    signRenditionPlaylist,
} from "./playback";

const router = express.Router();

/** Players fetch a handful of playlists per view; this is generous. */
const playlistLimiter = rateLimit({
    windowMs: 60_000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many_requests" },
    handler: (req, res, _next, options) => {
        refused(req, "rate_limited");
        res.status(options.statusCode).json(options.message);
    },
});

function refused(req: Request, reason: string) {
    logger.info(
        { media_id: String(req.params.mediaId ?? ""), reason },
        "hls playlist refused",
    );
}

type Found = {
    bucket: "private" | "public";
    key: string;
};

async function findHls(mediaId: string): Promise<Found | null> {
    const db = getDb();
    const result = await db.execute(
        sql`SELECT id FROM media
            WHERE media_id = ${mediaId} AND NOT temp AND uploaded`,
    );
    const row = result.rows[0] as { id: string } | undefined;
    if (!row) return null;
    const hls = (await listDerivatives(db, row.id)).find(
        (d) => d.name === "hls" && d.status === "ready" && d.key,
    );
    if (!hls) return null;
    return { bucket: hls.bucket, key: hls.key! };
}

async function readPlaylist(
    mediaId: string,
    found: Found,
    file: string,
): Promise<string | null> {
    const result = await getObjectBytes({
        Key: derivativeObjectKey(mediaId, found.bucket, `${found.key}${file}`),
        Bucket: found.bucket === "public" ? cloudPublicBucket : cloudBucket,
        maxBytes: 1024 * 1024,
    }).catch(() => null);
    if (!result || result.tooLarge) return null;
    return Buffer.from(result.bytes).toString("utf8");
}

function send(res: Response, body: string) {
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "private, max-age=60");
    // end, not send: send would append "; charset=utf-8" to the type.
    res.end(body);
}

async function servePlaylist(
    req: Request,
    res: Response,
    rendition: string | null,
) {
    const startedAt = Date.now();
    const mediaId = String(req.params.mediaId);
    res.setHeader("Access-Control-Allow-Origin", "*");
    const check = checkPlaylistToken(mediaId, String(req.params.token));
    if (!check.ok) {
        refused(req, check.reason);
        res.status(403).json({ error: "forbidden" });
        return;
    }
    const found = await findHls(mediaId);
    if (!found) {
        refused(req, "not_found");
        res.status(404).json({ error: "not_found" });
        return;
    }
    const file = rendition ? `${rendition}/index.m3u8` : "master.m3u8";
    const playlist = await readPlaylist(mediaId, found, file);
    if (playlist === null) {
        refused(req, "not_found");
        res.status(404).json({ error: "not_found" });
        return;
    }
    if (!rendition) {
        send(res, playlist);
        return;
    }
    try {
        const signed = await signRenditionPlaylist({
            playlist,
            folderKey: derivativeObjectKey(
                mediaId,
                found.bucket,
                `${found.key}${rendition}/`,
            ),
            bucket: found.bucket,
            expiresAt: check.expiresAt,
        });
        logger.debug(
            {
                media_id: mediaId,
                rendition,
                segments: signed.segments,
                duration_ms: Date.now() - startedAt,
            },
            "hls playlist served",
        );
        send(res, signed.text);
    } catch (err) {
        captureException({
            error: err,
            source: "api.hls_playlist",
            severity: "error",
            context: { media_id: mediaId },
        });
        if (err instanceof PlaylistError) {
            res.status(502).json({ error: "bad_playlist" });
            return;
        }
        throw err;
    }
}

router.get(
    "/:mediaId/hls/:token/master.m3u8",
    /*
        #swagger.tags = ['Media']
        #swagger.summary = 'HLS master playlist of private media'
        #swagger.description = 'The URL in `derivatives.hls.url` of a private video. No API key: the token in the path is the credential, valid for the length of the video plus an hour. Players fetch it themselves; clients never build this URL.'
        #swagger.responses[200] = { description: 'The master playlist (application/vnd.apple.mpegurl)' }
        #swagger.responses[403] = { description: 'Wrong or expired token' }
        #swagger.responses[404] = { description: 'No ready HLS for this media' }
    */
    playlistLimiter,
    async (req, res, next) => {
        servePlaylist(req, res, null).catch(next);
    },
);

router.get(
    "/:mediaId/hls/:token/:rendition/index.m3u8",
    /*
        #swagger.tags = ['Media']
        #swagger.summary = 'HLS rendition playlist of private media'
        #swagger.description = 'A rendition playlist the master playlist points to, with every segment as a signed storage URL that lasts as long as the token.'
        #swagger.responses[200] = { description: 'The rendition playlist (application/vnd.apple.mpegurl)' }
        #swagger.responses[403] = { description: 'Wrong or expired token' }
        #swagger.responses[404] = { description: 'No such rendition, or no ready HLS' }
    */
    playlistLimiter,
    async (req, res, next) => {
        const rendition = String(req.params.rendition);
        if (!/^v\d{1,2}$/.test(rendition)) {
            res.status(404).json({ error: "not_found" });
            return;
        }
        servePlaylist(req, res, rendition).catch(next);
    },
);

export default router;
