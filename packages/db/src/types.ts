import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type {
    apikeys,
    logs,
    media,
    mediaSettings,
    oauthClients,
    oauthPendingAuths,
    oauthRevokedTokens,
    plans,
    presignedUrls,
    tusUploads,
    users,
} from "./schema";

export type UserRow = InferSelectModel<typeof users>;
export type NewUserRow = InferInsertModel<typeof users>;

export type ApikeyRow = InferSelectModel<typeof apikeys>;
export type NewApikeyRow = InferInsertModel<typeof apikeys>;

export type MediaRow = InferSelectModel<typeof media>;
export type NewMediaRow = InferInsertModel<typeof media>;

export type MediaSettingsRow = InferSelectModel<typeof mediaSettings>;
export type NewMediaSettingsRow = InferInsertModel<typeof mediaSettings>;

export type TusUploadRow = InferSelectModel<typeof tusUploads>;
export type NewTusUploadRow = InferInsertModel<typeof tusUploads>;

export type PresignedUrlRow = InferSelectModel<typeof presignedUrls>;
export type NewPresignedUrlRow = InferInsertModel<typeof presignedUrls>;

export type OauthClientRow = InferSelectModel<typeof oauthClients>;
export type NewOauthClientRow = InferInsertModel<typeof oauthClients>;

export type OauthPendingAuthRow = InferSelectModel<typeof oauthPendingAuths>;
export type NewOauthPendingAuthRow = InferInsertModel<typeof oauthPendingAuths>;

export type OauthRevokedTokenRow = InferSelectModel<typeof oauthRevokedTokens>;
export type NewOauthRevokedTokenRow = InferInsertModel<
    typeof oauthRevokedTokens
>;

export type PlanRow = InferSelectModel<typeof plans>;
export type NewPlanRow = InferInsertModel<typeof plans>;

export type LogRow = InferSelectModel<typeof logs>;
export type NewLogRow = InferInsertModel<typeof logs>;
