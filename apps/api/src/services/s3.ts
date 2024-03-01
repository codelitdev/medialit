import { ReadStream } from "fs";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

// const s3Client = new S3Client({
//     region: cloudRegion,
//     endpoint: cloudEndpoint,
//     credentials: {
//         accessKeyId: cloudKey,
//         secretAccessKey: cloudSecret,
//     },
// });

const s3Client = (() => {
    return new S3Client({
        region: cloudRegion,
        endpoint: cloudEndpoint,
        credentials: {
            accessKeyId: cloudKey,
            secretAccessKey: cloudSecret,
        },
    });
})();

export const putObject = async (params: UploadParams) => {
    const command = new PutObjectCommand(
        Object.assign({}, { Bucket: cloudBucket }, params)
    );
    const response = await s3Client.send(command);
    return response;
};

export const deleteObject = async (params: DeleteParams) => {
    const command = new DeleteObjectCommand(
        Object.assign({}, { Bucket: cloudBucket }, params)
    );
    const response = await s3Client.send(command);
    return response;
};

export const getObjectTagging = async (params: { Key: string }) => {
    const command = new GetObjectTaggingCommand(
        Object.assign({}, { Bucket: cloudBucket }, params)
    );
    const response = await s3Client.send(command);
    return response;
};

export const generateSignedUrl = async ({
    name,
    mimetype,
}: PresignedURLParams): Promise<string> => {
    const command = new GetObjectCommand({
        Bucket: cloudBucket,
        Key: name,
    });
    const url = await getSignedUrl(s3Client, command);
    return url;
};

export default {
    putObject,
    deleteObject,
    getObjectTagging,
    generateSignedUrl,
};
