import express from "express";
import apikey from "../apikey/middleware";
import {
    getMedia,
    getMediaAssets,
    getMediaDetails,
    getMediaTimeline,
    uploadMedia,
    deleteMedia,
    sealMedia,
    getMediaCount,
    getTotalSpaceOccupied,
} from "./handlers";
import storage from "./storage-middleware";
import {
    authenticateUpload,
    parseUpload,
    preflightUploadSize,
} from "./upload-guards";
import { authenticatedApiLimiter } from "../auth/limiters";
import { DATA_READ_SCOPE, DATA_WRITE_SCOPE } from "../auth/options";
import { requireScope } from "../auth/scopes";

const router = express.Router();

router.post(
    "/create",
    /* 
        #swagger.tags = ['Media']
        #swagger.summary = 'Upload Media'
        #swagger.description = 'Upload a new media file. Use OAuth Bearer auth, API key auth from Authorize (`x-medialit-apikey`), or pass `x-medialit-signature` for this endpoint only.'
        #swagger.security = [{ "bearerAuth": [] }, { "apiKeyAuth": [] }, { "signatureAuth": [] }]
        #swagger.parameters['x-medialit-signature'] = {
            in: 'header',
            description: 'Upload Signature for secure client-side uploads',
            schema: { type: 'string' },
            required: false
        }
        #swagger.requestBody = {
            required: true,
            content: {
                "multipart/form-data": {
                    schema: {
                        type: "object",
                        properties: {
                            file: { type: "string", format: "binary" },
                            caption: { type: "string" },
                            access: { type: "string", enum: ["public", "private"] },
                            group: { type: "string" },
                            assetId: { type: "string", description: "Your own ID for the source of this file. Unique per app, so retrying the same upload cannot create a duplicate." },
                            takenAt: { type: "string", format: "date-time", description: "When the content was captured. Orders the timeline." }
                        },
                        required: ["file"]
                    }
                }
            }
        }
        #swagger.responses[200] = {
            description: 'The created Media object',
            content: {
                "application/json": {
                    schema: { $ref: '#/components/schemas/Media' }
                }
            }
        }
        #swagger.responses[400] = { description: 'Bad Request' }
        #swagger.responses[401] = { description: 'Unauthorized' }
        #swagger.responses[409] = {
            description: 'The app already has a file with this `assetId`. Seal it if `sealed` is false.',
            content: {
                "application/json": {
                    schema: { $ref: '#/components/schemas/AssetExistsResponse' }
                }
            }
        }
        #swagger.responses[404] = {
            description: 'Invalid signature',
            content: {
                "application/json": {
                    schema: { $ref: '#/components/schemas/ErrorResponse' },
                    example: { error: 'Invalid signature' }
                }
            }
        }
        #swagger.responses[500] = { description: 'Internal Server Error' }
    */
    authenticatedApiLimiter,
    // Authenticate and check the declared size before reading the body, so
    // an unauthenticated or oversized upload never reaches the disk.
    authenticateUpload,
    preflightUploadSize,
    parseUpload,
    storage,
    uploadMedia,
);

