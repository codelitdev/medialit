import aws from "aws-sdk";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ReadStream } from "fs";
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

export const putObject = (params: UploadParams) =>
    new Promise((resolve, reject) => {
        const endpoint = new aws.Endpoint(cloudEndpoint);
        const s3 = new aws.S3({
            endpoint,
            accessKeyId: cloudKey,
            secretAccessKey: cloudSecret,
        });

        const settings = Object.assign(
            {},
            {
                Bucket: cloudBucket,
            },
            params
        );
        s3.putObject(settings, (err, result) => {
            if (err) reject(err);
            resolve(result);
        });
    });

export const deleteObject = (params: DeleteParams) =>
    new Promise((resolve, reject) => {
        const endpoint = new aws.Endpoint(cloudEndpoint);
        const s3 = new aws.S3({
            endpoint,
            accessKeyId: cloudKey,
            secretAccessKey: cloudSecret,
        });

        s3.deleteObject(
            Object.assign(
                {},
                {
                    Bucket: cloudBucket,
                },
                params
            ),
            (err, result) => {
                if (err) reject(err);
                resolve(result);
            }
        );
    });

export const getObjectTagging = (params: { Key: string }) =>
    new Promise((resolve, reject) => {
        const endpoint = new aws.Endpoint(cloudEndpoint);
        const s3 = new aws.S3({
            endpoint,
            accessKeyId: cloudKey,
            secretAccessKey: cloudSecret,
        });

        s3.getObjectTagging(
            Object.assign(
                {},
                {
                    Bucket: cloudBucket,
                },
                params
            ),
            (err, result) => {
                if (err) reject(err);
                resolve(result);
            }
        );
    });

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
