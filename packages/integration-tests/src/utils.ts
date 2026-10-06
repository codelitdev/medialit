import { deflateSync } from "node:zlib";

// Build a valid transparent 1x1 RGBA PNG, including PNG chunk checksums.
export function generatePng(): Buffer {
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
    header.writeUInt32BE(1, 0);
    header.writeUInt32BE(1, 4);
    header[8] = 8;
    header[9] = 6;
    return Buffer.concat(
        [
            Buffer.from("89504e470d0a1a0a", "hex"),
            chunk("IHDR", header),
            chunk("IDAT", deflateSync(Uint8Array.from([0, 0, 0, 0, 0]))),
            chunk("IEND", Buffer.alloc(0)),
        ].map((bytes) => Uint8Array.from(bytes)),
    );
}
