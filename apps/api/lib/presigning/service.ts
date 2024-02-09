import logger from "../services/log";
import { getUser } from "../user/queries";
import * as queries from "./queries";
import { PreSignedUrl } from "./model";
import { User } from "@medialit/models";

interface PresignedUrlProps {
    user: User;
    apikey: string;
    group?: string;
}

export async function getUserAndGroupFromPresignedUrl(
    signature: string
): Promise<PresignedUrlProps | null> {
    const signedUrl: PreSignedUrl | null = await queries.getPresignedUrl(
        signature
    );

    if (!signedUrl) {
        return null;
    }

    if (signedUrl.validTill.getTime() <= new Date().getTime()) {
        await queries.deletePresignedUrl(signedUrl.id);
        return null;
    }

    const user: User | null = await getUser(signedUrl!.userId.toString());

    if (!user) {
        return null;
    }

    return { user, apikey: signedUrl.apikey, group: signedUrl.group };
}

interface GenerateSignedUrlProps {
    userId: string;
    apikey: string;
    protocol: string;
    host: string;
    group?: string;
}

export async function generateSignedUrl({
    userId,
    apikey,
    protocol,
    host,
    group,
}: GenerateSignedUrlProps): Promise<string> {
    const presignedUrl = await queries.createPresignedUrl(
        userId,
        apikey,
        group
    );

    queries.cleanupExpiredLinks(userId).catch((err: any) => {
        logger.error(
            { err },
            `Error while cleaning up expired links for ${userId}`
        );
    });

    return `${protocol}://${host}/media/create?signature=${presignedUrl?.signature}`;
}

export async function cleanup(userId: string, signature: string) {
    await queries.deleteBySignature(signature);
    await queries.cleanupExpiredLinks(userId);
}

export default {
    generateSignedUrl,
};
