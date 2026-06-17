import os from "os";
import path from "path";
import { writeFile, mkdir, copyFile, mkdtemp, rm } from "fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import mediaService from "../../media/service";
import { validateUploadConstraints } from "../../media/storage-middleware";
import { AUTH_ERROR } from "./responses";
import { mediaSchema } from "./schemas";

function toolError(text: string) {
    return {
        content: [
            {
                type: "text" as const,
                text,
            },
        ],
        isError: true,
    };
}

const BASE64_ERROR = {
    content: [
        {
            type: "text" as const,
            text: "Invalid file data: could not decode base64 content.",
        },
    ],
    isError: true,
};

const UPLOAD_ERROR = {
    content: [
        {
            type: "text" as const,
            text: "An error occurred while uploading the file.",
        },
    ],
    isError: true,
};

function isValidBase64(str: string): boolean {
    // Base64 must be non-empty and match the expected pattern
    if (str.length === 0) return false;
    // Allow standard base64 with optional padding
    return /^[A-Za-z0-9+/]*={0,2}$/.test(str);
}

export function registerUploadTool(server: McpServer): void {
    server.registerTool(
        "upload_media",
        {
            description:
                "Upload a file to MediaLit storage from base64-encoded content. The upload is temporary until sealed.",
            inputSchema: {
                fileBase64: z
                    .string()
                    .min(1, "Base64 content cannot be empty")
                    .describe("Base64-encoded file content"),
                fileName: z
                    .string()
                    .min(1, "Filename cannot be empty")
                    .describe("Filename with extension"),
                mimeType: z
                    .string()
                    .min(1, "MIME type cannot be empty")
                    .describe("MIME type of the file"),
                caption: z
                    .string()
                    .optional()
                    .describe("Optional caption for the file"),
                access: z
                    .enum(["public", "private"])
                    .optional()
                    .describe("Access level (default: private)"),
                group: z
                    .string()
                    .optional()
                    .describe("Group label for organizing files"),
            },
            outputSchema: mediaSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                openWorldHint: true,
            },
        },
        handleUploadMediaTool,
    );
}

export async function handleUploadMediaTool(args: any, extra: any) {
    const userId = extra?.authInfo?.clientId;
    const apikey = extra?.authInfo?.token;
    const user = extra?.authInfo?.user;
    if (!userId || !apikey || !user) {
        return AUTH_ERROR;
    }

    // Validate base64
    if (!isValidBase64(args.fileBase64)) {
        return BASE64_ERROR;
    }

    let buffer: Buffer;
    try {
        buffer = Buffer.from(args.fileBase64, "base64");
        // Check that the decode actually consumed content and
        // that we didn't silently produce an empty buffer from garbage
        if (buffer.length === 0) {
            return BASE64_ERROR;
        }
    } catch {
        return BASE64_ERROR;
    }

    const validation = await validateUploadConstraints({
        size: buffer.length,
        user,
    });
    if (!validation.valid) {
        return toolError(validation.error);
    }

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-upload-"));
    const tempPath = path.join(tempDir, args.fileName);

    try {
        await writeFile(tempPath, buffer);

        const uploadedFile = {
            name: args.fileName,
            mimetype: args.mimeType,
            size: buffer.length,
            tempFilePath: tempPath,
            mv: (destPath: string, callback: (err?: any) => void) => {
                mkdir(path.dirname(destPath), { recursive: true })
                    .then(() => copyFile(tempPath, destPath))
                    .then(() => callback(null))
                    .catch((err) => callback(err));
            },
        };

        const mediaId = await mediaService.upload({
            userId,
            apikey,
            file: uploadedFile,
            access: args.access || "private",
            caption: args.caption || "",
            group: args.group,
        });
        const media = await mediaService.getMediaDetails({
            userId,
            apikey,
            mediaId,
        });

        return {
            content: [
                {
                    type: "text" as const,
                    text: JSON.stringify(media),
                },
            ],
            structuredContent: media as any,
        };
    } catch (err) {
        return UPLOAD_ERROR;
    } finally {
        rm(tempDir, { recursive: true, force: true }).catch(() => {
            // Ignore cleanup errors
        });
    }
}
