import { ReadStream } from "fs";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3,
    S3Client,
    GetObjectTaggingCommand,
} from "@aws-sdk/client-s3";
import {
    cloudEndpoint,
    cloudKey,
    cloudSecret,
    cloudBucket,
    cloudRegion,
} from "../config/constants";

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

export const putObject = async (params: UploadParams) => {
    const s3Client = new S3Client({
        region: cloudRegion,
        endpoint: cloudEndpoint,
        credentials: {
            accessKeyId: cloudKey,
            secretAccessKey: cloudSecret,
        },
    });

    try {
        const command = new PutObjectCommand(
            Object.assign({}, { Bucket: cloudBucket }, params)
        );
        const response = await s3Client.send(command);
        return response;
    } catch (err: any) {
        console.log("Upload failed:", err.message); // eslint-disable-line no-console
        throw err;
    }
};

export const deleteObject = async (params: DeleteParams) => {
    const s3Client = new S3Client({
        region: cloudRegion,
        endpoint: cloudEndpoint,
        credentials: {
            accessKeyId: cloudKey,
            secretAccessKey: cloudSecret,
        },
    });
    try {
        const command = new DeleteObjectCommand(
            Object.assign({}, { Bucket: cloudBucket }, params)
        );
        const response = await s3Client.send(command);
        return response;
    } catch (err: any) {
        console.log("Delete failed", err.message); // eslint-disable-line no-console
        throw err;
    }
};

export const getObjectTagging = async (params: { Key: string }) => {
    const s3Client = new S3Client({
        region: cloudRegion,
        endpoint: cloudEndpoint,
        credentials: {
            accessKeyId: cloudKey,
            secretAccessKey: cloudSecret,
        },
    });

    try {
        const command = new GetObjectTaggingCommand(
            Object.assign({}, { Bucket: cloudBucket }, params)
        );
        const response = await s3Client.send(command);
        return response;
    } catch (err: any) {
        console.log("getObjectTagging failed", err); // eslint-disable-line no-console
        throw err;
    }
};

export const generateSignedUrl = async ({
    name,
    mimetype,
}: PresignedURLParams): Promise<string> => {
    const client = new S3Client({
        region: cloudRegion,
        endpoint: cloudEndpoint,
        credentials: {
            accessKeyId: cloudKey,
            secretAccessKey: cloudSecret,
        },
    });

    const command = new GetObjectCommand({
        Bucket: cloudBucket,
        Key: name,
    });

    const url = await getSignedUrl(client, command);
    return url;
};
