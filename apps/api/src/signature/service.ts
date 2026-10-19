import logger from "../services/log";
import { getUser } from "../user/queries";
import * as queries from "./queries";
import { User } from "@medialit/models";

export type SignatureAuth =
    | {
          status: "ok";
          user: User;
          /** Internal ID of the signature's app. */
          appId: string;
          group?: string;
      }
    /** Unknown, expired, its app deleted, or its key revoked. */
    | { status: "invalid" }
    | { status: "account_inactive" };

export async function getUserAndGroupFromPresignedUrl(
    signature: string,
): Promise<SignatureAuth> {
    const signedUrl = await queries.getPresignedUrl(signature);

    if (!signedUrl) {
        return { status: "invalid" };
    }

    if (signedUrl.validTill.getTime() <= new Date().getTime()) {
        await queries.deletePresignedUrl(signedUrl.id);
        return { status: "invalid" };
    }

    const user: User | null = await getUser(String(signedUrl.userId));

    if (!user) {
        return { status: "invalid" };
    }
    if (!signedUrl.ownerActive || user.active === false) {
        return { status: "account_inactive" };
    }

    return {
        status: "ok",
        user,
        appId: signedUrl.appId,
        group: signedUrl.group,
    };
}

interface GenerateSignedUrlProps {
    userId: string;
    /** Internal app ID. */
    appId: string;
    /** Internal ID of the API key minting it, so revoking the key revokes
     * the signature. Omitted for OAuth and dashboard callers. */
    apiKeyId?: string;
    group?: string;
}

export async function generateSignature({
    userId,
    appId,
    apiKeyId,
    group,
}: GenerateSignedUrlProps): Promise<string> {
    const presignedUrl = await queries.createPresignedUrl({
        userId,
        appId,
        apiKeyId,
        group,
    });

    queries.cleanupExpiredLinks(userId).catch((err: any) => {
        logger.error(
            { err },
            `Error while cleaning up expired links for ${userId}`,
        );
    });

    return presignedUrl.signature;
}

export async function cleanup(userId: string, signature: string) {
    await queries.deleteBySignature(signature);
    await queries.cleanupExpiredLinks(userId);
}
