import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { mediaSettings } from "../schema";
import type { MediaSettingsRow } from "../types";

export interface MediaSettingsUpsert {
    userId: string;
    apikey: string;
    useWebP?: boolean;
    webpOutputQuality?: number;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
}

export class MediaSettingsRepository {
    constructor(private readonly db: Database) {}

    async findOne(
        userId: string,
        apikey: string,
    ): Promise<MediaSettingsRow | null> {
        const [row] = await this.db
            .select()
            .from(mediaSettings)
            .where(
                and(
                    eq(mediaSettings.userId, userId),
                    eq(mediaSettings.apikey, apikey),
                ),
            )
            .limit(1);
        return row ?? null;
    }

    async upsert(values: MediaSettingsUpsert): Promise<void> {
        await this.db
            .insert(mediaSettings)
            .values(values)
            .onConflictDoUpdate({
                target: mediaSettings.apikey,
                set: {
                    useWebP: values.useWebP,
                    webpOutputQuality: values.webpOutputQuality,
                    thumbnailWidth: values.thumbnailWidth,
                    thumbnailHeight: values.thumbnailHeight,
                },
            });
    }
}
