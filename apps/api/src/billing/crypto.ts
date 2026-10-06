import crypto from "node:crypto";

const algorithm = "aes-256-gcm";

function key(): Buffer {
    const raw = process.env.BILLING_DATA_ENCRYPTION_KEY;
    if (!raw) throw new Error("BILLING_DATA_ENCRYPTION_KEY_missing");
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length !== 32) {
        throw new Error("BILLING_DATA_ENCRYPTION_KEY_must_be_32_bytes");
    }
    return decoded;
}

export function encryptBillingValue(value: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(algorithm, key(), iv);
    const ciphertext = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), ciphertext]
        .map((part) => part.toString("base64"))
        .join(".");
}

export function decryptBillingValue(payload: string): string {
    const [iv, tag, ciphertext] = payload.split(".");
    if (!iv || !tag || !ciphertext) {
        throw new Error("billing_ciphertext_invalid");
    }
    const decipher = crypto.createDecipheriv(
        algorithm,
        key(),
        Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64")),
        decipher.final(),
    ]).toString("utf8");
}
