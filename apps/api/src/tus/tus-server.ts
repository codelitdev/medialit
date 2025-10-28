import { Server } from "@tus/server";
import { FileStore } from "@tus/file-store";
import { tempFileDirForUploads, TUS_CHUNK_SIZE } from "../config/constants";
import logger from "../services/log";
import { createTusUpload, updateTusUploadOffset } from "./queries";
import finalizeUpload from "./finalize";

const store = new FileStore({
    directory: `${tempFileDirForUploads}/tus-uploads`,
});

export const server = new Server({
    path: "/media/create/tus",
    datastore: store,
    // Use absolute URLs so PATCH requests work with the same base URL
    // respectForwardedHeaders: false,
    // relativeLocation: false,
    // async onIncomingRequest(req: any) {
    //     // Extract metadata from Upload-Metadata header per TUS spec
    //     // Format: Key1 Base64(Value1),Key2 Base64(Value2)
    //     const uploadMetadataHeader = req.headers["upload-metadata"] || req.headers["Upload-Metadata"];
    //     console.log(uploadMetadataHeader)
    //     if (uploadMetadataHeader) {
    //         try {
    //             // header may be an array or a string
    //             const header = Array.isArray(uploadMetadataHeader)
    //                 ? uploadMetadataHeader.join(",")
    //                 : String(uploadMetadataHeader);

    //             const metadata = header
    //                 .split(",")
    //                 .map((s) => s.trim())
    //                 .filter(Boolean)
    //                 .reduce((acc, item) => {
    //                     const parts = item.split(/\s+/);
    //                     const key = parts[0];
    //                     const valueB64 = parts.slice(1).join(" ");
    //                     if (!key || !valueB64) return acc;
    //                     try {
    //                         acc[key] = Buffer.from(valueB64, "base64").toString("utf8");
    //                     } catch (e) {
    //                         // If value isn't valid base64, store raw value
    //                         acc[key] = valueB64;
    //                     }
    //                     return acc;
    //                 }, {} as Record<string, string>);

    //             // Store metadata in request for later use
    //             req.tusMetadata = metadata;
    //         } catch (err) {
    //             logger.error({ err }, "Error parsing upload metadata");
    //         }
    //     }
    // },
    // async onUploadCreate(req: any, upload: any) {
    //     console.log(req)
    //     // Get user and apikey from request (set by middleware)
    //     const user = req.user;
    //     const apikey = req.apikey;
    //     const signature = req.signature;
    //     // const metadata = req.tusMetadata || {};

    //     logger.info({
    //         uploadId: upload.id,
    //         user,
    //         apikey,
    //         signature,
    //         // metadata,
    //         uploadSize: upload.size,
    //     }, "TUS onCreate event");

    //     if (!user || !apikey) {
    //         logger.error("Missing user or apikey in tus onCreate");
    //         return;
    //     }

    //     createTusUpload({
    //         userId: user.id,
    //         apikey,
    //         uploadLength: upload.size,
    //         metadata: {
    //             // filename: metadata.filename || "unknown",
    //             // mimetype: metadata.mimetype || "application/octet-stream",
    //             // access: metadata.access,
    //             // caption: metadata.caption,
    //             // group: metadata.group || (req.body?.group as string),
    //         },
    //         signature,
    //         tempFilePath: upload.id,
    //     }).catch((err) => {
    //         logger.error({ err }, "Error creating tus upload record");
    //     });

    //     return {
    //         metadata: {
    //             ...upload.metadata,
    //         },
    //     } as any;
    // }
});

// Set up event handlers
// server.on("onRequest", async (req: any, res: any) => {
//     logger.info({
//         method: req.method,
//         url: req.url,
//         headers: req.headers,
//     }, "TUS server received request");
// });

// server.on("onIncomingRequest", async (req: any) => {
//     // Extract metadata from Upload-Metadata header per TUS spec
//     // Format: Key1 Base64(Value1),Key2 Base64(Value2)
//     const uploadMetadataHeader = req.headers["upload-metadata"] || req.headers["Upload-Metadata"];
//     if (uploadMetadataHeader) {
//         try {
//             // header may be an array or a string
//             const header = Array.isArray(uploadMetadataHeader)
//                 ? uploadMetadataHeader.join(",")
//                 : String(uploadMetadataHeader);

//             const metadata = header
//                 .split(",")
//                 .map((s) => s.trim())
//                 .filter(Boolean)
//                 .reduce((acc, item) => {
//                     const parts = item.split(/\s+/);
//                     const key = parts[0];
//                     const valueB64 = parts.slice(1).join(" ");
//                     if (!key || !valueB64) return acc;
//                     try {
//                         acc[key] = Buffer.from(valueB64, "base64").toString("utf8");
//                     } catch (e) {
//                         // If value isn't valid base64, store raw value
//                         acc[key] = valueB64;
//                     }
//                     return acc;
//                 }, {} as Record<string, string>);

//             // Store metadata in request for later use
//             req.tusMetadata = metadata;
//         } catch (err) {
//             logger.error({ err }, "Error parsing upload metadata");
//         }
//     }
// });

// server.on("onCreate", async (req: any, upload: any) => {
//     // Get user and apikey from request (set by middleware)
//     const user = req.user;
//     const apikey = req.apikey;
//     const signature = req.signature;
//     const metadata = req.tusMetadata || {};

//     logger.info({
//         uploadId: upload.id,
//         user,
//         apikey,
//         signature,
//         metadata,
//         uploadSize: upload.size,
//     }, "TUS onCreate event");

//     if (!user || !apikey) {
//         logger.error("Missing user or apikey in tus onCreate");
//         return;
//     }

//     createTusUpload({
//         userId: user.id,
//         apikey,
//         uploadLength: upload.size,
//         metadata: {
//             filename: metadata.filename || "unknown",
//             mimetype: metadata.mimetype || "application/octet-stream",
//             access: metadata.access,
//             caption: metadata.caption,
//             group: metadata.group || (req.body?.group as string),
//         },
//         signature,
//         tempFilePath: upload.id,
//     }).catch((err) => {
//         logger.error({ err }, "Error creating tus upload record");
//     });
// });

server.on("onResponse", async (req: any, res: any, upload: any) => {
    if (req.method === "PATCH" && upload) {
        try {
            // tus server updates the offset internally before this hook fires
            const offsetHeader = res.getHeader("Upload-Offset");
            const offset = offsetHeader
                ? parseInt(String(offsetHeader), 10)
                : upload.offset;

            await updateTusUploadOffset(upload.id, offset);

            logger.info(
                { uploadId: upload.id, offset },
                "Updated upload offset in DB",
            );
        } catch (err) {
            logger.error({ err }, "Failed to update tus upload offset");
        }
    }
});

server.on("onUploadFinish", async (req: any, upload: any) => {
    logger.info(
        {
            uploadId: upload.id,
            offset: upload.offset,
            size: upload.size,
            metadata: upload.metadata,
        },
        "Tus upload finished (onUploadFinish)",
    );

    // Finalize the upload (move to S3, generate thumbnails, etc.)
    finalizeUpload(upload.id).catch((err) => {
        logger.error(
            { err, uploadId: upload.id },
            "Error finalizing tus upload",
        );
    });
    return {};
});
