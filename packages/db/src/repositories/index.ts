import type { Database } from "../client";
import { ApikeyRepository } from "./apikey-repository";
import { LogRepository } from "./log-repository";
import { MediaRepository } from "./media-repository";
import { MediaSettingsRepository } from "./media-settings-repository";
import { OauthClientRepository } from "./oauth-client-repository";
import { OauthPendingAuthRepository } from "./oauth-pending-auth-repository";
import { OauthRevokedTokenRepository } from "./oauth-revoked-token-repository";
import { PlanRepository } from "./plan-repository";
import { PresignedUrlRepository } from "./presigned-url-repository";
import { TusUploadRepository } from "./tus-upload-repository";
import { UserRepository } from "./user-repository";

export {
    ApikeyRepository,
    LogRepository,
    MediaRepository,
    MediaSettingsRepository,
    OauthClientRepository,
    OauthPendingAuthRepository,
    OauthRevokedTokenRepository,
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
    oauthClients: OauthClientRepository;
    oauthPendingAuths: OauthPendingAuthRepository;
    oauthRevokedTokens: OauthRevokedTokenRepository;
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
        oauthClients: new OauthClientRepository(db),
        oauthPendingAuths: new OauthPendingAuthRepository(db),
        oauthRevokedTokens: new OauthRevokedTokenRepository(db),
        plans: new PlanRepository(db),
        logs: new LogRepository(db),
    };
}