router.post(
    "/get/count",
    /* 
        #swagger.tags = ['Media']
        #swagger.summary = 'Get Media Count'
        #swagger.description = 'Get the total number of media files.'
        #swagger.security = [{ "bearerAuth": [] }, { "apiKeyAuth": [] }]
        #swagger.responses[200] = {
            description: 'Count retrieved successfully',
            content: {
                "application/json": {
                    schema: { $ref: '#/components/schemas/MediaCountResponse' }
                }
            }
        }
        #swagger.responses[401] = { description: 'Unauthorized' }
    */
    authenticatedApiLimiter,
    apikey,
    requireScope(DATA_READ_SCOPE),
    getMediaCount,
);
router.post(
    "/get/size",
    /* 
        #swagger.tags = ['Media']
        #swagger.summary = 'Get Total Size'
        #swagger.description = 'Get the total size of all media files in bytes.'
        #swagger.security = [{ "bearerAuth": [] }, { "apiKeyAuth": [] }]
        #swagger.responses[200] = {
            description: 'Size retrieved successfully',
            content: {
                "application/json": {
                    schema: { $ref: '#/components/schemas/MediaSizeResponse' }
                }
            }
        }
        #swagger.responses[401] = { description: 'Unauthorized' }
    */
    authenticatedApiLimiter,
    apikey,
    requireScope(DATA_READ_SCOPE),
    getTotalSpaceOccupied,
);
router.post(
    "/get/assets",
    /*
        #swagger.tags = ['Media']
        #swagger.summary = 'Look Up Assets'
        #swagger.description = 'Tells which of your `assetId`s the app already has, sealed or not. Call it before uploading a batch to skip what is already there.'
        #swagger.security = [{ "bearerAuth": [] }, { "apiKeyAuth": [] }]
        #swagger.requestBody = {
            required: true,
            content: {
                "application/json": {
                    schema: { $ref: '#/components/schemas/AssetLookupPayload' }
                }
            }
        }
        #swagger.responses[200] = {
            description: 'The assets that exist',
            content: {
                "application/json": {
                    schema: { $ref: '#/components/schemas/AssetLookupResponse' }
                }
            }
        }
        #swagger.responses[400] = { description: 'Bad Request' }
        #swagger.responses[401] = { description: 'Unauthorized' }
        #swagger.responses[500] = { description: 'Internal Server Error' }
    */
    authenticatedApiLimiter,
    apikey,
    requireScope(DATA_READ_SCOPE),
    getMediaAssets,
);
router.get(
    "/timeline",
    /*
        #swagger.tags = ['Media']
        #swagger.summary = 'Media Timeline'
        #swagger.description = 'Sealed media, newest first by `takenAt`, or by `createdAt` where there is no `takenAt`. Follow `nextCursor` for the next page; pages stay stable while uploads land.'
        #swagger.security = [{ "bearerAuth": [] }, { "apiKeyAuth": [] }]
        #swagger.parameters['limit'] = {
            in: 'query',
            description: 'Items per page, 1 to 200. Defaults to 50.',
            schema: { type: 'integer', minimum: 1, maximum: 200 }
        }
        #swagger.parameters['cursor'] = {
            in: 'query',
            description: 'The nextCursor from the previous page',
            schema: { type: 'string' }
        }
        #swagger.parameters['kind'] = {
            in: 'query',
            schema: { type: 'string', enum: ['image', 'video', 'pdf', 'other'] }
        }
        #swagger.parameters['access'] = {
            in: 'query',
            schema: { type: 'string', enum: ['public', 'private'] }
        }
        #swagger.parameters['group'] = {
            in: 'query',
            schema: { type: 'string' }
        }
        #swagger.responses[200] = {
            description: 'A page of the timeline',
            content: {
                "application/json": {
                    schema: { $ref: '#/components/schemas/TimelineResponse' }
                }
            }
        }
        #swagger.responses[400] = { description: 'Bad Request' }
        #swagger.responses[401] = { description: 'Unauthorized' }
        #swagger.responses[500] = { description: 'Internal Server Error' }
    */
    authenticatedApiLimiter,
    apikey,
    requireScope(DATA_READ_SCOPE),
    getMediaTimeline,
);
router.post(
    "/get/:mediaId",
    /* 
        #swagger.tags = ['Media']
        #swagger.summary = 'Get Media Details'
        #swagger.description = 'Retrieve metadata for a specific media item.'
        #swagger.security = [{ "bearerAuth": [] }, { "apiKeyAuth": [] }]
        #swagger.parameters['mediaId'] = {
            in: 'path',
            description: 'ID of the media file',
            required: true,
            schema: { type: 'string' }
        }
        #swagger.responses[200] = {
            description: 'Media details retrieved successfully',
            content: {
                "application/json": {
                    schema: { $ref: '#/components/schemas/Media' }
                }
            }
        }
        #swagger.responses[401] = { description: 'Unauthorized' }
        #swagger.responses[404] = { description: 'Media not found' }
        #swagger.responses[500] = { description: 'Internal Server Error' }
    */
    authenticatedApiLimiter,
    apikey,
    requireScope(DATA_READ_SCOPE),
    getMediaDetails,
);
router.post(
    "/get",
    /* 
        #swagger.tags = ['Media']
        #swagger.summary = 'List Media'
        #swagger.description = 'List media files filtered by optional query payload.'
        #swagger.security = [{ "bearerAuth": [] }, { "apiKeyAuth": [] }]
        #swagger.requestBody = {
            required: false,
            content: {
                "application/json": {
                    schema: { $ref: '#/components/schemas/GetMediaQuery' }
                }
            }
        }
        #swagger.responses[200] = {
            description: 'List retrieved successfully',
            content: {
                "application/json": {
                    schema: {
                        type: "array",
                        items: { $ref: '#/components/schemas/MediaListItem' }
                    }
                }
            }
        } 
        #swagger.responses[400] = { description: 'Bad Request' }
        #swagger.responses[401] = { description: 'Unauthorized' }
        #swagger.responses[500] = { description: 'Internal Server Error' }
    */
    authenticatedApiLimiter,
    apikey,
    requireScope(DATA_READ_SCOPE),
    getMedia,
);
router.post(
    "/seal/:mediaId",
    /* 
        #swagger.tags = ['Media']
        #swagger.summary = 'Seal Media'
        #swagger.description = 'Seal a media file (mark as processed/finalized).'
        #swagger.security = [{ "bearerAuth": [] }, { "apiKeyAuth": [] }]
        #swagger.parameters['mediaId'] = {
            in: 'path',
            description: 'ID of the media file',
            required: true,
            schema: { type: 'string' }
        }
        #swagger.responses[200] = {
            description: 'The created Media object',
            content: {
                "application/json": {
                    schema: { $ref: '#/components/schemas/Media' }
                }
            }
        }
        #swagger.responses[401] = { description: 'Unauthorized' }
        #swagger.responses[404] = { description: 'Media not found' }
        #swagger.responses[500] = { description: 'Internal Server Error' }
    */
    authenticatedApiLimiter,
    apikey,
    requireScope(DATA_WRITE_SCOPE),
    sealMedia,
);
router.delete(
    "/delete/:mediaId",
    /* 
        #swagger.tags = ['Media']
        #swagger.summary = 'Delete Media'
        #swagger.description = 'Permanently delete a media file.'
        #swagger.security = [{ "bearerAuth": [] }, { "apiKeyAuth": [] }]
        #swagger.parameters['mediaId'] = {
            in: 'path',
            description: 'ID of the media file',
            required: true,
            schema: { type: 'string' }
        }
        #swagger.responses[200] = {
            description: 'Media deleted successfully',
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: { type: "string", example: "success" }
                        }
                    }
                }
            }
        }
        #swagger.responses[401] = { description: 'Unauthorized' }
        #swagger.responses[500] = { description: 'Internal Server Error' }
    */
    authenticatedApiLimiter,
    apikey,
    requireScope(DATA_WRITE_SCOPE),
    deleteMedia,
);

export default router;
