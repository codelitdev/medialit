/**
 * Playing HLS of private media (pipelines-phase-1.md, D6). A player can't
 * send an API key, and a segment URL signed for 15 minutes would stop a
 * long video halfway, so the API serves the playlists itself:
 *
 * - `derivatives.hls.url` is `{API}/media/{mediaId}/hls/{token}/master.m3u8`.
 *   The token is an HMAC of the media ID and an expiry, with a key derived
 *   from the API's auth secret. It lasts for the video's duration plus
 *   `CDN_MAX_AGE`, because a player fetches a rendition's playlist only
 *   when it first switches to it, which can be late in a long video.
 * - The master playlist is served unchanged; its relative URIs come back to
 *   these routes. Each rendition playlist is rewritten so its segments and
 *   init file are signed storage URLs, valid for as long as the token.
 */
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import {
    ACCESS_PRIVATE_BUCKET_VIA_CLOUDFRONT,
    CDN_ENDPOINT,
    CDN_MAX_AGE,
    CLOUD_ENDPOINT_PUBLIC,
    cloudBucket,
} from "../config/constants";
import { cloudfrontPrefixQuery, generateSignedUrl } from "../services/s3";

/** S3 presigned URLs can't last longer than 7 days. */
const MAX_SIGNED_SECONDS = 7 * 24 * 60 * 60;

let cachedKey: { secret: string; key: Buffer } | undefined;

/** A key for playlist tokens only, derived from the auth secret, so the
 * secret itself never signs anything outside auth. */
function signingKey(): Buffer {
    const secret = process.env.BETTER_AUTH_SECRET ?? "";
    if (secret.length < 32) {
        throw new Error("BETTER_AUTH_SECRET is needed to sign playlists");
    }
    if (cachedKey?.secret !== secret) {
        cachedKey = {
            secret,
            key: Buffer.from(
                hkdfSync(
                    "sha256",
                    secret,
                    Buffer.alloc(0),
                    "medialit:hls-playlist:v1",
                    32,
                ),
            ),
        };
    }
    return cachedKey.key;
}

function signature(mediaId: string, expiresAt: number): string {
    return createHmac("sha256", signingKey())
        .update(`${mediaId}.${expiresAt}`)
        .digest("base64url");
}

/** Seconds a playlist URL, and the segments it signs, stay valid. */
export function playbackSeconds(durationSeconds?: number): number {
    return Math.min(
        Math.ceil((durationSeconds ?? 0) + CDN_MAX_AGE / 1000),
        MAX_SIGNED_SECONDS,
    );
}

export function playlistToken(
    mediaId: string,
    durationSeconds?: number,
    now = Date.now(),
): string {
    const expiresAt = Math.floor(now / 1000) + playbackSeconds(durationSeconds);
    return `${expiresAt}.${signature(mediaId, expiresAt)}`;
}

export type TokenCheck =
    | { ok: true; expiresAt: number }
    | { ok: false; reason: "bad_token" | "expired" };

/** Checks a token with a constant-time comparison, before anything is
 * looked up, so junk requests never reach the database. */
export function checkPlaylistToken(
    mediaId: string,
    token: string,
    now = Date.now(),
): TokenCheck {
    const match = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
    if (!match) return { ok: false, reason: "bad_token" };
    const expiresAt = Number(match[1]);
    const expected = Buffer.from(signature(mediaId, expiresAt));
    const given = Buffer.from(match[2]);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
        return { ok: false, reason: "bad_token" };
    }
    if (expiresAt * 1000 <= now) return { ok: false, reason: "expired" };
    return { ok: true, expiresAt };
}

export function publicApiUrl(): string {
    return (
        process.env.PUBLIC_API_URL ||
        process.env.API_SERVER ||
        `http://localhost:${process.env.PORT || 8000}`
    ).replace(/\/$/, "");
}

/** The master playlist URL of a private media item's HLS. */
export function playlistUrl(mediaId: string, durationSeconds?: number) {
    const token = playlistToken(mediaId, durationSeconds);
    return `${publicApiUrl()}/media/${encodeURIComponent(mediaId)}/hls/${token}/master.m3u8`;
}

/** The names the encoder writes. Anything else in a playlist is refused. */
const SEGMENT = /^seg\d{5}\.m4s$/;
const INIT = /^init(_\d+)?\.mp4$/;

export class PlaylistError extends Error {}

/**
 * Rewrites a rendition playlist so its segments and init file are signed
 * URLs under `folderKey` (the rendition's folder, ending in `/`), valid
 * until `expiresAt` (seconds since the epoch). `bucket` says where they are.
 */
export async function signRenditionPlaylist(input: {
    playlist: string;
    folderKey: string;
    bucket: "private" | "public";
    expiresAt: number;
    now?: number;
}): Promise<{ text: string; segments: number }> {
    const now = input.now ?? Date.now();
    const seconds = Math.max(1, input.expiresAt - Math.floor(now / 1000));
    let cloudfrontQuery: string | undefined;
    const sign = async (file: string): Promise<string> => {
        const key = `${input.folderKey}${file}`;
        if (input.bucket === "public") {
            return `${CDN_ENDPOINT || CLOUD_ENDPOINT_PUBLIC}/${key}`;
        }
        if (ACCESS_PRIVATE_BUCKET_VIA_CLOUDFRONT) {
            cloudfrontQuery ??= cloudfrontPrefixQuery(
                input.folderKey,
                new Date(input.expiresAt * 1000),
            );
            return `${CDN_ENDPOINT}/${key}?${cloudfrontQuery}`;
        }
        return await generateSignedUrl(key, cloudBucket, seconds);
    };

    let segments = 0;
    const lines: string[] = [];
    for (const line of input.playlist.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#EXT-X-MAP:")) {
            const uri = /URI="([^"]+)"/.exec(trimmed)?.[1];
            if (!uri || !INIT.test(uri)) {
                throw new PlaylistError("Unexpected init file in playlist");
            }
            lines.push(
                trimmed.replace(`URI="${uri}"`, `URI="${await sign(uri)}"`),
            );
        } else if (trimmed.startsWith("#")) {
            if (/URI=/.test(trimmed)) {
                throw new PlaylistError("Unexpected URI in playlist");
            }
            lines.push(trimmed);
        } else if (trimmed === "") {
            lines.push(trimmed);
        } else {
            if (!SEGMENT.test(trimmed)) {
                throw new PlaylistError("Unexpected segment in playlist");
            }
            segments += 1;
            lines.push(await sign(trimmed));
        }
    }
    return { text: lines.join("\n"), segments };
}
