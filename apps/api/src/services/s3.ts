import { createWriteStream, ReadStream } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    GetObjectTaggingCommand,
    PutObjectTaggingCommand,
    HeadObjectCommand,
    CopyObjectCommand,
    ListObjectsV2Command,
    ListMultipartUploadsCommand,
    AbortMultipartUploadCommand,
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
    UPLOAD_PART_CONCURRENCY,
    UPLOAD_PART_SIZE_BYTES,
} from "../config/constants";
import { getSignedUrl as getCfSignedUrl } from "@aws-sdk/cloudfront-signer";

export interface UploadParams {
    Key: string;
    Body: ReadStream | Buffer;
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
    /** Cancels the request. */
    abortSignal?: AbortSignal;
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

export const putObject = async (
    params: UploadParams,
    options: { abortSignal?: AbortSignal } = {},
) => {
    if (DISABLE_TAGGING) {
        delete params.Tagging;
    }
    const bucket = params.Bucket || cloudBucket;
    const { Bucket, ...restParams } = params;
    const command = new PutObjectCommand(
        Object.assign({}, { Bucket: bucket }, restParams),
    );
    const response = await getS3Client(bucket).send(command, options);
    return response;
};

/**
 * Streams a body into an object with S3 multipart upload, one part at a time,
 * so the whole file is never held in memory or written to disk. Each part is
 * retried on its own. Small bodies go up in a single request.
 *
 * Call `abort()` on the result to cancel; a cancelled multipart upload is
 * aborted so it leaves no parts behind.
 */
export const streamToObject = (params: {
    Key: string;
    Body: Readable | Buffer;
    ContentType: string;
    Bucket?: string;
}): Upload => {
    const bucket = params.Bucket || cloudBucket;
    return new Upload({
        client: getS3Client(bucket),
        params: {
            Bucket: bucket,
            Key: params.Key,
            Body: params.Body,
            ContentType: params.ContentType,
        },
        partSize: UPLOAD_PART_SIZE_BYTES,
        queueSize: UPLOAD_PART_CONCURRENCY,
        leavePartsOnError: false,
    });
};

export const headObject = async (params: { Key: string; Bucket?: string }) => {
    const bucket = params.Bucket || cloudBucket;
    return await getS3Client(bucket).send(
        new HeadObjectCommand({ Bucket: bucket, Key: params.Key }),
    );
};

/** Downloads an object to a local file. */
export const downloadObject = async (params: {
    Key: string;
    destination: string;
    Bucket?: string;
    abortSignal?: AbortSignal;
}): Promise<void> => {
    const bucket = params.Bucket || cloudBucket;
    const response = await getS3Client(bucket).send(
        new GetObjectCommand({ Bucket: bucket, Key: params.Key }),
        { abortSignal: params.abortSignal },
    );
    if (!response.Body) {
        throw new Error(`Object has no body: ${params.Key}`);
    }
    await pipeline(
        response.Body as Readable,
        createWriteStream(params.destination),
        { signal: params.abortSignal },
    );
};

/** Sets an object's tags from a `key=value&key=value` string. Does nothing
 * when tagging is disabled. */
export const putObjectTagging = async (params: {
    Key: string;
    Tagging: string;
    Bucket?: string;
}) => {
    if (DISABLE_TAGGING) return;
    const bucket = params.Bucket || cloudBucket;
    const TagSet = Array.from(new URLSearchParams(params.Tagging)).map(
        ([Key, Value]) => ({ Key, Value }),
    );
    await getS3Client(bucket).send(
        new PutObjectTaggingCommand({
            Bucket: bucket,
            Key: params.Key,
            Tagging: { TagSet },
        }),
    );
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

/* Reads the first `bytes` bytes of an object (fewer if it is shorter). */
export const getObjectHead = async (params: {
    Key: string;
    Bucket?: string;
    bytes: number;
}): Promise<Buffer> => {
    const bucket = params.Bucket || cloudBucket;
    const response = await getS3Client(bucket).send(
        new GetObjectCommand({
            Bucket: bucket,
            Key: params.Key,
            Range: `bytes=0-${Math.max(0, params.bytes - 1)}`,
        }),
    );
    const bytes = await response.Body!.transformToByteArray();
    return Buffer.from(bytes.subarray(0, params.bytes));
};

/* Reads a whole object into memory. Callers check `ContentLength` against
   their own limit first, so pass `maxBytes` to refuse anything larger. */
export const getObjectBytes = async (params: {
    Key: string;
    Bucket?: string;
    maxBytes: number;
}): Promise<{ bytes: Uint8Array; tooLarge: false } | { tooLarge: true }> => {
    const bucket = params.Bucket || cloudBucket;
    const response = await getS3Client(bucket).send(
        new GetObjectCommand({ Bucket: bucket, Key: params.Key }),
    );
    if ((response.ContentLength ?? 0) > params.maxBytes) {
        response.Body?.transformToWebStream().cancel();
        return { tooLarge: true };
    }
    const bytes = await response.Body!.transformToByteArray();
    if (bytes.byteLength > params.maxBytes) return { tooLarge: true };
    return { bytes, tooLarge: false };
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
    /** Seconds the URL stays valid; the SDK's default (15 minutes) if
     * unset. At most 7 days. */
    expiresIn?: number,
): Promise<string> => {
    const targetBucket = bucket || cloudBucket;
    const command = new GetObjectCommand({
        Bucket: targetBucket,
        Key: key,
    });
    const url = await getS3SignedUrl(
        getS3Client(targetBucket),
        command,
        expiresIn ? { expiresIn: Math.floor(expiresIn) } : undefined,
    );
    return url;
};

/**
 * A CloudFront signed query string for every object under `prefix` (a
 * custom policy with a wildcard), valid until `expiresAt`. One signature
 * for a whole HLS rendition instead of one per segment.
 */
export const cloudfrontPrefixQuery = (
    prefix: string,
    expiresAt: Date,
): string => {
    if (!CDN_ENDPOINT || !CLOUDFRONT_KEY_PAIR_ID || !CLOUDFRONT_PRIVATE_KEY) {
        throw new Error("CDN configuration is missing");
    }
    const resource = `${CDN_ENDPOINT}/${prefix}*`;
    const policy = JSON.stringify({
        Statement: [
            {
                Resource: resource,
                Condition: {
                    DateLessThan: {
                        "AWS:EpochTime": Math.floor(expiresAt.getTime() / 1000),
                    },
                },
            },
        ],
    });
    const signed = getCfSignedUrl({
        url: resource,
        keyPairId: CLOUDFRONT_KEY_PAIR_ID,
        privateKey: CLOUDFRONT_PRIVATE_KEY,
        policy,
    });
    return new URL(signed).search.slice(1);
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
    const response = await getS3Client(destinationBucket).send(command, {
        abortSignal: params.abortSignal,
    });
    return response;
};

/** Every key under a prefix. */
export const listKeys = async (
    prefix: string,
    bucket?: string,
): Promise<string[]> => {
    const targetBucket = bucket || cloudBucket;
    const client = getS3Client(targetBucket);
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
        const response = await client.send(
            new ListObjectsV2Command({
                Bucket: targetBucket,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            }),
        );
        for (const object of response.Contents ?? []) {
            if (object.Key) keys.push(object.Key);
        }
        continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    return keys;
};

export const deleteFolder = async (
    prefix: string,
    bucket?: string,
): Promise<void> => {
    const targetBucket = bucket || cloudBucket;
    const keys = await listKeys(prefix, targetBucket);
    await Promise.all(
        keys.map((Key) => deleteObject({ Key, Bucket: targetBucket })),
    );
};

/**
 * Aborts every unfinished multipart upload of one object. Object listings
 * don't show these, so deleteObject() can't remove their parts. Takes the
 * exact key: MinIO only lists multipart uploads whose key equals the prefix.
 */
export const abortMultipartUploads = async (
    key: string,
    bucket?: string,
): Promise<number> => {
    const targetBucket = bucket || cloudBucket;
    const client = getS3Client(targetBucket);
    let aborted = 0;
    let KeyMarker: string | undefined;
    let UploadIdMarker: string | undefined;
    do {
        const response = await client.send(
            new ListMultipartUploadsCommand({
                Bucket: targetBucket,
                Prefix: key,
                KeyMarker,
                UploadIdMarker,
            }),
        );
        for (const upload of response.Uploads || []) {
            if (upload.Key !== key) continue;
            await client.send(
                new AbortMultipartUploadCommand({
                    Bucket: targetBucket,
                    Key: upload.Key,
                    UploadId: upload.UploadId,
                }),
            );
            aborted++;
        }
        KeyMarker = response.IsTruncated ? response.NextKeyMarker : undefined;
        UploadIdMarker = response.IsTruncated
            ? response.NextUploadIdMarker
            : undefined;
    } while (KeyMarker);
    return aborted;
};
