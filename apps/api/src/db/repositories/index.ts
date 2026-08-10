import type { Database } from "../client";
import { ApikeyRepository } from "./apikey-repository";
import { LogRepository } from "./log-repository";
import { MediaRepository } from "./media-repository";
import { MediaSettingsRepository } from "./media-settings-repository";
import { PlanRepository } from "./plan-repository";
import { PresignedUrlRepository } from "./presigned-url-repository";
import { TusUploadRepository } from "./tus-upload-repository";
import { UserRepository } from "./user-repository";

export type { PublicApikeyRow } from "./apikey-repository";

export {
    ApikeyRepository,
    LogRepository,
    MediaRepository,
    MediaSettingsRepository,
    PlanRepository,
    PresignedUrlRepository,
    TusUploadRepository,
    UserRepository,
};

export interface Repositories {
    users: UserRepository;
    apikeys: ApikeyRepository;
    media: MediaRepository;
    mediaSettings: MediaSettingsRepository;
    tusUploads: TusUploadRepository;
    presignedUrls: PresignedUrlRepository;
    plans: PlanRepository;
    logs: LogRepository;
}

export function createRepositories(db: Database): Repositories {
    return {
        users: new UserRepository(db),
        apikeys: new ApikeyRepository(db),
        media: new MediaRepository(db),
        mediaSettings: new MediaSettingsRepository(db),
        tusUploads: new TusUploadRepository(db),
        presignedUrls: new PresignedUrlRepository(db),
        plans: new PlanRepository(db),
        logs: new LogRepository(db),
    };
}
