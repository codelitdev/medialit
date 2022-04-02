import logger from "../services/log";
import { User } from "../user/model";
import { getUser } from "../user/queries";
import * as queries from "./queries";

export async function getUserFromPresignedUrl(
    signature: string
): Promise<User | null> {
    const signedUrl = await queries.getPresignedUrl(signature);

    if (!signedUrl) {
        return null;
    }

    if (signedUrl.validTill.getTime() <= new Date().getTime()) {
        await queries.deletePresignedUrl(signedUrl.id);
        return null;
    }

    return await getUser(signedUrl!.userId.toString());
}

interface GenerateSignedUrlProps {
    userId: string;
    protocol: string;
    host: string;
}

export async function generateSignedUrl({
    userId,
    protocol,
    host,
}: GenerateSignedUrlProps): Promise<string> {
    const presignedUrl = await queries.createPresignedUrl(userId);

    queries.cleanupExpiredLinks(userId).catch((err: any) => {
        logger.error(
            { err },
            `Error while cleaning up expired links for ${userId}`
        );
    });

    return `${protocol}://${host}/media/create?signature=${presignedUrl.signature}`;
}

export async function cleanup(userId: string, signature: string) {
    await queries.deleteBySignature(signature);
    await queries.cleanupExpiredLinks(userId);
}
