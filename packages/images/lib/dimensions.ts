import { open } from "node:fs/promises";

export type ImageFormat = "png" | "jpeg" | "webp" | "gif";

export interface ImageInfo {
    format: ImageFormat;
    width: number;
    height: number;
}

/** Reads `length` bytes at `offset`; returns fewer at the end of the file. */
export type ByteReader = (offset: number, length: number) => Promise<Buffer>;

/** How many JPEG segments to walk before giving up on finding the frame. */
const MAX_JPEG_SEGMENTS = 4096;

function isJpegFrameMarker(marker: number): boolean {
    // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    return (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
    );
}

async function jpegSize(
    read: ByteReader,
): Promise<{ width: number; height: number } | null> {
    let offset = 2;
    for (let i = 0; i < MAX_JPEG_SEGMENTS; i++) {
        const head = await read(offset, 4);
        if (head.length < 4 || head[0] !== 0xff) return null;
        const marker = head[1];
        if (marker === 0xff) {
            // Fill byte.
            offset += 1;
            continue;
        }
        if (
            marker === 0xd8 ||
            marker === 0x01 ||
            (marker >= 0xd0 && marker <= 0xd7)
        ) {
            // Markers without a length.
            offset += 2;
            continue;
        }
        if (marker === 0xd9 || marker === 0xda) {
            // End of image, or start of scan before any frame header.
            return null;
        }
        const length = head.readUInt16BE(2);
        if (length < 2) return null;
        if (isJpegFrameMarker(marker)) {
            const frame = await read(offset + 4, 5);
            if (frame.length < 5) return null;
            return {
                height: frame.readUInt16BE(1),
                width: frame.readUInt16BE(3),
            };
        }
        offset += 2 + length;
    }
    return null;
}

/**
 * Reads an image's format, width and height from its header, without
 * decoding it. Supports PNG, JPEG, WebP and GIF. Returns null when the bytes
 * aren't one of these, or the header is cut short.
 *
 * Decoders allocate memory by pixels, not bytes: a small PNG can declare
 * 30,000 × 30,000 pixels and need gigabytes to decode, so check this before
 * handing an untrusted image to a decoder.
 */
export async function readImageInfo(
    read: ByteReader,
): Promise<ImageInfo | null> {
    const head = await read(0, 32);
    if (
        head.length >= 24 &&
        head.readUInt32BE(0) === 0x89504e47 &&
        head.readUInt32BE(4) === 0x0d0a1a0a
    ) {
        if (head.toString("ascii", 12, 16) !== "IHDR") return null;
        return {
            format: "png",
            width: head.readUInt32BE(16),
            height: head.readUInt32BE(20),
        };
    }
    if (
        head.length >= 3 &&
        head[0] === 0xff &&
        head[1] === 0xd8 &&
        head[2] === 0xff
    ) {
        const size = await jpegSize(read);
        return size ? { format: "jpeg", ...size } : null;
    }
    if (head.length >= 10 && head.toString("ascii", 0, 4) === "GIF8") {
        return {
            format: "gif",
            width: head.readUInt16LE(6),
            height: head.readUInt16LE(8),
        };
    }
    if (
        head.length >= 30 &&
        head.toString("ascii", 0, 4) === "RIFF" &&
        head.toString("ascii", 8, 12) === "WEBP"
    ) {
        const chunk = head.toString("ascii", 12, 16);
        if (chunk === "VP8X") {
            return {
                format: "webp",
                width: 1 + head.readUIntLE(24, 3),
                height: 1 + head.readUIntLE(27, 3),
            };
        }
        if (chunk === "VP8 ") {
            return {
                format: "webp",
                width: head.readUInt16LE(26) & 0x3fff,
                height: head.readUInt16LE(28) & 0x3fff,
            };
        }
        if (chunk === "VP8L") {
            const bits = head.readUInt32LE(21);
            return {
                format: "webp",
                width: 1 + (bits & 0x3fff),
                height: 1 + ((bits >> 14) & 0x3fff),
            };
        }
        return null;
    }
    return null;
}

/** `readImageInfo` for a local file. Reads only the header's bytes. */
export async function readImageInfoFromFile(
    path: string,
): Promise<ImageInfo | null> {
    const file = await open(path, "r");
    try {
        return await readImageInfo(async (offset, length) => {
            const bytes = new Uint8Array(length);
            const { bytesRead } = await file.read(bytes, 0, length, offset);
            return Buffer.from(bytes.buffer, 0, bytesRead);
        });
    } finally {
        await file.close();
    }
}

/** `readImageInfo` for bytes held in memory. */
export function readImageInfoFromBuffer(
    bytes: Buffer,
): Promise<ImageInfo | null> {
    return readImageInfo(async (offset, length) =>
        bytes.subarray(offset, offset + length),
    );
}
