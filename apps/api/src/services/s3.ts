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
    CLOUD_ENDPOINT,
    CLOUD_ENDPOINT_PUBLIC,
    cloudKey,
    cloudSecret,
    cloudBucket,
    cloudPublicBucket,
    cloudRegion,
    CLOUDFRONT_KEY_PAIR_ID,
    CLOUDFRONT_PRIVATE_KEY,
    CDN_MAX_AGE,
    CDN_ENDPOINT,
    DISABLE_TAGGING,
} from "../config/constants";
import { getSignedUrl as getCfSignedUrl } from "@aws-sdk/cloudfront-signer";

export interface UploadParams {
    Key: string;
    Body: ReadStream;
    ContentType: string;
    Tagging?: string;
    Bucket?: string;
}

export interface DeleteParams {
    Key: string;
    Bucket?: string;
}

export interface CopyParams {
    sourceKey: string;
    destinationKey: string;
    ContentType?: string;
    Tagging?: string;
    sourceBucket?: string;
    destinationBucket?: string;
}

export interface PresignedURLParams {
    name: string;
    mimetype?: string;
}

let s3PrivateClient: S3Client | null = null;
let s3PublicClient: S3Client | null = null;

export const getPrivateS3ClientConfig = () => {
    const config: any = {
        region: cloudRegion,
        credentials: {
            accessKeyId: cloudKey,
            secretAccessKey: cloudSecret,
        },
    };

    if (CLOUD_ENDPOINT && !CLOUD_ENDPOINT.includes("amazonaws.com")) {
        const isVirtualHostedStyle = CLOUD_ENDPOINT.includes(cloudBucket);
        config.endpoint = CLOUD_ENDPOINT;
        config.forcePathStyle = !isVirtualHostedStyle;
    }

    return config;
};

export const getPublicS3ClientConfig = () => {
    const config: any = {
        region: cloudRegion,
        credentials: {
            accessKeyId: cloudKey,
            secretAccessKey: cloudSecret,
        },
    };

    if (
        CLOUD_ENDPOINT_PUBLIC &&
        !CLOUD_ENDPOINT_PUBLIC.includes("amazonaws.com")
    ) {
        const isVirtualHostedStyle =
            CLOUD_ENDPOINT_PUBLIC.includes(cloudPublicBucket);
        config.endpoint = CLOUD_ENDPOINT_PUBLIC;
        config.forcePathStyle = !isVirtualHostedStyle;
    }

    return config;
};

const getS3Client = (bucket?: string): S3Client => {
    const targetBucket = bucket || cloudBucket;
    // Check if target bucket is the public bucket (handle empty string edge case)
    const isPublicBucket =
        cloudPublicBucket && targetBucket === cloudPublicBucket;

    if (isPublicBucket) {
        if (!s3PublicClient) {
            s3PublicClient = new S3Client(getPublicS3ClientConfig());
        }
        return s3PublicClient;
    } else {
        if (!s3PrivateClient) {
            s3PrivateClient = new S3Client(getPrivateS3ClientConfig());
        }
        return s3PrivateClient;
    }
};

export const putObject = async (params: UploadParams) => {
    if (DISABLE_TAGGING) {
        delete params.Tagging;
    }
    const bucket = params.Bucket || cloudBucket;
    const { Bucket, ...restParams } = params;
    const command = new PutObjectCommand(
        Object.assign({}, { Bucket: bucket }, restParams),
    );
    const response = await getS3Client(bucket).send(command);
    return response;
};

export const deleteObject = async (params: DeleteParams) => {
    const bucket = params.Bucket || cloudBucket;
    const { Bucket, ...restParams } = params;
    const command = new DeleteObjectCommand(
        Object.assign({}, { Bucket: bucket }, restParams),
    );
    const response = await getS3Client(bucket).send(command);
    return response;
};

export const getObjectTagging = async (params: {
    Key: string;
    Bucket?: string;
}) => {
    const bucket = params.Bucket || cloudBucket;
    const { Bucket, ...restParams } = params;
    const command = new GetObjectTaggingCommand(
        Object.assign({}, { Bucket: bucket }, restParams),
    );
    const response = await getS3Client(bucket).send(command);
    return response;
};

export const generateSignedUrl = async (
    key: string,
    bucket?: string,
): Promise<string> => {
    const targetBucket = bucket || cloudBucket;
    const command = new GetObjectCommand({
        Bucket: targetBucket,
        Key: key,
    });
    const url = await getS3SignedUrl(getS3Client(targetBucket), command);
    return url;
};

export const generateCloudfrontSignedUrl = (key: string): string => {
    if (!CDN_ENDPOINT || !CLOUDFRONT_KEY_PAIR_ID || !CLOUDFRONT_PRIVATE_KEY) {
        throw new Error("CDN configuration is missing");
    }

    const url = getCfSignedUrl({
        url: `${CDN_ENDPOINT}/${key}`,
        keyPairId: CLOUDFRONT_KEY_PAIR_ID,
        privateKey: CLOUDFRONT_PRIVATE_KEY,
        dateLessThan: new Date(Date.now() + CDN_MAX_AGE).toISOString(),
    });
    return url;
};

export const copyObject = async (params: CopyParams) => {
    const sourceBucket = params.sourceBucket || cloudBucket;
    const destinationBucket = params.destinationBucket || cloudBucket;
    const copySource = `${sourceBucket}/${params.sourceKey}`;
    const command = new CopyObjectCommand({
        Bucket: destinationBucket,
        CopySource: copySource,
        Key: params.destinationKey,
        ContentType: params.ContentType,
        Tagging: params.Tagging,
    });
    // Use destination bucket's client for copy operations
    const response = await getS3Client(destinationBucket).send(command);
    return response;
};

export const deleteFolder = async (
    prefix: string,
    bucket?: string,
): Promise<void> => {
    const targetBucket = bucket || cloudBucket;
    const client = getS3Client(targetBucket);
    let continuationToken: string | undefined;

    do {
        const command = new ListObjectsV2Command({
            Bucket: targetBucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
        });

        const response = await client.send(command);

        if (response.Contents && response.Contents.length > 0) {
            const deletePromises = response.Contents.map((object: any) =>
                deleteObject({ Key: object.Key!, Bucket: targetBucket }),
            );
            await Promise.all(deletePromises);
        }

        continuationToken = response.NextContinuationToken;
    } while (continuationToken);
};
