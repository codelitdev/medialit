import os from "os";
import path from "path";
import { writeFile, mkdir, copyFile, mkdtemp, rm } from "fs/promises";
import { z } from "zod";
import mediaService from "../../media/service";
import { validateUploadConstraints } from "../../media/storage-middleware";
import type { MedialitMcpContext, MedialitMcpTool } from "../context";
import { medialitTool } from "../tool";
import { toolError } from "./errors";
import { mediaSchema } from "./schemas";

const BASE64_ERROR = toolError("validation_failed", {
    reason: "invalid_base64",
    message: "Invalid file data: could not decode base64 content.",
});

function isValidBase64(str: string): boolean {
    // Base64 must be non-empty and match the expected pattern
    if (str.length === 0) return false;
    // Allow standard base64 with optional padding
    return /^[A-Za-z0-9+/]*={0,2}$/.test(str);
}

const uploadInputSchema = z.object({
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
    caption: z.string().optional().describe("Optional caption for the file"),
    access: z
        .enum(["public", "private"])
        .optional()
        .describe("Access level (default: private)"),
    group: z.string().optional().describe("Group label for organizing files"),
});

export const uploadTools = (): MedialitMcpTool[] => [
    medialitTool({
        name: "upload_media",
        title: "Upload media",
        risk: "write",
        description:
            "Upload a file to MediaLit storage from base64-encoded content. The upload is temporary until sealed.",
        inputSchema: uploadInputSchema,
        outputSchema: mediaSchema,
        annotations: { openWorldHint: true },
        handler: handleUploadMediaTool,
    }),
];

export async function handleUploadMediaTool({
    context,
    args,
}: {
    context: MedialitMcpContext;
    args: z.infer<typeof uploadInputSchema>;
}) {
    const { user, userId, appId } = context;

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
        return toolError(
            validation.reason === "file_size_exceeded"
                ? "validation_failed"
                : "forbidden",
            { reason: validation.reason, message: validation.error },
        );
    }

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "mcp-upload-"));
    // args.fileName is caller-controlled; never use it to build a path.
    const tempPath = path.join(tempDir, "upload");

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
            appId,
            file: uploadedFile,
            access: args.access || "private",
            caption: args.caption || "",
            group: args.group,
        });
        return await mediaService.getMediaDetails({
            userId,
            appId,
            mediaId,
        });
    } finally {
        rm(tempDir, { recursive: true, force: true }).catch(() => {
            // Ignore cleanup errors
        });
    }
}
