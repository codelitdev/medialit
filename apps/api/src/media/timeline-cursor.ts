export type TimelineCursor = { at: Date; id: string };

/** Opaque to clients: where the last item of a page sits in the timeline. */
export function encodeTimelineCursor(cursor: TimelineCursor): string {
    return Buffer.from(
        JSON.stringify([cursor.at.toISOString(), cursor.id]),
    ).toString("base64url");
}

/** `null` for anything this server did not issue. */
export function decodeTimelineCursor(value: string): TimelineCursor | null {
    try {
        const parsed = JSON.parse(
            Buffer.from(value, "base64url").toString("utf8"),
        );
        if (!Array.isArray(parsed) || parsed.length !== 2) return null;
        const [at, id] = parsed;
        if (typeof at !== "string" || typeof id !== "string" || !id) {
            return null;
        }
        const date = new Date(at);
        if (Number.isNaN(date.getTime()) || date.toISOString() !== at) {
            return null;
        }
        return { at: date, id };
    } catch {
        return null;
    }
}
