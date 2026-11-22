import { deflateSync } from "node:zlib";

// Build a valid transparent RGBA PNG, including PNG chunk checksums. The
// suites use a 64x36 image, large enough for a thumbnail to be made.
export function generatePng(width = 1, height = 1): Buffer {
    function chunk(type: string, data: Buffer): Buffer {
        const payload = Buffer.concat(
            [Buffer.from(type), data].map((bytes) => Uint8Array.from(bytes)),
        );
        let crc = 0xffffffff;
        for (const byte of payload) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit++) {
                crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
            }
        }
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        const checksum = Buffer.alloc(4);
        checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
        return Buffer.concat(
            [length, payload, checksum].map((bytes) => Uint8Array.from(bytes)),
        );
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    return Buffer.concat(
        [
            Buffer.from("89504e470d0a1a0a", "hex"),
            chunk("IHDR", header),
            // Each row: filter byte 0, then 4 zero bytes per pixel.
            chunk(
                "IDAT",
                deflateSync(new Uint8Array(height * (1 + width * 4))),
            ),
            chunk("IEND", Buffer.alloc(0)),
        ].map((bytes) => Uint8Array.from(bytes)),
    );
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label} must be an object`);
    }
    return value as JsonRecord;
}

async function fetchWebp(url: unknown, label: string): Promise<void> {
    if (typeof url !== "string" || !url) {
        throw new Error(`${label} must be a URL`);
    }
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Downloading ${label} returned ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (
        bytes.subarray(0, 4).toString("latin1") !== "RIFF" ||
        bytes.subarray(8, 12).toString("latin1") !== "WEBP"
    ) {
        throw new Error(`${label} is not a WebP image`);
    }
}

/**
 * Checks the `processing` and `derivatives` fields of an image's media
 * response, and that its thumbnail can be downloaded: from `thumbnail` and
 * from the `thumbnail` derivative. Temp media is `pending`; sealed media
 * with no derivative jobs is `ready`.
 */
export async function checkProcessing(
    media: JsonRecord,
    stage: "temp" | "sealed",
): Promise<void> {
    const processing = record(media.processing, "processing");
    const expected = stage === "temp" ? "pending" : "ready";
    if (processing.status !== expected) {
        throw new Error(
            `processing.status is ${String(processing.status)}, expected ${expected}`,
        );
    }
    const derivatives = record(media.derivatives, "derivatives");
    const thumbnail = record(derivatives.thumbnail, "derivatives.thumbnail");
    if (thumbnail.status !== "ready") {
        throw new Error("The thumbnail derivative is not ready");
    }
    if (thumbnail.mimeType !== "image/webp") {
        throw new Error("The thumbnail derivative is not image/webp");
    }
    await fetchWebp(media.thumbnail, "thumbnail");
    await fetchWebp(thumbnail.url, "derivatives.thumbnail.url");
}
