import { ReadStream } from "fs";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    GetObjectTaggingCommand,
} from "@aws-sdk/client-s3";
import {
    cloudEndpoint,
    cloudKey,
    cloudSecret,
    cloudBucket,
    cloudRegion,
    CLOUDFRONT_KEY_PAIR_ID,
    CLOUDFRONT_PRIVATE_KEY,
    CDN_MAX_AGE,
    CLOUDFRONT_ENDPOINT,
} from "../config/constants";
import { getSignedUrl as getCfSignedUrl } from "@aws-sdk/cloudfront-signer";

export interface UploadParams {
    Key: string;
    Body: ReadStream;
    ContentType: string;
    ACL: "private" | "public-read";
    Tagging?: string;
}

export interface DeleteParams {
    Key: string;
}

export interface PresignedURLParams {
    name: string;
    mimetype?: string;
}

let s3Client: S3Client | null = null;

const getS3Client = () => {
    if (!s3Client) {
        s3Client = new S3Client({
            region: cloudRegion,
            endpoint: cloudEndpoint,
            credentials: {
                accessKeyId: cloudKey,
                secretAccessKey: cloudSecret,
            },
        });
    }
    return s3Client;
};

export const putObject = async (params: UploadParams) => {
    const command = new PutObjectCommand(
        Object.assign({}, { Bucket: cloudBucket }, params),
    );
    const response = await getS3Client().send(command);
    return response;
};

export const deleteObject = async (params: DeleteParams) => {
    const command = new DeleteObjectCommand(
        Object.assign({}, { Bucket: cloudBucket }, params),
    );
    const response = await getS3Client().send(command);
    return response;
};

export const getObjectTagging = async (params: { Key: string }) => {
    const command = new GetObjectTaggingCommand(
        Object.assign({}, { Bucket: cloudBucket }, params),
    );
    const response = await getS3Client().send(command);
    return response;
};

export const generateSignedUrl = async (key: string): Promise<string> => {
    const command = new GetObjectCommand({
        Bucket: cloudBucket,
        Key: key,
    });
    // Set expiration to 3 hours (10800 seconds)
    const url = await getS3SignedUrl(getS3Client(), command, { expiresIn: 10800 });
    return url;
};

export const generateCDNSignedUrl = (key: string): string => {
    if (
        !CLOUDFRONT_ENDPOINT ||
        !CLOUDFRONT_KEY_PAIR_ID ||
        !CLOUDFRONT_PRIVATE_KEY
    ) {
        throw new Error("CDN configuration is missing");
    }

    const url = getCfSignedUrl({
        url: `${CLOUDFRONT_ENDPOINT}/${key}`,
        keyPairId: CLOUDFRONT_KEY_PAIR_ID,
        privateKey: CLOUDFRONT_PRIVATE_KEY,
        dateLessThan: new Date(Date.now() + CDN_MAX_AGE).toISOString(),
    });
    return url;
};
