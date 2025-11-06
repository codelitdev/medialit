import { ReadStream } from "fs";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    GetObjectTaggingCommand,
    CopyObjectCommand,
    ListObjectsV2Command,
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
    DISABLE_TAGGING,
} from "../config/constants";
import { getSignedUrl as getCfSignedUrl } from "@aws-sdk/cloudfront-signer";

export interface UploadParams {
    Key: string;
    Body: ReadStream;
    ContentType: string;
    Tagging?: string;
}

export interface DeleteParams {
    Key: string;
}

export interface CopyParams {
    sourceKey: string;
    destinationKey: string;
    ContentType?: string;
    Tagging?: string;
}

export interface PresignedURLParams {
    name: string;
    mimetype?: string;
}

let s3Client: S3Client | null = null;
export const s3ClientConfig: any = {
    region: cloudRegion,
    credentials: {
        accessKeyId: cloudKey,
        secretAccessKey: cloudSecret,
    },
};

if (cloudEndpoint) {
    s3ClientConfig.endpoint = cloudEndpoint;
    s3ClientConfig.forcePathStyle = true;
}

const getS3Client = () => {
    if (!s3Client) {
        s3Client = new S3Client(s3ClientConfig);
    }
    return s3Client;
};

export const putObject = async (params: UploadParams) => {
    if (DISABLE_TAGGING) {
        delete params.Tagging;
    }
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
    const url = await getS3SignedUrl(getS3Client(), command);
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

export const copyObject = async (params: CopyParams) => {
    const copySource = `${cloudBucket}/${params.sourceKey}`;
    const command = new CopyObjectCommand({
        Bucket: cloudBucket,
        CopySource: copySource,
        Key: params.destinationKey,
        ContentType: params.ContentType,
        Tagging: params.Tagging,
    });
    const response = await getS3Client().send(command);
    return response;
};

export const deleteFolder = async (prefix: string): Promise<void> => {
    const client = getS3Client();
    let continuationToken: string | undefined;

    do {
        const command = new ListObjectsV2Command({
            Bucket: cloudBucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
        });

        const response = await client.send(command);

        if (response.Contents && response.Contents.length > 0) {
            const deletePromises = response.Contents.map((object: any) =>
                deleteObject({ Key: object.Key! }),
            );
            await Promise.all(deletePromises);
        }

        continuationToken = response.NextContinuationToken;
    } while (continuationToken);
};
