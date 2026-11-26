import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

before(() => {
    process.env.BETTER_AUTH_SECRET ??=
        "test-secret-test-secret-test-secret-123";
    // Presigning is offline; it only needs settings.
    process.env.CLOUD_REGION ||= "us-east-1";
    process.env.CLOUD_KEY ||= "test-key";
    process.env.CLOUD_SECRET ||= "test-secret";
    process.env.CLOUD_ENDPOINT ||= "http://127.0.0.1:9";
    process.env.CLOUD_BUCKET_NAME ||= "test-bucket";
});

const playlist = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    "#EXT-X-TARGETDURATION:6",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    '#EXT-X-MAP:URI="init_0.mp4"',
    "#EXTINF:6.000000,",
    "seg00000.m4s",
    "#EXTINF:2.000000,",
    "seg00001.m4s",
    "#EXT-X-ENDLIST",
    "",
].join("\n");

describe("playlist tokens", () => {
    test("accept their own media until they expire, and nothing else", async () => {
        const { checkPlaylistToken, playlistToken, playbackSeconds } =
            await import("./playback.js");
        const now = Date.UTC(2026, 10, 23, 12);
        const token = playlistToken("media-a", 600, now);
        const check = checkPlaylistToken("media-a", token, now);
        assert.equal(check.ok, true);

        // Lasts the video's length plus CDN_MAX_AGE (1 hour by default), so
        // a rendition switch late in a long video still works.
        assert.equal(playbackSeconds(600), 600 + 3600);
        const late = now + (600 + 3600 - 1) * 1000;
        assert.equal(checkPlaylistToken("media-a", token, late).ok, true);
        assert.deepEqual(
            checkPlaylistToken("media-a", token, now + (600 + 3600) * 1000),
            { ok: false, reason: "expired" },
        );

        assert.deepEqual(checkPlaylistToken("media-b", token, now), {
            ok: false,
            reason: "bad_token",
        });
        const [expiry, sig] = token.split(".");
        const extended = `${Number(expiry) + 86400}.${sig}`;
        assert.equal(checkPlaylistToken("media-a", extended, now).ok, false);
        for (const junk of ["", "x", "1.2", `${expiry}.${"A".repeat(43)}`]) {
            assert.equal(checkPlaylistToken("media-a", junk, now).ok, false);
        }
        // At most 7 days, the S3 presign limit.
        assert.equal(playbackSeconds(30 * 24 * 3600), 7 * 24 * 3600);
    });
});

describe("signRenditionPlaylist", () => {
    test("makes segments and the init file absolute URLs, and keeps the rest", async () => {
        const { signRenditionPlaylist } = await import("./playback.js");
        const { text, segments } = await signRenditionPlaylist({
            playlist,
            folderKey: "p/media-a/hls/v0/",
            bucket: "public",
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
        });
        assert.equal(segments, 2);
        assert.match(
            text,
            /#EXT-X-MAP:URI="[^"]*p\/media-a\/hls\/v0\/init_0\.mp4"/,
        );
        assert.match(text, /^.+p\/media-a\/hls\/v0\/seg00000\.m4s$/m);
        assert.match(text, /^#EXTINF:6\.000000,$/m);
        assert.match(text, /^#EXT-X-ENDLIST$/m);
    });

    test("signs private segments for as long as the token lasts", async () => {
        const { signRenditionPlaylist } = await import("./playback.js");
        const now = Date.now();
        const { text } = await signRenditionPlaylist({
            playlist,
            folderKey: "i/media-a/hls/v0/",
            bucket: "private",
            expiresAt: Math.floor(now / 1000) + 7200,
            now,
        });
        const urls = text.split("\n").filter((line) => /^https?:/.test(line));
        assert.equal(urls.length, 2);
        for (const url of urls) {
            const expires = Number(
                new URL(url).searchParams.get("X-Amz-Expires"),
            );
            assert.ok(expires >= 7199 && expires <= 7200, `expires ${expires}`);
        }
    });

    test("refuses anything the encoder doesn't write", async () => {
        const { PlaylistError, signRenditionPlaylist } = await import(
            "./playback.js"
        );
        const bad = [
            playlist.replace("seg00001.m4s", "http://169.254.169.254/latest"),
            playlist.replace("seg00001.m4s", "../../i/other/main.mp4"),
            playlist.replace('URI="init_0.mp4"', 'URI="../main.mp4"'),
            playlist.replace(
                "#EXT-X-ENDLIST",
                '#EXT-X-KEY:METHOD=AES-128,URI="http://evil.example/key"\n#EXT-X-ENDLIST',
            ),
        ];
        for (const text of bad) {
            await assert.rejects(
                signRenditionPlaylist({
                    playlist: text,
                    folderKey: "p/media-a/hls/v0/",
                    bucket: "public",
                    expiresAt: Math.floor(Date.now() / 1000) + 60,
                }),
                PlaylistError,
            );
        }
    });
});
